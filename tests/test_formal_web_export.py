from dataclasses import replace

from quickmaths.formal_bridge import formal_problem_binding
from quickmaths.models import ProblemInstance
from scripts.export_web_curriculum import _formal_job_for_export


def _instance():
    return ProblemInstance(
        template_id="Q_SOURCE", skill_id="S", seed=9, difficulty="medium", values={"a": "3"},
        prompt="Prove x + 0 = x.", expected_answer="yes", answer_type="text", grading_method="exact_text",
        solution_steps=["Use the additive identity."], mistake_tags=[],
        proof_spec={
            "version": "0.1",
            "statement": {"declarations": ["x:real"], "assumptions": [], "goal": "x + 0 = x"},
            "parameter_contract": {"required_public": []}, "allowed_rules": ["ring_identity"],
            "assessment_policy": {}, "reference_proof": {},
            "environment": {"backend": "lean4", "toolchain": "leanprover/lean4:v4.34.0-rc2", "library": "mathlib", "library_revision": "42a3845c6d7ec6866eefa4cc327a306a0c4a7d3c"},
        },
    )


def test_web_export_binds_formal_job_to_final_variant_id():
    instance = _instance()
    exported_id = "Q_SOURCE__04"
    job = _formal_job_for_export(instance, exported_id)
    expected = replace(instance, template_id=exported_id)
    assert job["template_id"] == exported_id
    assert job["problem_binding_sha256"] == formal_problem_binding(expected)
    assert job["problem_binding_sha256"] != formal_problem_binding(instance)
