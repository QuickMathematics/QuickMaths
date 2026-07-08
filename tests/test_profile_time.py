from pathlib import Path

from quickmaths.storage import add_user_logged_seconds, create_user, get_user_logged_seconds


def test_profile_logged_seconds_accumulates(tmp_path: Path):
    db_path = tmp_path / "quick_maths.sqlite"
    user = create_user("Learner", db_path)

    assert get_user_logged_seconds(user["id"], db_path) == 0
    assert add_user_logged_seconds(user["id"], 30, db_path) == 30
    assert add_user_logged_seconds(user["id"], 45, db_path) == 75
    assert get_user_logged_seconds(user["id"], db_path) == 75


def test_profile_logged_seconds_ignores_negative_deltas(tmp_path: Path):
    db_path = tmp_path / "quick_maths.sqlite"
    user = create_user("Learner", db_path)

    assert add_user_logged_seconds(user["id"], -10, db_path) == 0
