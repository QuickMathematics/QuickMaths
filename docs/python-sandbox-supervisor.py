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
import re
import sys


MAX_SOURCE_CHARS = 12_000
MAX_AST_NODES = 1_200
MAX_AST_DEPTH = 45
MAX_LITERAL_CHARS = 2_000
MAX_INTEGER_BITS = 128
MAX_PAYLOAD_BYTES = 180_000
MAX_TESTS = 30
MAX_PARAMETERS = 8
MAX_JSON_VALUE_BYTES = 20_000
MAX_JSON_DEPTH = 10
MAX_COLLECTION_ITEMS = 1_000
MAX_ABS_INPUT_INTEGER = 1_000_000
MAX_TOTAL_STDOUT_CHARS = 4_000
MAX_RESULT_MESSAGE_CHARS = 500
MAX_MULTIPLIER = 100_000
SUPPORTED_VALUE_TYPES = {"json", "none", "bool", "int", "float", "str", "list", "dict"}
SAFE_IDENTIFIER = re.compile(r"^[A-Za-z][A-Za-z0-9_]{0,59}$")

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


def safe_range(*arguments):
    if not 1 <= len(arguments) <= 3 or any(type(value) is not int for value in arguments):
        raise TypeError("range expects one to three integers.")
    result = range(*arguments)
    if len(result) > MAX_MULTIPLIER:
        raise RuntimeError(f"range is limited to {MAX_MULTIPLIER} values.")
    return result


SAFE_BUILTINS["range"] = safe_range


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
        if isinstance(node.op, ast.Mult):
            constants = [candidate.value for candidate in (node.left, node.right) if isinstance(candidate, ast.Constant)]
            if any(type(value) is int and abs(value) > MAX_MULTIPLIER for value in constants):
                raise PolicyError(f"Literal repetition is limited to {MAX_MULTIPLIER} items.")
        self.generic_visit(node)


def _json_size(value) -> int:
    return len(json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8"))


def _validate_json_value(value, label: str, depth: int = 0) -> None:
    if depth > MAX_JSON_DEPTH:
        raise PolicyError(f"{label} is nested too deeply.")
    if value is None or type(value) is bool:
        return
    if type(value) is int:
        if abs(value) > MAX_ABS_INPUT_INTEGER:
            raise PolicyError(f"{label} contains an integer outside the supported range.")
        return
    if type(value) is float:
        if not math.isfinite(value) or abs(value) > MAX_ABS_INPUT_INTEGER:
            raise PolicyError(f"{label} contains a number outside the supported range.")
        return
    if type(value) is str:
        if len(value) > MAX_LITERAL_CHARS:
            raise PolicyError(f"{label} contains text that is too long.")
        return
    if type(value) is list:
        if len(value) > MAX_COLLECTION_ITEMS:
            raise PolicyError(f"{label} contains too many items.")
        for item in value:
            _validate_json_value(item, label, depth + 1)
        return
    if type(value) is dict:
        if len(value) > MAX_COLLECTION_ITEMS:
            raise PolicyError(f"{label} contains too many items.")
        for key, item in value.items():
            if type(key) is not str or len(key) > 120 or key in {"__proto__", "prototype", "constructor"}:
                raise PolicyError(f"{label} contains an invalid object key.")
            _validate_json_value(item, label, depth + 1)
        return
    raise PolicyError(f"{label} contains an unsupported value.")


def _validated_spec(candidate) -> dict:
    if type(candidate) is not dict or candidate.get("runtime") != "python_subset_v1":
        raise PolicyError("The Python grader specification is invalid.")
    if set(candidate) - {"runtime", "entrypoint", "tests", "limits", "policy"}:
        raise PolicyError("The Python grader specification contains unsupported fields.")
    entrypoint = candidate.get("entrypoint")
    if type(entrypoint) is not dict or set(entrypoint) - {"kind", "name", "parameters", "return_type"}:
        raise PolicyError("The Python entrypoint specification is invalid.")
    if entrypoint.get("kind") != "function" or not SAFE_IDENTIFIER.fullmatch(entrypoint.get("name", "")):
        raise PolicyError("The Python entrypoint must be a named function.")
    parameters = entrypoint.get("parameters")
    if type(parameters) is not list or len(parameters) > MAX_PARAMETERS:
        raise PolicyError(f"The Python entrypoint supports at most {MAX_PARAMETERS} parameters.")
    names = []
    for parameter in parameters:
        if type(parameter) is not dict or set(parameter) != {"name", "type"}:
            raise PolicyError("A Python parameter specification is invalid.")
        if not SAFE_IDENTIFIER.fullmatch(parameter["name"]) or parameter["name"].startswith("_"):
            raise PolicyError("A Python parameter name is invalid.")
        if parameter["type"] not in SUPPORTED_VALUE_TYPES - {"none"}:
            raise PolicyError("A Python parameter type is invalid.")
        names.append(parameter["name"])
    if len(set(names)) != len(names) or entrypoint.get("return_type", "json") not in SUPPORTED_VALUE_TYPES:
        raise PolicyError("The Python function signature is invalid.")
    tests = candidate.get("tests")
    if type(tests) is not list or not 1 <= len(tests) <= MAX_TESTS:
        raise PolicyError(f"The Python grader needs 1 to {MAX_TESTS} tests.")
    test_ids = []
    for test in tests:
        if type(test) is not dict or set(test) - {"id", "args", "expected_return", "visibility"}:
            raise PolicyError("A Python test specification is invalid.")
        test_id = test.get("id", "")
        visibility = test.get("visibility", "hidden")
        arguments = test.get("args")
        if not SAFE_IDENTIFIER.fullmatch(test_id) or visibility not in {"example", "after_submission", "hidden"}:
            raise PolicyError("A Python test identifier or visibility is invalid.")
        if type(arguments) is not list or len(arguments) != len(parameters):
            raise PolicyError("A Python test has the wrong number of arguments.")
        _validate_json_value(arguments, f"Test {test_id} arguments")
        _validate_json_value(test.get("expected_return"), f"Test {test_id} expected value")
        if _json_size(arguments) > MAX_JSON_VALUE_BYTES or _json_size(test.get("expected_return")) > MAX_JSON_VALUE_BYTES:
            raise PolicyError(f"Test {test_id} data is too large.")
        test_ids.append(test_id)
    if len(set(test_ids)) != len(test_ids):
        raise PolicyError("Python test identifiers must be unique.")
    limits = candidate.get("limits")
    if type(limits) is not dict or set(limits) - {"wall_time_ms", "step_limit", "memory_mb", "stdout_chars"}:
        raise PolicyError("The Python resource policy is invalid.")
    supported_ranges = {"wall_time_ms": (250, 3000), "step_limit": (100, 50_000), "memory_mb": (16, 64), "stdout_chars": (0, 4000)}
    for name, (minimum, maximum) in supported_ranges.items():
        value = limits.get(name)
        if type(value) is not int or not minimum <= value <= maximum:
            raise PolicyError(f"Python limit {name} is outside the supported range.")
    policy = candidate.get("policy")
    if type(policy) is not dict or set(policy) != {"allowed_builtins", "imports", "network", "storage", "clock", "randomness"}:
        raise PolicyError("The Python capability policy is invalid.")
    allowed = policy.get("allowed_builtins")
    if type(allowed) is not list or len(allowed) > len(SAFE_BUILTINS) or any(type(name) is not str or name not in SAFE_BUILTINS for name in allowed):
        raise PolicyError("The Python builtin policy is invalid.")
    if policy.get("imports") != [] or any(policy.get(name) is not False for name in ("network", "storage", "clock", "randomness")):
        raise PolicyError("Python capabilities must be explicitly disabled.")
    return candidate


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
    if len(encoded.encode("utf-8")) > MAX_JSON_VALUE_BYTES:
        raise RuntimeError("The returned value is too large.")
    return json.loads(encoded)


def _same_value(actual, expected) -> bool:
    if type(expected) is float and type(actual) in {int, float} and type(actual) is not bool:
        return math.isclose(float(actual), expected, rel_tol=1e-9, abs_tol=1e-9)
    return type(actual) is type(expected) and actual == expected


def _error_tests(spec: dict, status: str, message: str) -> list[dict]:
    return [
        {
            "id": str(test.get("id", "test"))[:60],
            "status": status,
            "visibility": test["visibility"],
            "message": message if test["visibility"] != "hidden" else "A hidden test could not run.",
        }
        for test in spec.get("tests", [])[:MAX_TESTS] if type(test) is dict
    ]


def grade_payload(payload_json: str) -> str:
    if not isinstance(payload_json, str) or len(payload_json.encode("utf-8")) > MAX_PAYLOAD_BYTES:
        raise PolicyError("The Python grading payload is too large.")
    payload = json.loads(payload_json)
    if type(payload) is not dict or set(payload) != {"source", "spec"}:
        raise PolicyError("The Python grading payload is invalid.")
    source = payload.get("source", "")
    raw_spec = payload.get("spec") or {}
    try:
        spec = _validated_spec(raw_spec)
    except (PolicyError, TypeError, ValueError) as error:
        message = str(error)[:MAX_RESULT_MESSAGE_CHARS]
        tests = raw_spec.get("tests", []) if type(raw_spec) is dict else []
        safe_spec = {"tests": tests[:MAX_TESTS] if type(tests) is list else []}
        return json.dumps({"status": "policy_error", "score": 0, "passed": 0, "total": len(safe_spec["tests"]), "tests": _error_tests(safe_spec, "failed", message), "messages": [message], "stdout": ""})
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
    remaining_stdout = min(stdout_limit, MAX_TOTAL_STDOUT_CHARS)

    for test in tests:
        namespace = {"__builtins__": {name: SAFE_BUILTINS[name] for name in allowed_names}}
        output = LimitedOutput(remaining_stdout)
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
            message = f"{type(error).__name__}: {str(error)[:180]}"[:MAX_RESULT_MESSAGE_CHARS]
            results.append({"id": test["id"], "status": "runtime_error", "visibility": visibility, "message": message if visibility != "hidden" else "A hidden test raised an error."})
        finally:
            sys.settrace(None)
        if output.getvalue() and remaining_stdout:
            captured = output.getvalue()[:remaining_stdout]
            combined_stdout.append(captured)
            remaining_stdout -= len(captured)

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
        "stdout": "".join(combined_stdout),
    }, ensure_ascii=False)
