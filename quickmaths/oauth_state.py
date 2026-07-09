from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from pathlib import Path

from quickmaths.config import OAUTH_STATE_DB_PATH


OAUTH_STATE_TTL_SECONDS = 10 * 60
_PKCE_VERIFIER_BYTES = 64


def issue_oauth_state(
    db_path: Path = OAUTH_STATE_DB_PATH,
    *,
    now: float | None = None,
) -> str:
    """Create a short-lived OAuth state token that survives Streamlit redirects."""
    return _issue_oauth_state(db_path, now=now, code_verifier=None)


def issue_oauth_state_with_pkce(
    db_path: Path = OAUTH_STATE_DB_PATH,
    *,
    now: float | None = None,
) -> tuple[str, str]:
    """Create an OAuth state and the PKCE verifier required by its callback."""
    code_verifier = secrets.token_urlsafe(_PKCE_VERIFIER_BYTES)
    state = _issue_oauth_state(db_path, now=now, code_verifier=code_verifier)
    return state, code_verifier


def _issue_oauth_state(
    db_path: Path,
    *,
    now: float | None,
    code_verifier: str | None,
) -> str:
    issued_at = time.time() if now is None else float(now)
    state = secrets.token_urlsafe(32)
    state_digest = _digest(state)
    with _connect(db_path) as conn:
        _init_table(conn)
        conn.commit()
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "DELETE FROM oauth_states WHERE created_at < ?",
            (issued_at - OAUTH_STATE_TTL_SECONDS,),
        )
        conn.execute(
            "INSERT INTO oauth_states (state_digest, created_at, code_verifier) VALUES (?, ?, ?)",
            (state_digest, issued_at, code_verifier),
        )
    return state


def consume_oauth_state(
    state: str,
    db_path: Path = OAUTH_STATE_DB_PATH,
    *,
    now: float | None = None,
) -> bool:
    """Validate and delete an OAuth state token so it cannot be replayed."""
    found, _code_verifier = _consume_oauth_state(state, db_path, now=now)
    return found


def consume_oauth_state_with_pkce(
    state: str,
    db_path: Path = OAUTH_STATE_DB_PATH,
    *,
    now: float | None = None,
) -> str | None:
    """Consume an OAuth state and return the PKCE verifier issued with it."""
    found, code_verifier = _consume_oauth_state(state, db_path, now=now)
    if not found:
        return None
    return code_verifier


def _consume_oauth_state(
    state: str,
    db_path: Path,
    *,
    now: float | None,
) -> tuple[bool, str | None]:
    if not state:
        return False, None
    checked_at = time.time() if now is None else float(now)
    state_digest = _digest(state)
    with _connect(db_path) as conn:
        _init_table(conn)
        conn.commit()
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "DELETE FROM oauth_states WHERE created_at < ?",
            (checked_at - OAUTH_STATE_TTL_SECONDS,),
        )
        row = conn.execute(
            "SELECT code_verifier FROM oauth_states WHERE state_digest = ?",
            (state_digest,),
        ).fetchone()
        if row is None:
            return False, None
        conn.execute(
            "DELETE FROM oauth_states WHERE state_digest = ?",
            (state_digest,),
        )
    return True, row[0]


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(db_path)


def _init_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS oauth_states (
            state_digest TEXT PRIMARY KEY,
            created_at REAL NOT NULL,
            code_verifier TEXT
        )
        """
    )
    columns = {row[1] for row in conn.execute("PRAGMA table_info(oauth_states)")}
    if "code_verifier" not in columns:
        conn.execute("ALTER TABLE oauth_states ADD COLUMN code_verifier TEXT")


def _digest(state: str) -> str:
    return hashlib.sha256(state.encode("utf-8")).hexdigest()
