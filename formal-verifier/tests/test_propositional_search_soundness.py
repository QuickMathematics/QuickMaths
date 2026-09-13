from itertools import product

from quickmaths_formal.authoring import build_proposition_request
from quickmaths_formal.search import build_auto_plan

LOGIC_RULES = [
    "true_intro",
    "and_intro",
    "and_elim_left",
    "and_elim_right",
    "or_intro_left",
    "or_intro_right",
    "or_elim",
    "modus_ponens",
    "iff_intro",
    "iff_mp",
    "iff_mpr",
    "contradiction",
    "false_elim",
    "imp_intro",
    "not_intro",
]

ATOMS = ["x = 0", "y = 0", "z = 0"]


def _eval(formula, assignment):
    kind = formula[0]
    if kind == "atom":
        return assignment[formula[1]]
    if kind == "true":
        return True
    if kind == "false":
        return False
    if kind == "not":
        return not _eval(formula[1], assignment)
    left = _eval(formula[1], assignment)
    right = _eval(formula[2], assignment)
    return {
        "and": left and right,
        "or": left or right,
        "implies": (not left) or right,
        "iff": left == right,
    }[kind]


def _text(formula):
    kind = formula[0]
    if kind == "atom":
        return ATOMS[formula[1]]
    if kind in {"true", "false"}:
        return kind
    if kind == "not":
        return f"not ({_text(formula[1])})"
    return f"({_text(formula[1])}) {kind} ({_text(formula[2])})"


def _is_tautology(formula):
    for values in product([False, True], repeat=3):
        assignment = dict(enumerate(values))
        if not _eval(formula, assignment):
            return False
    return True


def _formula_corpus():
    a = [("atom", index) for index in range(3)]
    seeds = [*a, ("true",), ("false",)]
    unary = [("not", item) for item in a]
    binary = []
    # Keep the corpus bounded but deliberately include valid and invalid shapes,
    # nested implications, case splits and biconditionals.
    pairs = [
        (a[0], a[0]),
        (a[0], a[1]),
        (("not", a[0]), a[0]),
        (("or", a[0], a[1]), ("or", a[1], a[0])),
        (("and", a[0], a[1]), a[0]),
        (a[0], ("or", a[1], a[0])),
        (("and", a[0], a[1]), ("and", a[1], a[0])),
        (("iff", a[0], a[1]), ("implies", a[0], a[1])),
    ]
    for op in ["and", "or", "implies", "iff"]:
        for left, right in pairs:
            binary.append((op, left, right))
    return [*seeds, *unary, *binary]


def test_goal_directed_logic_search_never_completes_a_non_tautology():
    for index, formula in enumerate(_formula_corpus()):
        request = build_proposition_request(
            request_id=f"logic-soundness-{index}",
            variables={"x": "real", "y": "real", "z": "real"},
            goal_text=_text(formula),
            allowed_rules=LOGIC_RULES,
        )
        _planned, _steps, terminal = build_auto_plan(request)
        if terminal["status"] == "goal_candidate_complete":
            assert _is_tautology(formula), _text(formula)
