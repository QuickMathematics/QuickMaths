from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
from pathlib import Path

from quickmaths.config import OAUTH_STATE_DB_PATH


OAUTH_STATE_TTL_SECONDS = 10 * 60


def issue_oauth_state(
    db_path: Path = OAUTH_STATE_DB_PATH,
    *,
    now: float | None = None,
) -> str:
    """Create a short-lived OAuth state token that survives Streamlit redirects."""
    issued_at = time.time() if now is None else float(now)
    state = secrets.token_urlsafe(32)
    state_digest = _digest(state)
    with _connect(db_path) as conn:
        _init_table(conn)
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "DELETE FROM oauth_states WHERE created_at < ?",
            (issued_at - OAUTH_STATE_TTL_SECONDS,),
        )
        conn.execute(
            "INSERT INTO oauth_states (state_digest, created_at) VALUES (?, ?)",
            (state_digest, issued_at),
        )
    return state


def consume_oauth_state(
    state: str,
    db_path: Path = OAUTH_STATE_DB_PATH,
    *,
    now: float | None = None,
) -> bool:
    """Validate and delete an OAuth state token so it cannot be replayed."""
    if not state:
        return False
    checked_at = time.time() if now is None else float(now)
    state_digest = _digest(state)
    with _connect(db_path) as conn:
        _init_table(conn)
        conn.execute("BEGIN IMMEDIATE")
        conn.execute(
            "DELETE FROM oauth_states WHERE created_at < ?",
            (checked_at - OAUTH_STATE_TTL_SECONDS,),
        )
        row = conn.execute(
            "SELECT 1 FROM oauth_states WHERE state_digest = ?",
            (state_digest,),
        ).fetchone()
        if row is None:
            return False
        conn.execute(
            "DELETE FROM oauth_states WHERE state_digest = ?",
            (state_digest,),
        )
    return True


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    return sqlite3.connect(db_path)


def _init_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS oauth_states (
            state_digest TEXT PRIMARY KEY,
            created_at REAL NOT NULL
        )
        """
    )


def _digest(state: str) -> str:
    return hashlib.sha256(state.encode("utf-8")).hexdigest()
