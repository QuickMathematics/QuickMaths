"""Trusted supervisor for QuickMaths' browser-side Python subset grader.

The browser runs this module inside a disposable Pyodide Web Worker. Lesson files
provide declarative function signatures and JSON test data; only learner source
is compiled, after this AST policy accepts it, and it receives a tiny builtins
mapping with no importer, evaluator, file, process, network, clock, or JS bridge.
"""

from __future__ import annotations

import ast
import contextlib
import io
import json
import math
import sys


MAX_SOURCE_CHARS = 12_000
MAX_AST_NODES = 1_200
MAX_AST_DEPTH = 45
MAX_LITERAL_CHARS = 2_000
MAX_INTEGER_BITS = 128

SAFE_BUILTINS = {
    "abs": abs,
    "all": all,
    "any": any,
    "bool": bool,
    "dict": dict,
    "enumerate": enumerate,
    "float": float,
    "int": int,
    "len": len,
    "list": list,
    "max": max,
    "min": min,
    "range": range,
    "round": round,
    "set": set,
    "sorted": sorted,
    "str": str,
    "sum": sum,
    "tuple": tuple,
    "zip": zip,
}

SAFE_METHODS = {
    "append", "extend", "insert", "pop", "remove", "clear", "index", "count",
    "sort", "reverse", "copy", "get", "keys", "values", "items", "update",
    "setdefault", "strip", "lstrip", "rstrip", "lower", "upper", "casefold",
    "split", "splitlines", "join", "replace", "startswith", "endswith",
    "isdigit", "isalpha", "isalnum", "find",
}

ALLOWED_NODE_TYPES = {
    ast.Module, ast.FunctionDef, ast.arguments, ast.arg, ast.Return, ast.Assign,
    ast.AnnAssign, ast.AugAssign, ast.Expr, ast.If, ast.For, ast.While, ast.Break,
    ast.Continue, ast.Pass, ast.BoolOp, ast.BinOp, ast.UnaryOp, ast.Compare,
    ast.Call, ast.Name, ast.Load, ast.Store, ast.Constant, ast.List, ast.Tuple,
    ast.Set, ast.Dict, ast.Subscript, ast.Slice, ast.Attribute, ast.ListComp,
    ast.SetComp, ast.DictComp, ast.GeneratorExp, ast.comprehension, ast.IfExp,
    ast.keyword, ast.JoinedStr, ast.FormattedValue,
    ast.And, ast.Or, ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod,
    ast.Pow, ast.USub, ast.UAdd, ast.Not, ast.Eq, ast.NotEq, ast.Lt, ast.LtE,
    ast.Gt, ast.GtE, ast.In, ast.NotIn, ast.Is, ast.IsNot,
}


class PolicyError(ValueError):
    pass


class StepLimitError(RuntimeError):
    pass


class OutputLimitError(RuntimeError):
    pass


class LimitedOutput(io.StringIO):
    def __init__(self, limit: int):
        super().__init__()
        self.limit = limit

    def write(self, value: str) -> int:
        if self.tell() + len(value) > self.limit:
            raise OutputLimitError("Program output exceeded the configured limit.")
        return super().write(value)


def _tree_depth(node: ast.AST) -> int:
    children = list(ast.iter_child_nodes(node))
    return 1 if not children else 1 + max(_tree_depth(child) for child in children)


class SubsetValidator(ast.NodeVisitor):
    def __init__(self, allowed_builtins: set[str]):
        self.allowed_builtins = allowed_builtins
        self.function_names: set[str] = set()

    def validate(self, tree: ast.Module) -> None:
        nodes = list(ast.walk(tree))
        if len(nodes) > MAX_AST_NODES:
            raise PolicyError("The program is too structurally complex for this sandbox.")
        if _tree_depth(tree) > MAX_AST_DEPTH:
            raise PolicyError("The program is nested too deeply for this sandbox.")
        if any(not isinstance(node, tuple(ALLOWED_NODE_TYPES)) for node in nodes):
            rejected = next(type(node).__name__ for node in nodes if not isinstance(node, tuple(ALLOWED_NODE_TYPES)))
            raise PolicyError(f"Unsupported Python syntax: {rejected}.")
        for statement in tree.body:
            if not isinstance(statement, ast.FunctionDef):
                raise PolicyError("Only function definitions are allowed at the top level.")
            self.function_names.add(statement.name)
        self.visit(tree)

    @staticmethod
    def _check_name(name: str) -> None:
        if name.startswith("_") or "__" in name:
            raise PolicyError("Private and double-underscore names are not available in the sandbox.")

    def visit_Name(self, node: ast.Name) -> None:
        self._check_name(node.id)

    def visit_arg(self, node: ast.arg) -> None:
        self._check_name(node.arg)
        if node.annotation is not None:
            raise PolicyError("Type annotations are not part of python_subset_v1.")

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        self._check_name(node.name)
        if node.decorator_list or node.returns is not None or node.type_comment:
            raise PolicyError("Decorators and annotations are not part of python_subset_v1.")
        if node.args.posonlyargs or node.args.kwonlyargs or node.args.vararg or node.args.kwarg or node.args.defaults or node.args.kw_defaults:
            raise PolicyError("Use ordinary required positional parameters in python_subset_v1.")
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute) -> None:
        self._check_name(node.attr)
        if node.attr not in SAFE_METHODS:
            raise PolicyError(f"Method {node.attr} is not available in python_subset_v1.")
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        if any(keyword.arg is None for keyword in node.keywords):
            raise PolicyError("Expanded keyword arguments are not supported.")
        if isinstance(node.func, ast.Name):
            if node.func.id not in self.allowed_builtins and node.func.id not in self.function_names:
                raise PolicyError(f"Call to {node.func.id} is not available in python_subset_v1.")
        elif not isinstance(node.func, ast.Attribute):
            raise PolicyError("Only named functions and approved value methods may be called.")
        self.generic_visit(node)

    def visit_Constant(self, node: ast.Constant) -> None:
        value = node.value
        if isinstance(value, str) and len(value) > MAX_LITERAL_CHARS:
            raise PolicyError("A string literal is too long.")
        if isinstance(value, int) and value.bit_length() > MAX_INTEGER_BITS:
            raise PolicyError("An integer literal is too large.")
        if isinstance(value, float) and not math.isfinite(value):
            raise PolicyError("Non-finite numeric literals are not supported.")

    def visit_BinOp(self, node: ast.BinOp) -> None:
        if isinstance(node.op, ast.Pow) and isinstance(node.right, ast.Constant):
            if not isinstance(node.right.value, (int, float)) or abs(node.right.value) > 12:
                raise PolicyError("Exponent magnitude is limited to 12.")
        self.generic_visit(node)


def _matches_declared_type(value, declared: str) -> bool:
    if declared == "json":
        try:
            json.dumps(value, allow_nan=False)
            return True
        except (TypeError, ValueError):
            return False
    if declared == "none":
        return value is None
    if declared == "bool":
        return type(value) is bool
    if declared == "int":
        return type(value) is int
    if declared == "float":
        return type(value) in {int, float} and type(value) is not bool and math.isfinite(float(value))
    if declared == "str":
        return type(value) is str
    if declared == "list":
        return type(value) is list
    if declared == "dict":
        return type(value) is dict
    return False


def _json_value(value):
    encoded = json.dumps(value, ensure_ascii=False, allow_nan=False)
    if len(encoded) > 20_000:
        raise RuntimeError("The returned value is too large.")
    return json.loads(encoded)


def _same_value(actual, expected) -> bool:
    if type(expected) is float and type(actual) in {int, float} and type(actual) is not bool:
        return math.isclose(float(actual), expected, rel_tol=1e-9, abs_tol=1e-9)
    return type(actual) is type(expected) and actual == expected


def _error_tests(spec: dict, status: str, message: str) -> list[dict]:
    return [
        {
            "id": test["id"],
            "status": status,
            "visibility": test["visibility"],
            "message": message if test["visibility"] != "hidden" else "A hidden test could not run.",
        }
        for test in spec.get("tests", [])
    ]


def grade_payload(payload_json: str) -> str:
    payload = json.loads(payload_json)
    source = payload.get("source", "")
    spec = payload.get("spec") or {}
    tests = spec.get("tests") or []
    total = len(tests)
    if not isinstance(source, str) or not source.strip():
        return json.dumps({"status": "syntax_error", "score": 0, "passed": 0, "total": total, "tests": _error_tests(spec, "failed", "Write a function before running tests."), "messages": ["Write a function before running tests."], "stdout": ""})
    if len(source) > MAX_SOURCE_CHARS:
        return json.dumps({"status": "policy_error", "score": 0, "passed": 0, "total": total, "tests": _error_tests(spec, "failed", "The program is too long."), "messages": ["The program is too long."], "stdout": ""})
    try:
        tree = ast.parse(source, mode="exec")
    except SyntaxError as error:
        message = f"Syntax error on line {error.lineno or 1}: {error.msg}."
        return json.dumps({"status": "syntax_error", "score": 0, "passed": 0, "total": total, "tests": _error_tests(spec, "failed", message), "messages": [message], "stdout": ""})
    allowed_names = set(spec.get("policy", {}).get("allowed_builtins", []))
    if not allowed_names.issubset(SAFE_BUILTINS):
        message = "The authored builtin policy is not supported."
        return json.dumps({"status": "policy_error", "score": 0, "passed": 0, "total": total, "tests": _error_tests(spec, "failed", message), "messages": [message], "stdout": ""})
    try:
        SubsetValidator(allowed_names).validate(tree)
    except PolicyError as error:
        message = str(error)
        return json.dumps({"status": "policy_error", "score": 0, "passed": 0, "total": total, "tests": _error_tests(spec, "failed", message), "messages": [message], "stdout": ""})

    entrypoint = spec.get("entrypoint") or {}
    entrypoint_name = entrypoint.get("name", "")
    parameter_types = [parameter.get("type", "json") for parameter in entrypoint.get("parameters", [])]
    return_type = entrypoint.get("return_type", "json")
    step_limit = int(spec.get("limits", {}).get("step_limit", 20_000))
    stdout_limit = int(spec.get("limits", {}).get("stdout_chars", 2_000))
    compiled = compile(tree, "<learner>", "exec", dont_inherit=True, optimize=0)
    results = []
    combined_stdout = []

    for test in tests:
        namespace = {"__builtins__": {name: SAFE_BUILTINS[name] for name in allowed_names}}
        output = LimitedOutput(stdout_limit)
        counter = {"steps": 0}

        def tracer(frame, event, arg):
            if event in {"call", "line", "return", "exception"}:
                counter["steps"] += 1
                if counter["steps"] > step_limit:
                    raise StepLimitError("The program exceeded its deterministic step limit.")
            return tracer

        visibility = test.get("visibility", "hidden")
        try:
            with contextlib.redirect_stdout(output):
                exec(compiled, namespace, namespace)
                function = namespace.get(entrypoint_name)
                if not callable(function):
                    raise RuntimeError(f"Define a function named {entrypoint_name}.")
                arguments = json.loads(json.dumps(test.get("args", []), ensure_ascii=False))
                if len(arguments) != len(parameter_types) or any(not _matches_declared_type(value, declared) for value, declared in zip(arguments, parameter_types)):
                    raise RuntimeError("The authored test arguments do not match the declared parameter types.")
                sys.settrace(tracer)
                try:
                    actual = function(*arguments)
                finally:
                    sys.settrace(None)
                if not _matches_declared_type(actual, return_type):
                    raise RuntimeError(f"The function returned a value that is not {return_type}.")
                actual_json = _json_value(actual)
                expected = test.get("expected_return")
                passed = _same_value(actual_json, expected)
                message = "Passed."
                if not passed and visibility != "hidden":
                    message = f"Expected {expected!r}; received {actual_json!r}."
                elif not passed:
                    message = "A hidden test did not pass."
                results.append({"id": test["id"], "status": "passed" if passed else "failed", "visibility": visibility, "message": message})
        except StepLimitError as error:
            results.append({"id": test["id"], "status": "timeout", "visibility": visibility, "message": str(error) if visibility != "hidden" else "A hidden test exceeded the step limit."})
        except Exception as error:  # trusted boundary: return only type and a bounded message
            message = f"{type(error).__name__}: {str(error)[:180]}"
            results.append({"id": test["id"], "status": "runtime_error", "visibility": visibility, "message": message if visibility != "hidden" else "A hidden test raised an error."})
        finally:
            sys.settrace(None)
        if output.getvalue():
            combined_stdout.append(output.getvalue())

    passed = sum(result["status"] == "passed" for result in results)
    status = "passed" if total and passed == total else "incorrect"
    if any(result["status"] == "timeout" for result in results):
        status = "timeout"
    elif any(result["status"] == "runtime_error" for result in results):
        status = "runtime_error"
    return json.dumps({
        "status": status,
        "score": passed / total if total else 0,
        "passed": passed,
        "total": total,
        "tests": results,
        "messages": [f"{passed} of {total} sandbox tests passed."],
        "stdout": "".join(combined_stdout)[:stdout_limit],
    }, ensure_ascii=False)

