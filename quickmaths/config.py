from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
CONTENT_DIR = PROJECT_ROOT / "content"
DEFAULT_TRACK_DIR = CONTENT_DIR / "math" / "algebra_foundations"
DATA_DIR = PROJECT_ROOT / "data"
EXPORT_DIR = DATA_DIR / "exports"
DB_PATH = DATA_DIR / "quick_maths.sqlite"
OAUTH_STATE_DB_PATH = DATA_DIR / "oauth_state.sqlite"
LOGO_PATH = PROJECT_ROOT / "Logosketch.png"
FAVICON_DIR = PROJECT_ROOT / "favicon"
FAVICON_PATH = FAVICON_DIR / "favicon-96x96.png"

DEFAULT_USER_ID = "local_user"
DEFAULT_USER_NAME = "Local Learner"

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
