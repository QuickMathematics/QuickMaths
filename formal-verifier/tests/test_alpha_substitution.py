from quickmaths_formal.logic import same, substitute_prop


def V(name):
    return {"kind": "var", "id": name}


def EQ(a, b):
    return {"kind": "eq", "left": a, "right": b}


def test_quantified_propositions_are_alpha_equivalent():
    left = {"kind": "forall", "binder": {"id": "x", "type": "real"}, "body": EQ(V("x"), V("x"))}
    right = {"kind": "forall", "binder": {"id": "y", "type": "real"}, "body": EQ(V("y"), V("y"))}
    assert same(left, right)


def test_alpha_equivalence_does_not_rename_free_variables():
    left = {"kind": "forall", "binder": {"id": "x", "type": "real"}, "body": EQ(V("x"), V("z"))}
    right = {"kind": "forall", "binder": {"id": "y", "type": "real"}, "body": EQ(V("y"), V("w"))}
    assert not same(left, right)


def test_substitution_renames_binder_to_avoid_capture():
    prop = {
        "kind": "forall",
        "binder": {"id": "y", "type": "real"},
        "body": EQ(V("x"), V("y")),
    }
    result = substitute_prop(prop, "x", V("y"))
    assert result["binder"]["id"] != "y"
    assert result["body"]["left"] == V("y")
    assert result["body"]["right"] == V(result["binder"]["id"])
