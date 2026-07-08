from __future__ import annotations

import json
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

from quickmaths.config import DB_PATH, DEFAULT_USER_ID, DEFAULT_USER_NAME
from quickmaths.models import Attempt, ProgressRecord, ReviewResult, Skill
from quickmaths.grading import coerce_user_response


def connect(db_path: Path = DB_PATH) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def init_db(db_path: Path = DB_PATH) -> None:
    with connect(db_path) as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                display_name TEXT,
                created_at TEXT,
                total_logged_seconds INTEGER DEFAULT 0
            );
            CREATE TABLE IF NOT EXISTS skills_cache (
                skill_id TEXT PRIMARY KEY,
                name TEXT,
                domain TEXT,
                subdomain TEXT,
                content_hash TEXT,
                updated_at TEXT
            );
            CREATE TABLE IF NOT EXISTS attempts (
                id TEXT PRIMARY KEY,
                user_id TEXT,
                skill_id TEXT,
                started_at TEXT,
                completed_at TEXT,
                seed INTEGER,
                score_raw INTEGER,
                score_total INTEGER,
                score_percent REAL,
                confidence_rating INTEGER,
                difficulty_felt TEXT,
                hints_used TEXT,
                guessed TEXT,
                wants_more_practice TEXT,
                notes TEXT,
                created_at TEXT,
                review_status TEXT,
                has_pending_review INTEGER
            );
            CREATE TABLE IF NOT EXISTS attempt_questions (
                id TEXT PRIMARY KEY,
                attempt_id TEXT,
                question_id TEXT,
                template_id TEXT,
                seed INTEGER,
                prompt TEXT,
                expected_answer TEXT,
                user_answer TEXT,
                is_correct INTEGER,
                grading_method TEXT,
                values_json TEXT,
                solution_steps_json TEXT,
                mistake_tags_json TEXT,
                user_final_answer TEXT,
                user_work TEXT,
                answer_mode TEXT,
                work_review_status TEXT,
                final_answer TEXT,
                work_text TEXT,
                structured_work_json TEXT,
                final_grade_status TEXT,
                final_grade_score REAL,
                final_grade_messages_json TEXT,
                work_check_status TEXT,
                work_check_mode TEXT,
                work_review_policy TEXT,
                work_check_score REAL,
                work_check_messages_json TEXT,
                detected_obligations_json TEXT,
                missing_obligations_json TEXT,
                flawed_obligations_json TEXT,
                review_required INTEGER,
                review_completed INTEGER
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id TEXT PRIMARY KEY,
                attempt_id TEXT,
                question_id TEXT,
                user_id TEXT,
                reviewer_type TEXT,
                verdict TEXT,
                score REAL,
                reviewer_confidence TEXT,
                obligation_results_json TEXT,
                feedback TEXT,
                created_at TEXT
            );
            CREATE TABLE IF NOT EXISTS progress (
                user_id TEXT,
                skill_id TEXT,
                status TEXT,
                mastery_score REAL,
                confidence_rating INTEGER,
                last_test_score REAL,
                best_test_score REAL,
                attempt_count INTEGER,
                last_attempt_at TEXT,
                next_review_at TEXT,
                mistake_tags_json TEXT,
                notes TEXT,
                updated_at TEXT,
                PRIMARY KEY (user_id, skill_id)
            );
            """
        )
        _ensure_column(conn, "users", "total_logged_seconds", "INTEGER DEFAULT 0")
        _ensure_column(conn, "attempt_questions", "user_final_answer", "TEXT")
        _ensure_column(conn, "attempt_questions", "user_work", "TEXT")
        _ensure_column(conn, "attempt_questions", "answer_mode", "TEXT")
        _ensure_column(conn, "attempt_questions", "work_review_status", "TEXT")
        _ensure_column(conn, "attempts", "review_status", "TEXT")
        _ensure_column(conn, "attempts", "has_pending_review", "INTEGER")
        for column, column_type in {
            "final_answer": "TEXT",
            "work_text": "TEXT",
            "structured_work_json": "TEXT",
            "final_grade_status": "TEXT",
            "final_grade_score": "REAL",
            "final_grade_messages_json": "TEXT",
            "work_check_status": "TEXT",
            "work_check_mode": "TEXT",
            "work_review_policy": "TEXT",
            "work_check_score": "REAL",
            "work_check_messages_json": "TEXT",
            "detected_obligations_json": "TEXT",
            "missing_obligations_json": "TEXT",
            "flawed_obligations_json": "TEXT",
            "review_required": "INTEGER",
            "review_completed": "INTEGER",
        }.items():
            _ensure_column(conn, "attempt_questions", column, column_type)
        conn.execute(
            "INSERT OR IGNORE INTO users (id, display_name, created_at) VALUES (?, ?, ?)",
            (DEFAULT_USER_ID, DEFAULT_USER_NAME, datetime.utcnow().isoformat()),
        )


def list_users(db_path: Path = DB_PATH) -> list[dict]:
    init_db(db_path)
    with connect(db_path) as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at, display_name").fetchall()
    return [dict(row) for row in rows]


def get_user(user_id: str, db_path: Path = DB_PATH) -> dict | None:
    init_db(db_path)
    with connect(db_path) as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


def create_user(display_name: str, db_path: Path = DB_PATH) -> dict:
    init_db(db_path)
    clean_name = " ".join(display_name.split()).strip()
    if not clean_name:
        raise ValueError("Profile name is required.")
    user_id = f"user_{uuid.uuid4().hex[:12]}"
    created_at = datetime.utcnow().isoformat()
    with connect(db_path) as conn:
        conn.execute(
            "INSERT INTO users (id, display_name, created_at, total_logged_seconds) VALUES (?, ?, ?, ?)",
            (user_id, clean_name, created_at, 0),
        )
    return {"id": user_id, "display_name": clean_name, "created_at": created_at, "total_logged_seconds": 0}


def add_user_logged_seconds(user_id: str, seconds: int, db_path: Path = DB_PATH) -> int:
    init_db(db_path)
    clean_seconds = max(0, int(seconds))
    with connect(db_path) as conn:
        conn.execute(
            """
            UPDATE users
            SET total_logged_seconds = COALESCE(total_logged_seconds, 0) + ?
            WHERE id = ?
            """,
            (clean_seconds, user_id),
        )
        row = conn.execute("SELECT COALESCE(total_logged_seconds, 0) AS total FROM users WHERE id = ?", (user_id,)).fetchone()
    return int(row["total"]) if row else 0


def get_user_logged_seconds(user_id: str, db_path: Path = DB_PATH) -> int:
    init_db(db_path)
    with connect(db_path) as conn:
        row = conn.execute("SELECT COALESCE(total_logged_seconds, 0) AS total FROM users WHERE id = ?", (user_id,)).fetchone()
    return int(row["total"]) if row else 0


def sync_skill_cache(skills: dict[str, Skill], db_path: Path = DB_PATH) -> None:
    init_db(db_path)
    with connect(db_path) as conn:
        for skill in skills.values():
            conn.execute(
                """
                INSERT INTO skills_cache (skill_id, name, domain, subdomain, content_hash, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(skill_id) DO UPDATE SET
                    name=excluded.name,
                    domain=excluded.domain,
                    subdomain=excluded.subdomain,
                    content_hash=excluded.content_hash,
                    updated_at=excluded.updated_at
                """,
                (skill.id, skill.name, skill.domain, skill.subdomain, skill.content_hash, datetime.utcnow().isoformat()),
            )


def load_progress(user_id: str = DEFAULT_USER_ID, db_path: Path = DB_PATH) -> dict[str, ProgressRecord]:
    init_db(db_path)
    with connect(db_path) as conn:
        rows = conn.execute("SELECT * FROM progress WHERE user_id = ?", (user_id,)).fetchall()
    return {row["skill_id"]: _progress_from_row(row) for row in rows}


def save_progress(record: ProgressRecord, db_path: Path = DB_PATH) -> None:
    init_db(db_path)
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO progress (
                user_id, skill_id, status, mastery_score, confidence_rating, last_test_score,
                best_test_score, attempt_count, last_attempt_at, next_review_at,
                mistake_tags_json, notes, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, skill_id) DO UPDATE SET
                status=excluded.status,
                mastery_score=excluded.mastery_score,
                confidence_rating=excluded.confidence_rating,
                last_test_score=excluded.last_test_score,
                best_test_score=excluded.best_test_score,
                attempt_count=excluded.attempt_count,
                last_attempt_at=excluded.last_attempt_at,
                next_review_at=excluded.next_review_at,
                mistake_tags_json=excluded.mistake_tags_json,
                notes=excluded.notes,
                updated_at=excluded.updated_at
            """,
            (
                record.user_id,
                record.skill_id,
                record.status,
                record.mastery_score,
                record.confidence_rating,
                record.last_test_score,
                record.best_test_score,
                record.attempt_count,
                record.last_attempt_at,
                record.next_review_at,
                json.dumps(record.mistake_tags),
                record.notes,
                record.updated_at,
            ),
        )


def save_attempt(attempt: Attempt, db_path: Path = DB_PATH) -> None:
    init_db(db_path)
    missing_required = [
        result.template_id for result in attempt.grading_results if result.work_review_status == "missing_required_work"
    ]
    if missing_required:
        raise ValueError(f"Cannot save attempt with missing required work: {', '.join(missing_required)}")
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO attempts (
                id, user_id, skill_id, started_at, completed_at, seed, score_raw, score_total,
                score_percent, confidence_rating, difficulty_felt, hints_used, guessed,
                wants_more_practice, notes, created_at, review_status, has_pending_review
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                attempt.attempt_id,
                attempt.user_id,
                attempt.skill_id,
                attempt.started_at,
                attempt.completed_at,
                attempt.seed,
                attempt.raw_score,
                attempt.score_total,
                attempt.percent_score,
                attempt.reflection.confidence_rating,
                attempt.reflection.difficulty_felt,
                attempt.reflection.hints_used,
                attempt.reflection.guessed,
                attempt.reflection.wants_more_practice,
                attempt.reflection.notes,
                datetime.utcnow().isoformat(),
                attempt.review_status,
                int(attempt.has_pending_review),
            ),
        )
        for idx, (problem, answer, result) in enumerate(
            zip(attempt.problem_instances, attempt.user_answers, attempt.grading_results), start=1
        ):
            response = coerce_user_response(answer, problem)
            conn.execute(
                """
                INSERT INTO attempt_questions (
                    id, attempt_id, question_id, template_id, seed, prompt, expected_answer,
                    user_answer, is_correct, grading_method, values_json,
                    solution_steps_json, mistake_tags_json, user_final_answer, user_work,
                    answer_mode, work_review_status, final_answer, work_text, structured_work_json,
                    final_grade_status, final_grade_score, final_grade_messages_json,
                    work_check_status, work_check_mode, work_review_policy, work_check_score,
                    work_check_messages_json, detected_obligations_json, missing_obligations_json,
                    flawed_obligations_json, review_required, review_completed
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    str(uuid.uuid4()),
                    attempt.attempt_id,
                    f"Q{idx}",
                    problem.template_id,
                    problem.seed,
                    problem.prompt,
                    problem.expected_answer,
                    response.final_answer,
                    int(result.is_correct),
                    result.method,
                    json.dumps(problem.values),
                    json.dumps(problem.solution_steps),
                    json.dumps(problem.mistake_tags),
                    response.final_answer,
                    response.work,
                    response.answer_mode,
                    result.work_review_status,
                    response.final_answer,
                    response.work_text,
                    json.dumps(response.structured_work_json or {}),
                    result.final_answer_grade.status if result.final_answer_grade else ("correct" if result.is_correct else "incorrect"),
                    result.final_answer_grade.score if result.final_answer_grade else (1.0 if result.is_correct else 0.0),
                    json.dumps(result.final_answer_grade.messages if result.final_answer_grade else []),
                    result.work_check_result.status if result.work_check_result else "not_required",
                    result.work_check_result.mode if result.work_check_result else "none",
                    result.work_check_result.review_policy if result.work_check_result else "optional",
                    result.work_check_result.score if result.work_check_result else None,
                    json.dumps(result.work_check_result.messages if result.work_check_result else []),
                    json.dumps(result.work_check_result.detected_obligations if result.work_check_result else []),
                    json.dumps(result.work_check_result.missing_obligations if result.work_check_result else []),
                    json.dumps(result.work_check_result.flawed_obligations if result.work_check_result else []),
                    int(result.work_check_result.status == "pending_review" if result.work_check_result else False),
                    int(False),
                ),
            )


def save_review(review: ReviewResult, db_path: Path = DB_PATH) -> None:
    init_db(db_path)
    with connect(db_path) as conn:
        conn.execute(
            """
            INSERT INTO reviews (
                id, attempt_id, question_id, user_id, reviewer_type, verdict, score,
                reviewer_confidence, obligation_results_json, feedback, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                review.review_id,
                review.attempt_id,
                review.question_id,
                review.user_id,
                review.reviewer_type,
                review.verdict,
                review.score,
                review.reviewer_confidence,
                json.dumps(review.obligation_results_json),
                review.feedback,
                review.created_at,
            ),
        )
        if review.question_id:
            conn.execute(
                "UPDATE attempt_questions SET review_completed = 1 WHERE attempt_id = ? AND (question_id = ? OR template_id = ?)",
                (review.attempt_id, review.question_id, review.question_id),
            )
        else:
            conn.execute(
                "UPDATE attempt_questions SET review_completed = 1 WHERE attempt_id = ? AND review_required = 1",
                (review.attempt_id,),
            )
        pending = conn.execute(
            "SELECT COUNT(*) AS count FROM attempt_questions WHERE attempt_id = ? AND review_required = 1 AND review_completed = 0",
            (review.attempt_id,),
        ).fetchone()
        has_pending_review = int((pending["count"] if pending else 0) > 0)
        review_status = (
            "pending_review"
            if has_pending_review
            else {
                "pass": "review_passed",
                "partial": "review_partial",
                "needs_revision": "review_partial",
                "fail": "review_failed",
            }.get(review.verdict, "pending_review")
        )
        conn.execute(
            "UPDATE attempts SET review_status = ?, has_pending_review = ? WHERE id = ?",
            (review_status, has_pending_review, review.attempt_id),
        )


def latest_pending_review_attempt(db_path: Path = DB_PATH) -> dict | None:
    init_db(db_path)
    with connect(db_path) as conn:
        row = conn.execute(
            "SELECT * FROM attempts WHERE has_pending_review = 1 ORDER BY completed_at DESC LIMIT 1"
        ).fetchone()
    return dict(row) if row else None


def load_reviews(attempt_id: str | None = None, db_path: Path = DB_PATH) -> list[dict]:
    init_db(db_path)
    with connect(db_path) as conn:
        if attempt_id:
            rows = conn.execute("SELECT * FROM reviews WHERE attempt_id = ? ORDER BY created_at DESC", (attempt_id,)).fetchall()
        else:
            rows = conn.execute("SELECT * FROM reviews ORDER BY created_at DESC").fetchall()
    return [dict(row) for row in rows]


def pending_review_counts(user_id: str = DEFAULT_USER_ID, db_path: Path = DB_PATH) -> dict[str, int]:
    init_db(db_path)
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT skill_id, COUNT(*) AS count FROM attempts WHERE user_id = ? AND has_pending_review = 1 GROUP BY skill_id",
            (user_id,),
        ).fetchall()
    return {row["skill_id"]: int(row["count"]) for row in rows}


def recent_attempts(limit: int = 10, user_id: str = DEFAULT_USER_ID, db_path: Path = DB_PATH) -> list[dict]:
    init_db(db_path)
    with connect(db_path) as conn:
        rows = conn.execute(
            "SELECT * FROM attempts WHERE user_id = ? ORDER BY completed_at DESC LIMIT ?",
            (user_id, limit),
        ).fetchall()
    return [dict(row) for row in rows]


def load_attempt_questions(attempt_id: str, db_path: Path = DB_PATH) -> list[dict]:
    init_db(db_path)
    with connect(db_path) as conn:
        rows = conn.execute("SELECT * FROM attempt_questions WHERE attempt_id = ? ORDER BY question_id", (attempt_id,)).fetchall()
    return [dict(row) for row in rows]


def _progress_from_row(row: sqlite3.Row) -> ProgressRecord:
    return ProgressRecord(
        user_id=row["user_id"],
        skill_id=row["skill_id"],
        status=row["status"],
        mastery_score=row["mastery_score"],
        confidence_rating=row["confidence_rating"],
        last_test_score=row["last_test_score"],
        best_test_score=row["best_test_score"],
        attempt_count=row["attempt_count"] or 0,
        last_attempt_at=row["last_attempt_at"],
        next_review_at=row["next_review_at"],
        mistake_tags=json.loads(row["mistake_tags_json"] or "[]"),
        notes=row["notes"] or "",
        updated_at=row["updated_at"],
    )


def _ensure_column(conn: sqlite3.Connection, table: str, column: str, column_type: str) -> None:
    columns = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})").fetchall()}
    if column not in columns:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {column_type}")
