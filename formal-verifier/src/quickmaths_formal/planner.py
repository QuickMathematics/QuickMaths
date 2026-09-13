from __future__ import annotations

from copy import deepcopy
from typing import Any

import sympy as sp

from .contract import canonical_hash, normalize_request
from .logic import same as same_logic, scope_variable_types, substitute_prop, witness_type_compatible
from .semantics import nonnegative, requirements_for_goal
from .typing import function_type_parts, infer_expr_type, set_element_type
from .symbolic import (
    expr_to_sympy,
    is_polynomial_identity,
    is_rational_identity,
    linear_entails,
    obvious_polynomial_relation,
    prop_to_sympy,
    variables_for,
)


def _goal(prop: dict[str, Any]) -> dict[str, Any]:
    return {"kind": "proposition", "proposition": prop}


class StructuredPlanner:
    """Bounded, deterministic candidate proof construction for proposition goals.

    This planner is deliberately outside the trusted boundary. Every step it
    inserts is re-normalized, run through rule preflight, rendered to Lean, and
    must be accepted by the pinned kernel before a certificate can say verified.
    """

    def __init__(self, raw_request: Any, *, max_steps: int = 16, max_depth: int = 12) -> None:
        self.request = normalize_request(raw_request)
        self.max_steps = max_steps
        self.max_depth = max_depth
        self.added: list[dict[str, Any]] = []
        self._counter = 0
        self._active: set[tuple[str, str]] = set()
        self._active_elims: set[str] = set()

    def _allowed(self, rule: str) -> bool:
        allowed = self.request["policy"]["allowed_rules"]
        return not allowed or rule in allowed

    def _next(self, prefix: str) -> str:
        existing = {
            *(row["id"] for row in self.request["assumptions"]),
            *(row["id"] for row in self.request["steps"]),
            *(row["id"] for row in self.request["scopes"]),
            *(binder["id"] for scope in self.request["scopes"] for binder in scope.get("binders", [])),
        }
        while True:
            self._counter += 1
            candidate = f"auto_{prefix}_{self._counter}"
            if candidate not in existing:
                return candidate

    def _ancestors(self, scope: str) -> set[str]:
        parents = {row["id"]: row["parent"] for row in self.request["scopes"]}
        result: set[str] = set()
        current: str | None = scope
        while current is not None:
            result.add(current)
            current = parents[current]
        return result

    def _context(self, scope: str) -> list[tuple[str, dict[str, Any]]]:
        ancestors = self._ancestors(scope)
        rows: list[tuple[str, dict[str, Any]]] = []
        for row in self.request["assumptions"]:
            if row["scope"] in ancestors:
                rows.append((row["id"], row["claim"]))
        for row in self.request["steps"]:
            if row["scope"] in ancestors and row["claim"].get("kind") == "proposition":
                rows.append((row["id"], row["claim"]["proposition"]))
        return rows

    def _find(self, prop: dict[str, Any], scope: str) -> str | None:
        for identifier, claim in self._context(scope):
            if same_logic(claim, prop):
                return identifier
        return None

    def _snapshot(self):
        return deepcopy(self.request), len(self.added), self._counter

    def _restore(self, snapshot) -> None:
        request, added_len, counter = snapshot
        self.request = request
        del self.added[added_len:]
        self._counter = counter

    def _add_scope_assumption(self, parent: str, claim: dict[str, Any]) -> tuple[str, str]:
        scope_id = self._next("scope")
        assumption_id = self._next("assumption")
        candidate = {
            **self.request,
            "scopes": [*self.request["scopes"], {"id": scope_id, "parent": parent}],
            "assumptions": [*self.request["assumptions"], {"id": assumption_id, "scope": scope_id, "claim": claim}],
        }
        self.request = normalize_request(candidate)
        return scope_id, assumption_id

    def _add_scope_binder(self, parent: str, binder: dict[str, str]) -> str:
        scope_id = self._next("scope")
        candidate = {
            **self.request,
            "scopes": [*self.request["scopes"], {"id": scope_id, "parent": parent, "binders": [dict(binder)]}],
        }
        self.request = normalize_request(candidate)
        return scope_id

    def _add_scope_binder_assumption(
        self, parent: str, binder_type: str, body: dict[str, Any], source_binder_id: str
    ) -> tuple[str, str, str]:
        binder_id = self._next("witness")
        scope_id = self._next("scope")
        assumption_id = self._next("assumption")
        binder = {"id": binder_id, "type": binder_type}
        instantiated = substitute_prop(body, source_binder_id, {"kind": "var", "id": binder_id})
        candidate = {
            **self.request,
            "scopes": [*self.request["scopes"], {"id": scope_id, "parent": parent, "binders": [binder]}],
            "assumptions": [*self.request["assumptions"], {"id": assumption_id, "scope": scope_id, "claim": instantiated}],
        }
        self.request = normalize_request(candidate)
        return scope_id, binder_id, assumption_id

    def _add_step(
        self,
        scope: str,
        prop: dict[str, Any],
        rule: str,
        premises: list[str] | None = None,
        parameters: dict[str, Any] | None = None,
    ) -> str | None:
        if not self._allowed(rule) or len(self.added) >= self.max_steps:
            return None
        identifier = self._next("proof")
        row = {
            "id": identifier,
            "scope": scope,
            "claim": _goal(prop),
            "rule": rule,
            "premises": list(premises or []),
            "parameters": dict(parameters or {}),
        }
        try:
            self.request = normalize_request({**self.request, "steps": [*self.request["steps"], row]})
        except Exception:
            return None
        self.added.append(row)
        return identifier

    def _candidate_witnesses(self, scope: str = "root") -> list[dict[str, Any]]:
        symbols = variables_for(self.request, scope)
        rows = [{"kind": "var", "id": identifier} for identifier in symbols]
        rows.extend({"kind": "int", "value": value} for value in range(-3, 4))
        return rows

    def _constant_true(self, prop: dict[str, Any], scope: str) -> bool:
        try:
            symbols = variables_for(self.request, scope)
            value = prop_to_sympy(prop, symbols)
            if getattr(value, "free_symbols", set()):
                return False
            simplified = sp.simplify(value)
            return simplified is sp.true or simplified == True  # noqa: E712
        except Exception:
            return False

    def _polynomial_degree(self, prop: dict[str, Any], scope: str) -> int | None:
        if prop.get("kind") not in {"eq", "ne", "lt", "le", "gt", "ge"}:
            return None
        try:
            symbols = variables_for(self.request, scope)
            left = expr_to_sympy(prop["left"], symbols)
            right = expr_to_sympy(prop["right"], symbols)
            expression = sp.expand(left - right)
            if not expression.free_symbols:
                return 0
            polynomial = sp.Poly(expression, *sorted(expression.free_symbols, key=lambda item: item.name))
            return int(polynomial.total_degree())
        except Exception:
            return None

    def _arithmetic_context(self, scope: str) -> tuple[list[str], int | None]:
        premise_ids: list[str] = []
        degree = 0
        for identifier, claim in self._context(scope):
            if claim.get("kind") not in {"eq", "ne", "lt", "le", "gt", "ge"}:
                continue
            item_degree = self._polynomial_degree(claim, scope)
            if item_degree is None:
                continue
            premise_ids.append(identifier)
            degree = max(degree, item_degree)
        return premise_ids, degree

    def _materialize_arithmetic_conjuncts(self, scope: str) -> None:
        """Expose relational conjuncts as ordinary proof nodes for arithmetic tactics.

        Interval hypotheses naturally arrive as ``a <= x ∧ x <= b``.  Lean's
        ``linarith`` should consume explicit relational hypotheses rather than
        relying on an opaque conjunction, so the planner inserts ordinary
        ``and_elim_left/right`` steps before attempting arithmetic.
        """
        arithmetic = {"eq", "ne", "lt", "le", "gt", "ge"}

        def contains(prop: dict[str, Any]) -> bool:
            kind = prop.get("kind")
            if kind in arithmetic:
                return True
            if kind == "and":
                return contains(prop.get("left", {})) or contains(prop.get("right", {}))
            return False

        def expose(identifier: str, prop: dict[str, Any]) -> None:
            if prop.get("kind") != "and":
                return
            for side, rule in (("left", "and_elim_left"), ("right", "and_elim_right")):
                child = prop[side]
                if not contains(child) or not self._allowed(rule):
                    continue
                child_id = self._find(child, scope)
                if child_id is None:
                    child_id = self._add_step(scope, child, rule, [identifier])
                if child_id is not None and child.get("kind") == "and":
                    expose(child_id, child)

        for identifier, claim in list(self._context(scope)):
            if claim.get("kind") == "and" and contains(claim):
                expose(identifier, claim)

    def prove(self, prop: dict[str, Any], scope: str = "root", *, depth: int = 0) -> str | None:
        if depth > self.max_depth or len(self.added) >= self.max_steps:
            return None
        existing = self._find(prop, scope)
        if existing is not None:
            return existing
        key = (scope, canonical_hash(prop))
        if key in self._active:
            return None
        self._active.add(key)
        try:
            return self._prove_inner(prop, scope, depth)
        finally:
            self._active.discard(key)

    def _prove_inner(self, prop: dict[str, Any], scope: str, depth: int) -> str | None:
        kind = prop["kind"]
        context = self._context(scope)
        by_hash = {canonical_hash(claim): identifier for identifier, claim in context}

        if kind == "true":
            return self._add_step(scope, prop, "true_intro")

        if kind == "and":
            snapshot = self._snapshot()
            left = self.prove(prop["left"], scope, depth=depth + 1)
            right = self.prove(prop["right"], scope, depth=depth + 1) if left is not None else None
            if left is not None and right is not None:
                result = self._add_step(scope, prop, "and_intro", [left, right])
                if result is not None:
                    return result
            self._restore(snapshot)

        if kind == "or":
            for side, rule in (("left", "or_intro_left"), ("right", "or_intro_right")):
                snapshot = self._snapshot()
                proof = self.prove(prop[side], scope, depth=depth + 1)
                if proof is not None:
                    result = self._add_step(scope, prop, rule, [proof])
                    if result is not None:
                        return result
                self._restore(snapshot)

        if kind == "implies" and self._allowed("imp_intro"):
            snapshot = self._snapshot()
            child_scope, assumption = self._add_scope_assumption(scope, prop["left"])
            conclusion = self.prove(prop["right"], child_scope, depth=depth + 1)
            if conclusion is not None:
                result = self._add_step(scope, prop, "imp_intro", [assumption, conclusion])
                if result is not None:
                    return result
            self._restore(snapshot)

        if kind == "not" and self._allowed("not_intro"):
            snapshot = self._snapshot()
            child_scope, assumption = self._add_scope_assumption(scope, prop["arg"])
            conclusion = self.prove({"kind": "false"}, child_scope, depth=depth + 1)
            if conclusion is not None:
                result = self._add_step(scope, prop, "not_intro", [assumption, conclusion])
                if result is not None:
                    return result
            self._restore(snapshot)

        if kind == "iff":
            snapshot = self._snapshot()
            forward_prop = {"kind": "implies", "left": prop["left"], "right": prop["right"]}
            backward_prop = {"kind": "implies", "left": prop["right"], "right": prop["left"]}
            forward = self.prove(forward_prop, scope, depth=depth + 1)
            backward = self.prove(backward_prop, scope, depth=depth + 1) if forward is not None else None
            if forward is not None and backward is not None:
                result = self._add_step(scope, prop, "iff_intro", [forward, backward])
                if result is not None:
                    return result
            self._restore(snapshot)

        if kind == "false":
            for neg_id, claim in context:
                if claim.get("kind") == "not":
                    positive = self._find(claim["arg"], scope)
                    if positive is not None:
                        result = self._add_step(scope, prop, "contradiction", [positive, neg_id])
                        if result is not None:
                            return result

        false_id = by_hash.get(canonical_hash({"kind": "false"}))
        if false_id is not None and kind != "false":
            result = self._add_step(scope, prop, "false_elim", [false_id])
            if result is not None:
                return result

        target_hash = canonical_hash(prop)
        for identifier, claim in context:
            if claim.get("kind") == "and":
                if canonical_hash(claim["left"]) == target_hash:
                    result = self._add_step(scope, prop, "and_elim_left", [identifier])
                    if result is not None:
                        return result
                if canonical_hash(claim["right"]) == target_hash:
                    result = self._add_step(scope, prop, "and_elim_right", [identifier])
                    if result is not None:
                        return result

        if kind == "mem" and self._allowed("subset_elim"):
            for subset_id, subset in context:
                if subset.get("kind") != "subset" or not same_logic(subset["right"], prop["right"]):
                    continue
                source = {"kind": "mem", "left": prop["left"], "right": subset["left"]}
                source_id = self.prove(source, scope, depth=depth + 1)
                if source_id is not None:
                    result = self._add_step(scope, prop, "subset_elim", [subset_id, source_id])
                    if result is not None:
                        return result

        if self._allowed("eq_subst"):
            for equality_id, equality in context:
                if equality.get("kind") != "eq":
                    continue
                for source_id, source in context:
                    if source_id == equality_id:
                        continue
                    for variable_side, replacement in ((equality["left"], equality["right"]), (equality["right"], equality["left"])):
                        if variable_side.get("kind") != "var":
                            continue
                        try:
                            transported = substitute_prop(source, variable_side["id"], replacement)
                        except (KeyError, ValueError):
                            continue
                        if same_logic(transported, prop):
                            result = self._add_step(scope, prop, "eq_subst", [equality_id, source_id])
                            if result is not None:
                                return result

        if kind == "eq" and self._allowed("congr_arg"):
            left = prop["left"]
            right = prop["right"]
            if left.get("kind") == "apply" and right.get("kind") == "apply" and same_logic(left["function"], right["function"]):
                source = {"kind": "eq", "left": left["arg"], "right": right["arg"]}
                source_id = self._find(source, scope)
                if source_id is not None:
                    result = self._add_step(scope, prop, "congr_arg", [source_id])
                    if result is not None:
                        return result

        for implication_id, implication in context:
            if implication.get("kind") != "implies" or canonical_hash(implication["right"]) != target_hash:
                continue
            snapshot = self._snapshot()
            antecedent = self.prove(implication["left"], scope, depth=depth + 1)
            if antecedent is not None:
                result = self._add_step(scope, prop, "modus_ponens", [implication_id, antecedent])
                if result is not None:
                    return result
            self._restore(snapshot)

        for iff_id, equivalence in context:
            if equivalence.get("kind") != "iff":
                continue
            if canonical_hash(equivalence["right"]) == target_hash:
                snapshot = self._snapshot()
                source = self.prove(equivalence["left"], scope, depth=depth + 1)
                if source is not None:
                    result = self._add_step(scope, prop, "iff_mp", [iff_id, source])
                    if result is not None:
                        return result
                self._restore(snapshot)
            if canonical_hash(equivalence["left"]) == target_hash:
                snapshot = self._snapshot()
                source = self.prove(equivalence["right"], scope, depth=depth + 1)
                if source is not None:
                    result = self._add_step(scope, prop, "iff_mpr", [iff_id, source])
                    if result is not None:
                        return result
                self._restore(snapshot)

        # Existential elimination: unpack one witness in a direct child scope,
        # prove a witness-independent target there, then discharge witness+hypothesis.
        if self._allowed("exists_elim"):
            for existential_id, existential in context:
                if existential.get("kind") != "exists" or existential_id in self._active_elims:
                    continue
                snapshot = self._snapshot()
                self._active_elims.add(existential_id)
                try:
                    child_scope, _binder_id, local_assumption = self._add_scope_binder_assumption(
                        scope,
                        existential["binder"]["type"],
                        existential["body"],
                        existential["binder"]["id"],
                    )
                    child_conclusion = self.prove(prop, child_scope, depth=depth + 1)
                    if child_conclusion is not None:
                        result = self._add_step(
                            scope,
                            prop,
                            "exists_elim",
                            [existential_id, local_assumption, child_conclusion],
                        )
                        if result is not None:
                            return result
                finally:
                    self._active_elims.discard(existential_id)
                self._restore(snapshot)

        # Proof by cases: if P ∨ Q is available, prove the same target under
        # each branch assumption and discharge both child scopes explicitly.
        if self._allowed("or_elim"):
            for disjunction_id, disjunction in context:
                # Do not recursively split the same disjunction while proving one
                # of its own branches. Without this guard, an ancestor P ∨ Q can
                # be re-used indefinitely inside the P branch before the planner
                # ever tries the sibling Q branch. The resulting nested scopes are
                # logically redundant and can exhaust the depth/step budgets.
                if disjunction.get("kind") != "or" or disjunction_id in self._active_elims:
                    continue
                snapshot = self._snapshot()
                self._active_elims.add(disjunction_id)
                try:
                    left_scope, left_assumption = self._add_scope_assumption(scope, disjunction["left"])
                    left_conclusion = self.prove(prop, left_scope, depth=depth + 1)
                    if left_conclusion is None:
                        self._restore(snapshot)
                        continue
                    right_scope, right_assumption = self._add_scope_assumption(scope, disjunction["right"])
                    right_conclusion = self.prove(prop, right_scope, depth=depth + 1)
                    if right_conclusion is None:
                        self._restore(snapshot)
                        continue
                    result = self._add_step(
                        scope,
                        prop,
                        "or_elim",
                        [disjunction_id, left_assumption, left_conclusion, right_assumption, right_conclusion],
                    )
                    if result is not None:
                        return result
                finally:
                    self._active_elims.discard(disjunction_id)
                self._restore(snapshot)

        if kind == "forall" and self._allowed("forall_intro"):
            snapshot = self._snapshot()
            child_scope = self._add_scope_binder(scope, prop["binder"])
            conclusion = self.prove(prop["body"], child_scope, depth=depth + 1)
            if conclusion is not None:
                result = self._add_step(scope, prop, "forall_intro", [conclusion])
                if result is not None:
                    return result
            self._restore(snapshot)

        if kind == "forall" and prop["binder"]["type"] == "nat" and self._allowed("nat_induction"):
            snapshot = self._snapshot()
            base_prop = substitute_prop(prop["body"], prop["binder"]["id"], {"kind": "int", "value": 0})
            base = self.prove(base_prop, scope, depth=depth + 1)
            if base is not None:
                child_scope, binder_id, ih_id = self._add_scope_binder_assumption(
                    scope, "nat", prop["body"], prop["binder"]["id"]
                )
                k_expr = {"kind": "var", "id": binder_id}
                successor = {"kind": "add", "left": k_expr, "right": {"kind": "int", "value": 1}}
                successor_prop = substitute_prop(prop["body"], prop["binder"]["id"], successor)
                step_proof = self.prove(successor_prop, child_scope, depth=depth + 1)
                if step_proof is not None:
                    result = self._add_step(scope, prop, "nat_induction", [base, ih_id, step_proof])
                    if result is not None:
                        return result
            self._restore(snapshot)

        if kind == "exists":
            for witness in self._candidate_witnesses(scope):
                if not witness_type_compatible(self.request, prop["binder"]["type"], witness, scope=scope):
                    continue
                snapshot = self._snapshot()
                body = substitute_prop(prop["body"], prop["binder"]["id"], witness)
                body_proof = self.prove(body, scope, depth=depth + 1)
                if body_proof is not None:
                    result = self._add_step(scope, prop, "exists_intro", [body_proof], {"witness": witness})
                    if result is not None:
                        return result
                self._restore(snapshot)

        for universal_id, universal in context:
            if universal.get("kind") != "forall":
                continue
            for witness in self._candidate_witnesses(scope):
                if not witness_type_compatible(self.request, universal["binder"]["type"], witness, scope=scope):
                    continue
                instantiated = substitute_prop(universal["body"], universal["binder"]["id"], witness)
                if canonical_hash(instantiated) == target_hash:
                    result = self._add_step(scope, prop, "forall_elim", [universal_id], {"witness": witness})
                    if result is not None:
                        return result
                    continue
                if instantiated.get("kind") == "implies" and canonical_hash(instantiated["right"]) == target_hash:
                    snapshot = self._snapshot()
                    implication_id = self._add_step(
                        scope, instantiated, "forall_elim", [universal_id], {"witness": witness}
                    )
                    antecedent = self.prove(instantiated["left"], scope, depth=depth + 1) if implication_id else None
                    if implication_id is not None and antecedent is not None:
                        result = self._add_step(scope, prop, "modus_ponens", [implication_id, antecedent])
                        if result is not None:
                            return result
                    self._restore(snapshot)

        variables = scope_variable_types(self.request, scope)
        if kind == "eq":
            left_type = infer_expr_type(prop["left"], variables)
            right_type = infer_expr_type(prop["right"], variables)
            if left_type == right_type and self._allowed("function_ext"):
                parts = function_type_parts(left_type)
                if parts is not None:
                    binder_id = self._next("arg")
                    x = {"kind": "var", "id": binder_id}
                    pointwise = {
                        "kind": "forall",
                        "binder": {"id": binder_id, "type": parts[0]},
                        "body": {
                            "kind": "eq",
                            "left": {"kind": "apply", "function": prop["left"], "arg": x},
                            "right": {"kind": "apply", "function": prop["right"], "arg": x},
                        },
                    }
                    pointwise_id = self.prove(pointwise, scope, depth=depth + 1)
                    if pointwise_id is not None:
                        result = self._add_step(scope, prop, "function_ext", [pointwise_id])
                        if result is not None:
                            return result
            if left_type == right_type and self._allowed("set_ext"):
                element_type = set_element_type(left_type)
                if element_type is not None:
                    binder_id = self._next("element")
                    x = {"kind": "var", "id": binder_id}
                    membership = {
                        "kind": "forall",
                        "binder": {"id": binder_id, "type": element_type},
                        "body": {
                            "kind": "iff",
                            "left": {"kind": "mem", "left": x, "right": prop["left"]},
                            "right": {"kind": "mem", "left": x, "right": prop["right"]},
                        },
                    }
                    membership_id = self.prove(membership, scope, depth=depth + 1)
                    if membership_id is not None:
                        result = self._add_step(scope, prop, "set_ext", [membership_id])
                        if result is not None:
                            return result

        if kind == "subset" and self._allowed("subset_intro"):
            set_type = infer_expr_type(prop["left"], variables)
            element_type = set_element_type(set_type)
            if element_type is not None and infer_expr_type(prop["right"], variables) == set_type:
                binder_id = self._next("element")
                x = {"kind": "var", "id": binder_id}
                elementwise = {
                    "kind": "forall",
                    "binder": {"id": binder_id, "type": element_type},
                    "body": {
                        "kind": "implies",
                        "left": {"kind": "mem", "left": x, "right": prop["left"]},
                        "right": {"kind": "mem", "left": x, "right": prop["right"]},
                    },
                }
                elementwise_id = self.prove(elementwise, scope, depth=depth + 1)
                if elementwise_id is not None:
                    result = self._add_step(scope, prop, "subset_intro", [elementwise_id])
                    if result is not None:
                        return result

        # Domain bridge: a ≠ b establishes a - b ≠ 0.
        if kind == "ne" and prop.get("right") == {"kind": "int", "value": 0} and prop.get("left", {}).get("kind") == "sub":
            source = {"kind": "ne", "left": prop["left"]["left"], "right": prop["left"]["right"]}
            source_id = self._find(source, scope)
            if source_id is not None:
                result = self._add_step(scope, prop, "sub_ne_zero_from_ne", [source_id])
                if result is not None:
                    return result

        symbols = variables_for(self.request, scope)
        goal = _goal(prop)
        if kind == "eq" and canonical_hash(prop["left"]) == canonical_hash(prop["right"]):
            result = self._add_step(scope, prop, "eq_refl")
            if result is not None:
                return result
        if kind == "eq" and is_polynomial_identity(prop, symbols):
            result = self._add_step(scope, prop, "ring_identity")
            if result is not None:
                return result
        if kind == "eq" and is_rational_identity(prop, symbols):
            snapshot = self._snapshot()
            guards: list[str] = []
            ok = True
            for requirement in requirements_for_goal(goal):
                if requirement.code != "denominator_nonzero":
                    continue
                guard = self.prove(requirement.claim, scope, depth=depth + 1)
                if guard is None:
                    ok = False
                    break
                guards.append(guard)
            if ok:
                result = self._add_step(scope, prop, "field_identity", guards)
                if result is not None:
                    return result
            self._restore(snapshot)

        # sqrt(a^2)=a when nonnegativity is available/provable.
        if kind == "eq" and prop.get("left", {}).get("kind") == "sqrt":
            inner = prop["left"]["arg"]
            if inner.get("kind") == "pow" and inner.get("exponent") == 2 and canonical_hash(inner.get("base")) == canonical_hash(prop.get("right")):
                snapshot = self._snapshot()
                argument = inner["base"]
                guard = self.prove(nonnegative(argument), scope, depth=depth + 1)
                if guard is not None:
                    result = self._add_step(scope, prop, "sqrt_square_nonnegative", [guard], {"argument": argument})
                    if result is not None:
                        return result
                self._restore(snapshot)

        if kind in {"eq", "lt", "le", "gt", "ge"}:
            arithmetic_snapshot = self._snapshot()
            self._materialize_arithmetic_conjuncts(scope)
            goal_degree = self._polynomial_degree(prop, scope)
            premise_ids, context_degree = self._arithmetic_context(scope)
            max_degree = None if goal_degree is None or context_degree is None else max(goal_degree, context_degree)
            arithmetic_claims = [claim for _identifier, claim in self._context(scope) if claim.get("kind") in {"eq", "lt", "le", "gt", "ge"}]
            if max_degree is not None and max_degree <= 1 and self._allowed("linarith"):
                if linear_entails(prop, arithmetic_claims, variables_for(self.request, scope)):
                    result = self._add_step(scope, prop, "linarith", premise_ids)
                    if result is not None:
                        return result
            if max_degree is not None and max_degree > 1 and self._allowed("nlinarith"):
                if obvious_polynomial_relation(prop, variables_for(self.request, scope)):
                    result = self._add_step(scope, prop, "nlinarith", premise_ids)
                    if result is not None:
                        return result
            self._restore(arithmetic_snapshot)

        if kind in {"eq", "ne", "lt", "le", "gt", "ge"} and self._constant_true(prop, scope):
            result = self._add_step(scope, prop, "norm_num")
            if result is not None:
                return result

        return None

    def run(self) -> tuple[dict[str, Any], list[dict[str, Any]], str | None]:
        goal = self.request["goal"]
        if goal.get("kind") != "proposition":
            return self.request, self.added, None
        conclusion = self.prove(goal["proposition"], "root")
        return self.request, self.added, conclusion


def build_structured_plan(raw_request: Any, *, max_steps: int = 16, max_depth: int = 12) -> tuple[dict[str, Any], list[dict[str, Any]], str | None]:
    planner = StructuredPlanner(raw_request, max_steps=max_steps, max_depth=max_depth)
    return planner.run()
