from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = PROJECT_ROOT / "content"
DEFAULT_TRACK_DIR = CONTENT_DIR / "math" / "algebra_foundations"

PROVEN_STATUSES = {"proven", "mastered"}
SUPPORTED_GRADING_METHODS = {
    "exact_text",
    "exact_numeric",
    "numeric_with_tolerance",
    "multiple_choice",
    "symbolic_expression",
    "equation_solution",
    "inequality_solution",
    "theorem_conclusion",
}
