import sqlite3

from quickmaths.oauth_state import (
    OAUTH_STATE_TTL_SECONDS,
    consume_oauth_state,
    consume_oauth_state_with_pkce,
    issue_oauth_state,
    issue_oauth_state_with_pkce,
)


def test_oauth_state_survives_outside_session_and_is_consumed_once(tmp_path):
    db_path = tmp_path / "oauth_state.sqlite"
    state = issue_oauth_state(db_path, now=1000)

    assert consume_oauth_state(state, db_path, now=1001)
    assert not consume_oauth_state(state, db_path, now=1002)


def test_oauth_state_rejects_unknown_value(tmp_path):
    db_path = tmp_path / "oauth_state.sqlite"
    issue_oauth_state(db_path, now=1000)

    assert not consume_oauth_state("not-the-issued-state", db_path, now=1001)


def test_oauth_state_expires(tmp_path):
    db_path = tmp_path / "oauth_state.sqlite"
    state = issue_oauth_state(db_path, now=1000)

    assert not consume_oauth_state(state, db_path, now=1000 + OAUTH_STATE_TTL_SECONDS + 1)


def test_oauth_state_preserves_pkce_verifier_for_callback(tmp_path):
    db_path = tmp_path / "oauth_state.sqlite"
    state, code_verifier = issue_oauth_state_with_pkce(db_path, now=1000)

    assert consume_oauth_state_with_pkce(state, db_path, now=1001) == code_verifier
    assert consume_oauth_state_with_pkce(state, db_path, now=1002) is None


def test_oauth_state_adds_pkce_column_to_existing_database(tmp_path):
    db_path = tmp_path / "oauth_state.sqlite"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE oauth_states (state_digest TEXT PRIMARY KEY, created_at REAL NOT NULL)"
        )

    state, code_verifier = issue_oauth_state_with_pkce(db_path, now=1000)

    assert consume_oauth_state_with_pkce(state, db_path, now=1001) == code_verifier
