from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any

from .contract import ContractError, canonical_hash, normalize_request
from .preview import goal_text, prop_text, request_preview
from .parser import render_expression_text
from .reasoner import KERNEL_REQUIRED, REJECTED, check_step
from .rules import Obligation, preflight
from .symbolic import exact_counterexample, is_polynomial_identity, relation_prop, variables_for


@dataclass(frozen=True)
class StepReport:
    step_id: str
    status: str
    rule: str
    claim: str
    message: str = ""
    obligations: list[dict[str, Any]] = field(default_factory=list)
    scope: str = "root"
    premises: list[str] = field(default_factory=list)
    parameters: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ProofState:
    status: str
    message: str
    preview: str = ""
    goal: str = ""
    request_hash: str = ""
    goal_established: bool = False
    kernel_ready: bool = False
    context: list[dict[str, Any]] = field(default_factory=list)
    steps: list[dict[str, Any]] = field(default_factory=list)
    obligations: list[dict[str, Any]] = field(default_factory=list)
    suggestions: list[dict[str, Any]] = field(default_factory=list)
    counterexample: dict[str, str] | None = None


def _obligation_dict(item: Obligation) -> dict[str, Any]:
    return asdict(item)


def _claim_text(goal: dict[str, Any]) -> str:
    return goal_text(goal)


def _suggestions(request: dict[str, Any], obligations: list[Obligation]) -> list[dict[str, Any]]:
    suggestions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in obligations:
        expected = item.expected_claim
        key = f"{item.step_id}:{item.code}:{canonical_hash(expected) if expected else ''}"
        if key in seen:
            continue
        seen.add(key)
        suggestion: dict[str, Any] = {
            "step_id": item.step_id,
            "code": item.code,
            "message": item.message,
        }
        if isinstance(expected, dict) and expected.get("kind") == "proposition":
            suggestion["claim"] = expected
            suggestion["claim_preview"] = prop_text(expected["proposition"])
            if item.code in {"nonzero_required", "denominator_nonzero", "recursive_derivative_nonzero", "continuity_nonzero", "limit_denominator_nonzero", "sequence_denominator_nonzero"}:
                suggestion["action"] = "prove_nonzero"
                suggestion["rule_hints"] = ["assumption", "sub_ne_zero_from_ne", "positivity", "linarith"]
                prop = expected["proposition"]
                left = prop.get("left", {}) if prop.get("kind") == "ne" else {}
                right = prop.get("right", {}) if prop.get("kind") == "ne" else {}
                if left.get("kind") == "sub" and right == {"kind": "int", "value": 0}:
                    source = {"kind": "ne", "left": left["left"], "right": left["right"]}
                    for assumption in request["assumptions"]:
                        if assumption["scope"] == "root" and canonical_hash(assumption["claim"]) == canonical_hash(source):
                            suggestion.update(
                                action="derive_nonzero",
                                rule="sub_ne_zero_from_ne",
                                premises=[assumption["id"]],
                                parameters={},
                            )
                            break
            elif item.code in {"nonnegative_required", "sqrt_domain", "continuity_nonnegative"}:
                suggestion["action"] = "prove_nonnegative"
                suggestion["rule_hints"] = ["assumption", "positivity", "nlinarith"]
            elif item.code in {"sqrt_derivative_positive", "log_domain", "log_derivative_positive", "recursive_derivative_positive", "continuity_positive", "limit_positive_target", "sequence_positive_target"}:
                suggestion["action"] = "prove_positive"
                suggestion["rule_hints"] = ["assumption", "positivity", "linarith", "nlinarith"]
            elif item.code in {"abs_derivative_sign", "recursive_derivative_negative"}:
                suggestion["action"] = "prove_strict_sign"
                suggestion["rule_hints"] = ["assumption", "positivity", "linarith", "nlinarith"]
            elif item.code == "geometric_ratio_abs_lt_one":
                suggestion["action"] = "prove_geometric_ratio_bound"
                suggestion["rule_hints"] = ["assumption", "norm_num", "linarith", "nlinarith"]
            elif item.code == "ivt_interval_guard_required":
                suggestion["action"] = "prove_interval_guard"
                suggestion["rule_hints"] = ["forall_intro", "imp_intro", "assumption", "positivity", "linarith", "nlinarith"]
            else:
                suggestion["action"] = "prove_obligation"
        elif item.code == "final_goal_unestablished":
            prop = relation_prop(request["goal"])
            if prop is not None and prop.get("kind") == "eq" and is_polynomial_identity(prop, variables_for(request)):
                suggestion.update(
                    action="add_final_step",
                    rule="ring_identity",
                    claim=request["goal"],
                    claim_preview=goal_text(request["goal"]),
                )
            else:
                suggestion["action"] = "establish_final_goal"
        elif item.code == "unsupported_rule":
            suggestion["action"] = "choose_supported_rule"
        elif item.code == "sequence_squeeze_evidence":
            suggestion["action"] = "add_squeeze_evidence"
            suggestion["rule_hints"] = ["sequence_algebra", "sequence_squeeze"]
            suggestion["evidence_hints"] = [
                "prove a lower sequence converges to the target",
                "prove an upper sequence converges to the same target",
                "prove eventual lower <= sequence",
                "prove eventual sequence <= upper",
            ]
        elif item.code == "sequence_monotone_bounded_evidence":
            suggestion["action"] = "add_monotone_bounded_evidence"
            suggestion["rule_hints"] = ["forall_intro", "imp_intro", "linarith", "nlinarith", "sequence_monotone_bounded"]
            suggestion["evidence_hints"] = [
                "prove monotone or antitone behavior for all natural indices",
                "provide a matching global upper or lower bound",
            ]
        elif item.code == "sequence_affine_ratio_shape":
            suggestion["action"] = "use_supported_affine_asymptotic"
            suggestion["supported_shape"] = "(a + c*real(n)) / (b + d*real(n)) -> c/d with exact rational coefficients and d != 0"
        elif item.code == "sequence_quadratic_ratio_shape":
            suggestion["action"] = "use_supported_quadratic_asymptotic"
            suggestion["supported_shape"] = "(a + b*real(n) + c*real(n)^2) / (d + e*real(n) + f*real(n)^2) -> c/f with exact rational coefficients and c,f != 0"
        elif item.code == "sequence_polynomial_degree_ratio_shape":
            suggestion["action"] = "use_supported_degree_comparison_asymptotic"
            suggestion["supported_shape"] = "exact rational-coefficient polynomial ratios in real(n), degree <= 64: lower degree -> 0; equal degree (3+) -> leading-coefficient ratio; higher degree -> signed infinity from the leading-coefficient ratio"
        elif item.code == "sequence_rational_shift_shape":
            suggestion["action"] = "use_supported_rational_asymptotic"
            suggestion["supported_shape"] = "real(n+a) / real(n+b) -> 1 with a >= 0 and b >= 1"
        elif item.code == "series_geometric_shape":
            suggestion["action"] = "use_supported_geometric_series"
            suggestion["supported_shape"] = (
                "exact nonzero rational a*r^n; claim a/(1-r) when |r| < 1, "
                "or explicitly claim not summable when |r| >= 1"
            )
        elif item.code == "series_p_series_shape":
            suggestion["action"] = "use_supported_p_series"
            suggestion["supported_shape"] = (
                "exact nonzero rational a / real(n+k)^p with k >= 1 and exact integer/rational 0 <= p <= 64; "
                "claim summable iff p > 1"
            )
        elif item.code == "series_comparison_evidence":
            suggestion["action"] = "cite_comparison_series_and_bound"
            suggestion["evidence_hints"] = [
                "cite a previously proved comparison series over the same natural index",
                "for convergence: prove globally or eventually that 0 <= target(k) and target(k) <= comparison(k)",
                "for divergence: prove globally or eventually that 0 <= comparison(k) and comparison(k) <= target(k)",
            ]
        elif item.code == "series_ratio_test_evidence":
            suggestion["action"] = "cite_ratio_bound"
            suggestion["evidence_hints"] = [
                "prove globally or eventually that abs(a(k+1)) <= r * abs(a(k))",
                "use one exact rational ratio with 0 <= r < 1",
                "or use series_ratio_limit_test with a cited quotient limit and explicit eventual nonzero terms",
            ]
        elif item.code == "series_ratio_limit_test_evidence":
            suggestion["action"] = "cite_ratio_limit_and_nonzero_terms"
            suggestion["evidence_hints"] = [
                "for convergence, cite a finite sequence limit for abs(a(k+1)) / abs(a(k)) with exact rational 0 <= L < 1; a(k) != 0 may be cited globally/eventually or reconstructed for supported exact polynomial/geometric tails",
                "for divergence, cite a finite sequence limit for the same quotient with exact rational L > 1; mathlib derives eventual nonzero terms in this direction",
                "L = 1 is inconclusive for the ratio test",
            ]
        elif item.code == "series_root_test_evidence":
            suggestion["action"] = "cite_root_limit"
            suggestion["evidence_hints"] = [
                "cite a finite sequence limit for abs(a(k))^(1 / real(k)), unless exact product/quotient normalization reduces the term to (p(real(k))/q(real(k)))*r^k with rational polynomial p,q (degree <= 64) and exact rational geometric base r",
                "use exact rational 0 <= L < 1 for summability or exact rational L > 1 for non-summability",
                "L = 1 is inconclusive for the root test",
            ]
        else:
            suggestion["action"] = "repair_step"
        suggestions.append(suggestion)
    return suggestions


def build_proof_state(raw_request: Any) -> ProofState:
    try:
        request = normalize_request(raw_request)
    except ContractError as exc:
        return ProofState("ambiguous_input", str(exc))

    preview = request_preview(request)
    request_hash = canonical_hash(request)

    obligations = preflight(request)
    semantic_codes = {"denominator_nonzero", "sqrt_domain", "log_domain", "nonzero_required", "nonnegative_required", "sign_required", "denominator_nonzero_at_point", "sqrt_derivative_positive", "log_derivative_positive", "abs_derivative_sign", "abs_derivative_kink", "recursive_derivative_nonzero", "recursive_derivative_positive", "recursive_derivative_negative", "recursive_derivative_domain_violation", "continuity_nonzero", "continuity_nonnegative", "continuity_positive", "continuity_domain_violation", "ivt_interval_guard_required", "ivt_interval_domain_violation", "limit_denominator_nonzero", "limit_positive_target", "limit_algebra_domain_violation", "sequence_denominator_nonzero", "sequence_positive_target", "geometric_ratio_abs_lt_one", "sequence_algebra_domain_violation"}
    semantic_blockers = [item for item in obligations if item.code in semantic_codes]

    witness = None if semantic_blockers else exact_counterexample(request)
    by_step: dict[str, list[Obligation]] = {}
    for item in obligations:
        by_step.setdefault(item.step_id, []).append(item)

    reports: list[StepReport] = []
    for step in request["steps"]:
        rows = by_step.get(step["id"], [])
        unsupported = any(item.code == "unsupported_rule" for item in rows)
        if unsupported:
            status = "unsupported"
            message = rows[0].message
        elif rows:
            status = "needs_justification"
            message = rows[0].message
        else:
            candidate = check_step(step, request)
            if candidate.status == REJECTED:
                status = "needs_justification"
                message = candidate.message
            elif candidate.status == KERNEL_REQUIRED:
                status = "kernel_required"
                message = candidate.message
            else:
                status = "candidate_ready"
                message = candidate.message
        reports.append(
            StepReport(
                step["id"],
                status,
                step["rule"],
                _claim_text(step["claim"]),
                message,
                [_obligation_dict(item) for item in rows],
                step["scope"], list(step["premises"]),
                {key: render_expression_text(value) if isinstance(value, dict) else value
                 for key, value in step["parameters"].items()},
            )
        )

    goal_hash = canonical_hash(request["goal"])
    goal_established = any(
        step["scope"] == "root" and canonical_hash(step["claim"]) == goal_hash
        for step in request["steps"]
    )
    unsupported_rows = [item for item in obligations if item.code == "unsupported_rule"]
    rejected_reports = [item for item in reports if item.status == "needs_justification" and not item.obligations]
    if unsupported_rows:
        status = "unsupported"
        message = unsupported_rows[0].message
    elif semantic_blockers:
        status = "needs_justification"
        message = semantic_blockers[0].message
    elif witness is not None:
        status = "refuted"
        message = "An exact rational counterexample satisfies the assumptions and falsifies the stated claim."
    elif obligations:
        status = "needs_justification"
        message = obligations[0].message
    elif rejected_reports:
        status = "needs_justification"
        message = rejected_reports[0].message
    elif goal_established:
        status = "ready_for_kernel"
        message = "All declared proof obligations are satisfied at the educational/local boundary; send the deterministic artifact to the kernel verifier."
    else:
        status = "needs_justification"
        message = "The final goal is not established by a root proof step."

    return ProofState(
        status,
        message,
        preview=preview,
        goal=goal_text(request["goal"]),
        request_hash=request_hash,
        goal_established=goal_established,
        kernel_ready=status == "ready_for_kernel",
        context=[
            {"id": row["id"], "scope": row["scope"], "claim": prop_text(row["claim"])}
            for row in request["assumptions"]
        ],
        steps=[asdict(item) for item in reports],
        obligations=[_obligation_dict(item) for item in obligations],
        suggestions=_suggestions(request, obligations),
        counterexample=witness,
    )


def proof_state_to_dict(state: ProofState) -> dict[str, Any]:
    return asdict(state)


def inspect_request(raw_request: Any) -> dict[str, Any]:
    """Compatibility/helper entry point used by CLI and future UI adapters."""
    return proof_state_to_dict(build_proof_state(raw_request))
