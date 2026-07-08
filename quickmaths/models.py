from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Literal

Status = Literal["unseen", "locked", "ready", "learning", "proven", "mastered", "rusty"]


@dataclass(frozen=True)
class MasteryRules:
    passing_score: float = 0.8
    minimum_confidence: int = 3
    max_guessing_allowed: str = "maybe"
    review_after_days_if_mastered: int = 7
    review_after_days_if_learning: int = 2


@dataclass(frozen=True)
class Example:
    prompt: str
    solution: str
    explanation: str = ""


@dataclass(frozen=True)
class ProblemTemplate:
    id: str
    type: str
    prompt_template: str
    variables: dict[str, dict[str, Any]] = field(default_factory=dict)
    derived: dict[str, str] = field(default_factory=dict)
    constraints: list[str] = field(default_factory=list)
    answer: dict[str, Any] = field(default_factory=dict)
    grading: dict[str, Any] = field(default_factory=dict)
    explanation_template: str = ""
    solution_steps: list[str] = field(default_factory=list)
    mistake_tags: list[str] = field(default_factory=list)
    difficulty: str = "medium"
    options: list[dict[str, Any]] = field(default_factory=list)
    max_attempts: int = 100
    answer_mode: str = "final_only"
    work: dict[str, Any] = field(default_factory=dict)
    review_policy: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class SkillTest:
    question_count: int
    randomize_order: bool
    questions: list[ProblemTemplate]


@dataclass(frozen=True)
class Skill:
    id: str
    name: str
    domain: str
    subdomain: str
    description: str
    prerequisites: list[str]
    mastery: MasteryRules
    theory: str
    examples: list[Example]
    test: SkillTest
    tags: list[str] = field(default_factory=list)
    unlocks: list[str] = field(default_factory=list)
    applications: list[dict[str, Any]] = field(default_factory=list)
    node_type: str = "concept"
    source_path: str = ""
    content_hash: str = ""
    schema_version: str = "0.2"
    draft: bool = False
    deprecated: bool = False
    replacement_skill_id: str = ""


@dataclass(frozen=True)
class Track:
    id: str
    name: str
    domain: str
    description: str
    entry_skills: list[str]
    exit_skills: list[str]
    skills: list[str]
    schema_version: str = "0.2"


@dataclass(frozen=True)
class ProblemInstance:
    template_id: str
    skill_id: str
    seed: int
    difficulty: str
    values: dict[str, Any]
    prompt: str
    expected_answer: str
    answer_type: str
    grading_method: str
    solution_steps: list[str]
    mistake_tags: list[str]
    variable: str | None = None
    tolerance: float | None = None
    options: list[dict[str, Any]] = field(default_factory=list)
    answer_mode: str = "final_only"
    work: dict[str, Any] = field(default_factory=dict)
    review_policy: dict[str, Any] = field(default_factory=dict)
    accepted_forms: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class UserResponse:
    question_id: str = ""
    final_answer: str = ""
    work: str = ""
    structured_work_json: dict[str, Any] | None = None
    answer_mode: str = "final_only"
    submitted_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    @property
    def work_text(self) -> str:
        return self.work


@dataclass(frozen=True)
class FinalAnswerGrade:
    status: str
    score: float
    method: str
    messages: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class WorkCheckResult:
    status: str
    mode: str
    review_policy: str
    score: float | None = None
    messages: list[str] = field(default_factory=list)
    failed_step_index: int | None = None
    detected_obligations: list[str] = field(default_factory=list)
    missing_obligations: list[str] = field(default_factory=list)
    flawed_obligations: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class ReviewResult:
    review_id: str
    attempt_id: str
    question_id: str | None
    user_id: str
    reviewer_type: str
    verdict: str
    score: float
    reviewer_confidence: str
    obligation_results_json: dict[str, Any]
    feedback: str
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())


@dataclass(frozen=True)
class GradingResult:
    template_id: str
    user_answer: str
    expected_answer: str
    is_correct: bool
    method: str
    message: str = ""
    user_work: str = ""
    work_review_status: str = "not_required"
    final_answer_grade: FinalAnswerGrade | None = None
    work_check_result: WorkCheckResult | None = None


@dataclass(frozen=True)
class Reflection:
    confidence_rating: int
    difficulty_felt: str
    hints_used: str
    guessed: str
    wants_more_practice: str
    notes: str = ""
    confusing_parts: str = ""


@dataclass(frozen=True)
class Attempt:
    attempt_id: str
    user_id: str
    skill_id: str
    started_at: str
    completed_at: str
    seed: int
    problem_instances: list[ProblemInstance]
    user_answers: list[str | UserResponse]
    grading_results: list[GradingResult]
    raw_score: int
    percent_score: float
    reflection: Reflection
    mastery_update: dict[str, Any]
    exported_summary_path: str = ""
    review_status: str = "graded"
    has_pending_review: bool = False

    @property
    def score_total(self) -> int:
        return len(self.problem_instances)


@dataclass(frozen=True)
class ProgressRecord:
    user_id: str
    skill_id: str
    status: Status
    mastery_score: float
    confidence_rating: int | None = None
    last_test_score: float | None = None
    best_test_score: float | None = None
    attempt_count: int = 0
    last_attempt_at: str | None = None
    next_review_at: str | None = None
    mistake_tags: list[str] = field(default_factory=list)
    notes: str = ""
    updated_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
