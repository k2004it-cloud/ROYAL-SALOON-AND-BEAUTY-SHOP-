#!/usr/bin/env python3
"""
Salon Pro — Python Backend Service (SQLite + HTTP REST API)
Handles master scheduling, conflict detection, POS checkout, inventory deduction,
client formula records, stylist commissions, and CSV ledger export.
"""

import csv
import datetime
from email.message import EmailMessage
import hashlib
import hmac
import io
import json
import os
import re
import secrets
import smtplib
import ssl
import sqlite3
import sys
import threading
import time
import uuid
from http.cookies import CookieError, SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlencode, urlparse, urlsplit, urlunsplit

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("SALON_DB_PATH", os.path.join(BASE_DIR, "salon_pro.db"))
DATABASE_URL = os.environ.get("SALON_DATABASE_URL", "").strip()
DATABASE_ENGINE = "postgresql" if DATABASE_URL else "sqlite"
PORT = int(os.environ.get("PYTHON_API_PORT", "8001"))
SESSION_COOKIE = "royal_salon_session"
SESSION_TTL_SECONDS = 8 * 60 * 60
PASSWORD_ITERATIONS = 240_000
DEMO_MODE = (
    not DATABASE_URL
    and os.environ.get("SALON_DEMO_MODE", "").lower() == "true"
    and os.environ.get("NODE_ENV", "").lower() != "production"
)
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{3,30}$")

DB_LOCK = threading.Lock()
EVENT_REVISION = 0
EVENT_REVISION_LOCK = threading.Lock()


class PostgresRow(dict):
    """Dict-like row that also supports SQLite-style numeric indexing."""

    def __getitem__(self, key):
        if isinstance(key, int):
            return tuple(self.values())[key]
        return super().__getitem__(key)


class PostgresCursor:
    def __init__(self, cursor):
        self.cursor = cursor

    def execute(self, statement: str, params=None):
        prepared = _prepare_postgres_sql(statement)
        if params is not None:
            params = tuple(int(value) if isinstance(value, bool) else value for value in params)
        self.cursor.execute(prepared, params or None)
        return self

    @property
    def rowcount(self):
        return self.cursor.rowcount

    def fetchone(self):
        row = self.cursor.fetchone()
        return PostgresRow(row) if row is not None else None

    def fetchall(self):
        return [PostgresRow(row) for row in self.cursor.fetchall()]

    def __iter__(self):
        return iter(self.fetchall())


class PostgresConnection:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, statement: str, params=None) -> PostgresCursor:
        return PostgresCursor(self.connection.cursor()).execute(statement, params)

    def cursor(self) -> PostgresCursor:
        return PostgresCursor(self.connection.cursor())

    def commit(self) -> None:
        global EVENT_REVISION
        self.connection.commit()
        with EVENT_REVISION_LOCK:
            EVENT_REVISION += 1

    def rollback(self) -> None:
        self.connection.rollback()

    def close(self) -> None:
        self.connection.close()


def _prepare_postgres_sql(statement: str) -> str:
    sql = statement
    if re.match(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\b", sql, re.IGNORECASE):
        sql = re.sub(r"INSERT\s+OR\s+IGNORE\s+INTO\b", "INSERT INTO", sql, count=1, flags=re.IGNORECASE)
        trimmed = sql.rstrip()
        if trimmed.endswith(";"):
            sql = f"{trimmed[:-1].rstrip()} ON CONFLICT DO NOTHING;"
        else:
            sql = f"{trimmed} ON CONFLICT DO NOTHING"

    sql = sql.replace("?", "%s")
    sql = re.sub(
        r"\b([a-z_][a-z0-9_.]*)\s*=\s*(%s)\s+COLLATE\s+NOCASE\b",
        r"LOWER(\1) = LOWER(\2)",
        sql,
        flags=re.IGNORECASE,
    )
    sql = re.sub(r"\bMAX\(\s*0\s*,", "GREATEST(0,", sql, flags=re.IGNORECASE)
    return sql


def get_conn() -> sqlite3.Connection | PostgresConnection:
    if DATABASE_URL:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except ImportError as exc:
            raise RuntimeError(
                "PostgreSQL mode requires Psycopg. Install backend/requirements.txt before setting SALON_DATABASE_URL."
            ) from exc

        connection = psycopg.connect(
            DATABASE_URL,
            row_factory=dict_row,
            sslmode=os.environ.get("SALON_DATABASE_SSLMODE", "require"),
        )
        return PostgresConnection(connection)

    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def time_to_minutes(hhmm: str) -> int:
    parts = hhmm.strip().split(":")
    return int(parts[0]) * 60 + int(parts[1])


def minutes_to_time(mins: int) -> str:
    h = mins // 60
    m = mins % 60
    return f"{h:02d}:{m:02d}"


def _suggest_username(email: str, used_usernames: set[str]) -> str:
    base = re.sub(r"[^a-z0-9._-]", "", email.split("@", 1)[0].lower()).strip("._-")
    if len(base) < 3:
        base = f"{base}staff"
    base = base[:30] or "staff"
    username = base
    suffix = 2
    while username in used_usernames:
        suffix_text = str(suffix)
        username = f"{base[:30 - len(suffix_text)]}{suffix_text}"
        suffix += 1
    return username


def init_db() -> None:
    with DB_LOCK:
        conn = get_conn()
        if DATABASE_URL:
            try:
                required_tables = {
                    "users", "sessions", "auth_attempts", "business_settings", "audit_logs",
                    "support_requests", "announcements", "announcement_reads", "stylists",
                    "catalog_items", "clients", "appointments", "tickets", "ticket_items",
                    "commission_payouts", "commission_payout_items", "attendance_records",
                    "staff_tasks", "inventory_reports", "salon_expenses",
                    "training_settings",
                }
                existing_tables = {
                    row["table_name"]
                    for row in conn.execute(
                        "SELECT tablename AS table_name FROM pg_tables WHERE schemaname = 'public'"
                    ).fetchall()
                }
                missing_tables = sorted(required_tables - existing_tables)
                if missing_tables:
                    raise RuntimeError(
                        "Supabase is missing application tables: "
                        + ", ".join(missing_tables)
                        + ". Apply the repository migrations with `npx supabase db push --remote`."
                    )

                conn.execute(
                    """
                    INSERT INTO business_settings
                        (id, business_name, phone, email, address, opening_time, closing_time, updated_at, updated_by)
                    VALUES (1, 'Royal Saloon & Beauty Hub', '', '', '', '09:00', '19:30', ?, '')
                    ON CONFLICT (id) DO NOTHING
                    """,
                    (datetime.datetime.now().isoformat(timespec="seconds"),),
                )
                conn.commit()
            finally:
                conn.close()
            return

        cur = conn.cursor()

        cur.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                username TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                job_title TEXT NOT NULL DEFAULT '',
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                pin_salt TEXT NOT NULL,
                pin_hash TEXT NOT NULL,
                stylist_id TEXT NOT NULL DEFAULT '',
                phone TEXT NOT NULL DEFAULT '',
                role TEXT NOT NULL CHECK(role IN ('admin', 'employee')),
                is_superadmin INTEGER NOT NULL DEFAULT 0,
                active INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS auth_attempts (
                account_key TEXT PRIMARY KEY,
                attempts INTEGER NOT NULL DEFAULT 0,
                locked_until INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS password_reset_tokens (
                token_hash TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                expires_at INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS password_reset_tokens_user_idx ON password_reset_tokens(user_id, created_at);

            CREATE TABLE IF NOT EXISTS business_settings (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                business_name TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                opening_time TEXT NOT NULL DEFAULT '09:00',
                closing_time TEXT NOT NULL DEFAULT '19:30',
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS training_settings (
                id INTEGER PRIMARY KEY CHECK(id = 1),
                day_of_week INTEGER CHECK(day_of_week BETWEEN 0 AND 6),
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS audit_logs (
                id TEXT PRIMARY KEY,
                actor_user_id TEXT NOT NULL DEFAULT '',
                actor_name TEXT NOT NULL,
                actor_role TEXT NOT NULL,
                action TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL DEFAULT '',
                summary TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS support_requests (
                id TEXT PRIMARY KEY,
                requester_user_id TEXT NOT NULL,
                requester_name TEXT NOT NULL,
                requester_email TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL,
                priority TEXT NOT NULL CHECK(priority IN ('low', 'normal', 'high')),
                subject TEXT NOT NULL,
                message TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('open', 'in_progress', 'resolved')),
                admin_reply TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                updated_by TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS announcements (
                id TEXT PRIMARY KEY,
                sender_user_id TEXT NOT NULL,
                sender_name TEXT NOT NULL,
                sender_role TEXT NOT NULL CHECK(sender_role IN ('admin', 'employee')),
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS announcement_reads (
                announcement_id TEXT NOT NULL,
                user_id TEXT NOT NULL,
                read_at TEXT NOT NULL,
                PRIMARY KEY (announcement_id, user_id),
                FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS stylists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                role TEXT NOT NULL,
                specialty TEXT NOT NULL,
                avatar_url TEXT NOT NULL,
                commission_rate REAL NOT NULL DEFAULT 0.35,
                active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS catalog_items (
                id TEXT PRIMARY KEY,
                kind TEXT NOT NULL CHECK(kind IN ('service', 'product')),
                category TEXT NOT NULL,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                price_ksh INTEGER NOT NULL,
                commission_rate REAL NOT NULL DEFAULT 0.35,
                duration_min INTEGER NOT NULL DEFAULT 0,
                stock_qty INTEGER NOT NULL DEFAULT 0,
                sku TEXT NOT NULL DEFAULT '',
                active INTEGER NOT NULL DEFAULT 1
            );

            CREATE TABLE IF NOT EXISTS clients (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                phone TEXT NOT NULL,
                email TEXT NOT NULL DEFAULT '',
                preferred_stylist_id TEXT DEFAULT '',
                formula_notes TEXT NOT NULL DEFAULT '',
                visit_count INTEGER NOT NULL DEFAULT 0,
                loyalty_points INTEGER NOT NULL DEFAULT 0,
                total_spent_ksh INTEGER NOT NULL DEFAULT 0,
                last_visit TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS appointments (
                id TEXT PRIMARY KEY,
                client_id TEXT NOT NULL,
                stylist_id TEXT NOT NULL,
                service_id TEXT NOT NULL,
                date TEXT NOT NULL,
                start_time TEXT NOT NULL,
                duration_min INTEGER NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('Pending', 'Confirmed', 'In-Service', 'Completed', 'Cancelled', 'No-Show')),
                notes TEXT NOT NULL DEFAULT '',
                ticket_id TEXT DEFAULT '',
                created_at TEXT NOT NULL,
                FOREIGN KEY (client_id) REFERENCES clients(id),
                FOREIGN KEY (stylist_id) REFERENCES stylists(id),
                FOREIGN KEY (service_id) REFERENCES catalog_items(id)
            );

            CREATE TABLE IF NOT EXISTS tickets (
                id TEXT PRIMARY KEY,
                ticket_number TEXT NOT NULL UNIQUE,
                client_id TEXT DEFAULT '',
                client_name TEXT NOT NULL,
                appointment_id TEXT DEFAULT '',
                subtotal_ksh INTEGER NOT NULL,
                discount_ksh INTEGER NOT NULL DEFAULT 0,
                tax_ksh INTEGER NOT NULL DEFAULT 0,
                total_ksh INTEGER NOT NULL,
                payment_method TEXT NOT NULL CHECK(payment_method IN ('M-Pesa', 'Card', 'Cash')),
                transaction_reference TEXT NOT NULL DEFAULT '',
                tendered_ksh INTEGER NOT NULL,
                change_ksh INTEGER NOT NULL DEFAULT 0,
                status TEXT NOT NULL CHECK(status IN ('Paid', 'Voided')),
                created_at TEXT NOT NULL,
                business_date TEXT NOT NULL,
                loyalty_points_earned INTEGER NOT NULL DEFAULT 0,
                loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS ticket_items (
                id TEXT PRIMARY KEY,
                ticket_id TEXT NOT NULL,
                catalog_item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                kind TEXT NOT NULL,
                stylist_id TEXT DEFAULT '',
                stylist_name TEXT DEFAULT '',
                quantity INTEGER NOT NULL,
                unit_price_ksh INTEGER NOT NULL,
                line_total_ksh INTEGER NOT NULL,
                commission_ksh INTEGER NOT NULL DEFAULT 0,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS commission_payouts (
                id TEXT PRIMARY KEY,
                employee_user_id TEXT NOT NULL,
                stylist_id TEXT NOT NULL,
                amount_ksh INTEGER NOT NULL CHECK(amount_ksh > 0),
                payment_method TEXT NOT NULL CHECK(payment_method IN ('Cash', 'M-Pesa', 'Bank Transfer')),
                reference TEXT NOT NULL DEFAULT '',
                notes TEXT NOT NULL DEFAULT '',
                paid_at TEXT NOT NULL,
                recorded_by_user_id TEXT NOT NULL,
                recorded_by_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (employee_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (recorded_by_user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS commission_payout_items (
                id TEXT PRIMARY KEY,
                payout_id TEXT NOT NULL,
                ticket_item_id TEXT NOT NULL,
                amount_ksh INTEGER NOT NULL CHECK(amount_ksh > 0),
                FOREIGN KEY (payout_id) REFERENCES commission_payouts(id) ON DELETE CASCADE,
                FOREIGN KEY (ticket_item_id) REFERENCES ticket_items(id)
            );

            CREATE INDEX IF NOT EXISTS idx_commission_payout_items_ticket
                ON commission_payout_items(ticket_item_id);

            CREATE TABLE IF NOT EXISTS attendance_records (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                work_date TEXT NOT NULL,
                clock_in TEXT NOT NULL,
                clock_out TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(user_id, work_date),
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS staff_tasks (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                assigned_to_user_id TEXT NOT NULL,
                created_by_user_id TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('assigned', 'in_progress', 'completed')),
                priority TEXT NOT NULL DEFAULT 'normal',
                due_date TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                completed_at TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (assigned_to_user_id) REFERENCES users(id) ON DELETE CASCADE,
                FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE INDEX IF NOT EXISTS idx_staff_tasks_assignee_status
                ON staff_tasks(assigned_to_user_id, status, due_date);

            CREATE TABLE IF NOT EXISTS inventory_reports (
                id TEXT PRIMARY KEY,
                catalog_item_id TEXT NOT NULL,
                item_name TEXT NOT NULL,
                report_type TEXT NOT NULL CHECK(report_type IN ('usage', 'low_stock', 'damaged')),
                quantity INTEGER NOT NULL DEFAULT 1 CHECK(quantity >= 0),
                note TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved')),
                created_by_user_id TEXT NOT NULL,
                created_by_name TEXT NOT NULL,
                created_at TEXT NOT NULL,
                resolved_by_user_id TEXT NOT NULL DEFAULT '',
                resolved_at TEXT NOT NULL DEFAULT '',
                FOREIGN KEY (catalog_item_id) REFERENCES catalog_items(id),
                FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
            );

            CREATE TABLE IF NOT EXISTS salon_expenses (
                id TEXT PRIMARY KEY,
                category TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                amount_ksh INTEGER NOT NULL CHECK(amount_ksh > 0),
                expense_date TEXT NOT NULL,
                created_by_name TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS salon_expenses_date_idx ON salon_expenses(expense_date DESC);
            CREATE INDEX IF NOT EXISTS idx_inventory_reports_status_created
                ON inventory_reports(status, created_at DESC);
            """
        )

        catalog_columns = {row["name"] for row in cur.execute("PRAGMA table_info(catalog_items)")}
        if "commission_rate" not in catalog_columns:
            cur.execute("ALTER TABLE catalog_items ADD COLUMN commission_rate REAL NOT NULL DEFAULT 0.35")
        client_columns = {row["name"] for row in cur.execute("PRAGMA table_info(clients)")}
        if "loyalty_points" not in client_columns:
            cur.execute("ALTER TABLE clients ADD COLUMN loyalty_points INTEGER NOT NULL DEFAULT 0")
        ticket_columns = {row["name"] for row in cur.execute("PRAGMA table_info(tickets)")}
        if "loyalty_points_earned" not in ticket_columns:
            cur.execute("ALTER TABLE tickets ADD COLUMN loyalty_points_earned INTEGER NOT NULL DEFAULT 0")
        if "loyalty_points_redeemed" not in ticket_columns:
            cur.execute("ALTER TABLE tickets ADD COLUMN loyalty_points_redeemed INTEGER NOT NULL DEFAULT 0")

        settings_columns = {row["name"] for row in cur.execute("PRAGMA table_info(business_settings)")}
        task_columns = {row["name"] for row in cur.execute("PRAGMA table_info(staff_tasks)")}
        ticket_columns = {row["name"] for row in cur.execute("PRAGMA table_info(tickets)")}
        if "priority" not in task_columns:
            cur.execute("ALTER TABLE staff_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'normal'")
        if "transaction_reference" not in ticket_columns:
            cur.execute("ALTER TABLE tickets ADD COLUMN transaction_reference TEXT NOT NULL DEFAULT ''")
        if "opening_time" not in settings_columns:
            cur.execute("ALTER TABLE business_settings ADD COLUMN opening_time TEXT NOT NULL DEFAULT '09:00'")
        if "closing_time" not in settings_columns:
            cur.execute("ALTER TABLE business_settings ADD COLUMN closing_time TEXT NOT NULL DEFAULT '19:30'")
        conn.execute(
            """
            INSERT OR IGNORE INTO business_settings
                (id, business_name, phone, email, address, opening_time, closing_time, updated_at, updated_by)
            VALUES (1, 'Royal Saloon & Beauty Hub', '', '', '', '09:00', '19:30', ?, '')
            """,
            (datetime.datetime.now().isoformat(timespec="seconds"),),
        )
        conn.execute(
            "INSERT OR IGNORE INTO training_settings (id, day_of_week, updated_at, updated_by) VALUES (1, NULL, ?, '')",
            (datetime.datetime.now().isoformat(timespec="seconds"),),
        )

        user_columns = {row["name"] for row in cur.execute("PRAGMA table_info(users)")}
        if "username" not in user_columns:
            cur.execute("ALTER TABLE users ADD COLUMN username TEXT NOT NULL DEFAULT ''")
        if "stylist_id" not in user_columns:
            cur.execute("ALTER TABLE users ADD COLUMN stylist_id TEXT NOT NULL DEFAULT ''")
        if "phone" not in user_columns:
            cur.execute("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
        if "job_title" not in user_columns:
            cur.execute("ALTER TABLE users ADD COLUMN job_title TEXT NOT NULL DEFAULT ''")
        if "is_superadmin" not in user_columns:
            cur.execute("ALTER TABLE users ADD COLUMN is_superadmin INTEGER NOT NULL DEFAULT 0")
        cur.execute("CREATE TABLE IF NOT EXISTS app_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)")
        if not cur.execute("SELECT 1 FROM app_migrations WHERE name = 'separate_superadmin_from_admin'").fetchone():
            # Remove the legacy first-admin promotion once, while preserving
            # subsequently token-created Superadmin accounts across restarts.
            cur.execute("UPDATE users SET is_superadmin = 0 WHERE role = 'admin'")
            cur.execute("INSERT INTO app_migrations (name, applied_at) VALUES ('separate_superadmin_from_admin', ?)", (datetime.datetime.now().isoformat(timespec="seconds"),))
        if not cur.execute("SELECT 1 FROM app_migrations WHERE name = 'employee_positions_and_profiles'").fetchone():
            employees = cur.execute("SELECT id, name, job_title, stylist_id, active FROM users WHERE role = 'employee'").fetchall()
            for employee in employees:
                linked_profile = cur.execute("SELECT role FROM stylists WHERE id = ?", (employee["stylist_id"],)).fetchone() if employee["stylist_id"] else None
                job_title = (employee["job_title"] or (linked_profile["role"] if linked_profile else "") or "Employee").strip()
                profile_id = employee["stylist_id"] if linked_profile else employee["id"]
                if not linked_profile:
                    cur.execute(
                        "INSERT OR IGNORE INTO stylists (id, name, role, specialty, avatar_url, commission_rate, active) VALUES (?, ?, ?, ?, '', 0.35, ?)",
                        (profile_id, employee["name"], job_title, job_title, employee["active"]),
                    )
                cur.execute("UPDATE users SET job_title = ?, stylist_id = ? WHERE id = ?", (job_title, profile_id, employee["id"]))
            cur.execute("INSERT INTO app_migrations (name, applied_at) VALUES ('employee_positions_and_profiles', ?)", (datetime.datetime.now().isoformat(timespec="seconds"),))
        cur.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_superadmin ON users(is_superadmin) WHERE is_superadmin = 1")

        used_usernames: set[str] = set()
        for user in cur.execute(
            "SELECT id, email, username FROM users ORDER BY created_at, id"
        ).fetchall():
            stored_username = (user["username"] or "").strip()
            username = stored_username.lower()
            if not USERNAME_PATTERN.fullmatch(username) or username in used_usernames:
                username = _suggest_username(user["email"], used_usernames)
                cur.execute("UPDATE users SET username = ? WHERE id = ?", (username, user["id"]))
            elif stored_username != username:
                cur.execute("UPDATE users SET username = ? WHERE id = ?", (username, user["id"]))
            used_usernames.add(username)

        cur.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique ON users(username COLLATE NOCASE)"
        )

        existing = cur.execute("SELECT COUNT(*) FROM stylists").fetchone()[0]
        if existing == 0:
            seed_data(conn)

        if DEMO_MODE:
            _ensure_demo_users(conn)
        else:
            demo_ids = ("usr-demo-admin", "usr-demo-employee")
            placeholders = ", ".join("?" for _ in demo_ids)
            payout_ids = conn.execute(
                f"SELECT id FROM commission_payouts WHERE employee_user_id IN ({placeholders}) OR recorded_by_user_id IN ({placeholders})",
                (*demo_ids, *demo_ids),
            ).fetchall()
            if payout_ids:
                payout_placeholders = ", ".join("?" for _ in payout_ids)
                conn.execute(
                    f"DELETE FROM commission_payout_items WHERE payout_id IN ({payout_placeholders})",
                    tuple(row["id"] for row in payout_ids),
                )
                conn.execute(
                    f"DELETE FROM commission_payouts WHERE id IN ({payout_placeholders})",
                    tuple(row["id"] for row in payout_ids),
                )
            conn.execute(
                f"DELETE FROM attendance_records WHERE user_id IN ({placeholders})",
                demo_ids,
            )
            conn.execute(
                f"DELETE FROM staff_tasks WHERE assigned_to_user_id IN ({placeholders}) OR created_by_user_id IN ({placeholders})",
                (*demo_ids, *demo_ids),
            )
            conn.execute("DELETE FROM users WHERE id IN ('usr-demo-admin', 'usr-demo-employee')")

        conn.commit()
        conn.close()


def _credential_hash(value: str, salt_hex: str | None = None) -> tuple[str, str]:
    salt = bytes.fromhex(salt_hex) if salt_hex else secrets.token_bytes(16)
    derived = hashlib.pbkdf2_hmac("sha256", value.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return salt.hex(), derived.hex()


def _credential_matches(value: str, salt_hex: str, expected_hash: str) -> bool:
    _, actual_hash = _credential_hash(value, salt_hex)
    return hmac.compare_digest(actual_hash, expected_hash)


def _password_reset_config() -> tuple[dict[str, str | int] | None, str | None]:
    host = os.environ.get("SMTP_HOST", "").strip()
    username = os.environ.get("SMTP_USERNAME", "").strip()
    password = os.environ.get("SMTP_PASSWORD", "")
    sender = os.environ.get("SMTP_FROM_EMAIL", "").strip()
    config_errors: list[str] = []
    for key, value in (
        ("SMTP_HOST", host),
        ("SMTP_USERNAME", username),
        ("SMTP_PASSWORD", password),
        ("SMTP_FROM_EMAIL", sender),
    ):
        if not value:
            config_errors.append(key)
    try:
        port = int(os.environ.get("SMTP_PORT", "587"))
    except ValueError:
        port = 0
        config_errors.append("SMTP_PORT (must be 465 or 587)")
    if port not in {465, 587} and "SMTP_PORT (must be 465 or 587)" not in config_errors:
        config_errors.append("SMTP_PORT (must be 465 or 587)")

    public_url = os.environ.get("APP_URL", "").strip().rstrip("/")
    if not public_url:
        vercel_domain = os.environ.get("VERCEL_PROJECT_PRODUCTION_URL", "").strip()
        if vercel_domain:
            public_url = f"https://{vercel_domain}"
    parsed_url = urlsplit(public_url)
    if not parsed_url.hostname or parsed_url.scheme not in {"https", "http"}:
        config_errors.append("APP_URL (must be an http:// or https:// site URL)")
    elif os.environ.get("NODE_ENV", "").lower() == "production" and parsed_url.scheme != "https":
        config_errors.append("APP_URL (production requires https://)")
    if config_errors:
        return None, ", ".join(config_errors)

    return (
        {
            "host": host,
            "port": port,
            "username": username,
            "password": password,
            "sender": sender,
            "base_url": urlunsplit((parsed_url.scheme, parsed_url.netloc, "", "", "")),
        },
        None,
    )


def _send_password_reset_email(destination: str, reset_url: str, config: dict[str, str | int]) -> None:
    message = EmailMessage()
    message["Subject"] = "Reset your Royal Saloon password"
    message["From"] = str(config["sender"])
    message["To"] = destination
    message.set_content(
        "A password reset was requested for your Royal Saloon account.\n\n"
        f"Set a new password using this one-time link (valid for 15 minutes):\n{reset_url}\n\n"
        "If you did not request this, you can ignore this email. Your password will not change."
    )

    host = str(config["host"])
    port = int(config["port"])
    context = ssl.create_default_context()
    if port == 465:
        with smtplib.SMTP_SSL(host, port, timeout=10, context=context) as smtp:
            smtp.login(str(config["username"]), str(config["password"]))
            smtp.send_message(message)
    else:
        with smtplib.SMTP(host, port, timeout=10) as smtp:
            smtp.ehlo()
            smtp.starttls(context=context)
            smtp.ehlo()
            smtp.login(str(config["username"]), str(config["password"]))
            smtp.send_message(message)


def _password_reset_delivery_error(exc: Exception) -> str:
    if isinstance(exc, smtplib.SMTPAuthenticationError):
        return "The SMTP server rejected the mailbox username or password. Check SMTP_USERNAME and SMTP_PASSWORD in Vercel."
    if isinstance(exc, ssl.SSLError):
        return "The SMTP TLS handshake failed. Use port 465 for implicit TLS or port 587 for STARTTLS, matching your provider."
    if isinstance(exc, smtplib.SMTPResponseException):
        code = exc.smtp_code
        if code in {530, 535}:
            return "The SMTP server rejected authentication. Check the mailbox username and password in Vercel."
        if code in {550, 553}:
            return "The SMTP server rejected the sender address. Set SMTP_FROM_EMAIL to an address allowed by your mail provider."
        return f"The SMTP server rejected the email (response {code}). Check the sender address and mailbox settings."
    if isinstance(exc, (smtplib.SMTPConnectError, smtplib.SMTPServerDisconnected, OSError)):
        return "Could not connect to the SMTP server. Check SMTP_HOST and SMTP_PORT, and confirm the provider allows external SMTP connections."
    return "The SMTP server could not send the email. Check the mailbox and sender settings with your email provider."


def _password_reset_table_ready(conn) -> bool:
    try:
        conn.execute("SELECT 1 FROM password_reset_tokens LIMIT 0")
        return True
    except Exception:
        conn.rollback()
        return False


def _ensure_demo_users(conn: sqlite3.Connection) -> None:
    demo_users = (
        ("usr-demo-admin", "Salon Admin", "admin", "admin@demo.royalsaloon.local", "0000", "admin", ""),
        ("usr-demo-employee", "Test Employee", "test", "test@demo.royalsaloon.local", "11111", "employee", "sty-marcus"),
    )
    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
    for user_id, name, username, email, password, role, stylist_id in demo_users:
        if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
            conn.execute(
                """
                UPDATE users
                SET name = ?, email = ?, stylist_id = ?, role = ?, job_title = ?, is_superadmin = ?, active = 1
                WHERE username = ?
                """,
                (name, email, stylist_id, role, "Stylist" if role == "employee" else "", 0, username),
            )
            continue
        password_salt, password_digest = _credential_hash(password)
        pin_salt, pin_digest = _credential_hash(secrets.token_urlsafe(32))
        conn.execute(
            """
            INSERT INTO users (id, name, username, email, password_salt, password_hash, pin_salt, pin_hash, stylist_id, job_title, role, is_superadmin, active, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?)
            """,
            (
                user_id,
                name,
                username,
                email,
                password_salt,
                password_digest,
                pin_salt,
                pin_digest,
                stylist_id,
                "Stylist" if role == "employee" else "",
                role,
                now_iso,
            ),
        )


def _public_user(row: sqlite3.Row | dict) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "username": row["username"],
        "email": row["email"],
        "phone": row["phone"] if "phone" in row.keys() else "",
        "job_title": row["job_title"] if "job_title" in row.keys() else "",
        "stylist_id": row["stylist_id"] if "stylist_id" in row.keys() else "",
        "role": "superadmin" if ("is_superadmin" in row.keys() and bool(row["is_superadmin"])) else row["role"],
        "active": bool(row["active"]),
    }


def _session_token_from_cookie(cookie_header: str | None) -> str:
    if not cookie_header:
        return ""
    cookie = SimpleCookie()
    try:
        cookie.load(cookie_header)
    except CookieError:
        return ""
    morsel = cookie.get(SESSION_COOKIE)
    return morsel.value if morsel else ""


def _current_user(conn: sqlite3.Connection, cookie_header: str | None) -> sqlite3.Row | None:
    token = _session_token_from_cookie(cookie_header)
    if not token:
        return None
    return conn.execute(
        """
        SELECT u.*
        FROM sessions s
        JOIN users u ON u.id = s.user_id
        WHERE s.token_hash = ? AND s.expires_at > ? AND u.active = 1
        """,
        (hashlib.sha256(token.encode("utf-8")).hexdigest(), int(time.time())),
    ).fetchone()


def _create_session(conn: sqlite3.Connection, user_id: str) -> tuple[str, int]:
    token = secrets.token_urlsafe(32)
    expires_at = int(time.time()) + SESSION_TTL_SECONDS
    conn.execute(
        "INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
        (
            hashlib.sha256(token.encode("utf-8")).hexdigest(),
            user_id,
            expires_at,
            datetime.datetime.now().isoformat(timespec="seconds"),
        ),
    )
    return token, expires_at


def _business_settings(conn: sqlite3.Connection) -> dict:
    row = conn.execute("SELECT * FROM business_settings WHERE id = 1").fetchone()
    if not row:
        raise RuntimeError("Business settings have not been initialized.")
    return dict(row)


def _record_audit_event(
    conn: sqlite3.Connection,
    actor: sqlite3.Row,
    action: str,
    entity_type: str,
    summary: str,
    entity_id: str = "",
) -> None:
    conn.execute(
        """
        INSERT INTO audit_logs
            (id, actor_user_id, actor_name, actor_role, action, entity_type, entity_id, summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            f"log-{uuid.uuid4().hex[:12]}",
            actor["id"],
            actor["name"],
            actor["role"],
            action,
            entity_type,
            entity_id,
            summary,
            datetime.datetime.now().isoformat(timespec="seconds"),
        ),
    )


def seed_data(conn: sqlite3.Connection) -> None:
    cur = conn.cursor()
    today = datetime.date.today().isoformat()
    tomorrow = (datetime.date.today() + datetime.timedelta(days=1)).isoformat()
    yesterday = (datetime.date.today() - datetime.timedelta(days=1)).isoformat()
    now_iso = datetime.datetime.now().isoformat(timespec="seconds")

    stylists = [
        (
            "sty-amara",
            "Amara Ochieng",
            "Creative Director",
            "Precision Cuts & Silk Press",
            "/src/assets/images/stylist_amara_portrait_1795108046700.jpg",
            0.40,
        ),
        (
            "sty-chloe",
            "Chloe Muthoni",
            "Lead Colorist",
            "Balayage & Botanical Gloss",
            "/src/assets/images/stylist_chloe_portrait_1795108045960.jpg",
            0.38,
        ),
        (
            "sty-zainab",
            "Zainab Hassan",
            "Atelier Specialist",
            "Bridal Styling & Gel Atelier",
            "/src/assets/images/stylist_zainab_portrait_1795108047310.jpg",
            0.35,
        ),
        (
            "sty-marcus",
            "Marcus Kiprop",
            "Master Barber",
            "Sculpted Fades & Scalp Rituals",
            "/src/assets/images/stylist_marcus_portrait_1795108046964.jpg",
            0.35,
        ),
    ]
    cur.executemany(
        "INSERT INTO stylists (id, name, role, specialty, avatar_url, commission_rate) VALUES (?, ?, ?, ?, ?, ?)",
        stylists,
    )

    catalog = [
        # Services
        ("srv-silk-press", "service", "Hair & Styling", "Signature Silk Press & Steam", "Hydrating mist infusion with mirror-shine press", 4500, 75, 0, "SRV-101"),
        ("srv-knotless", "service", "Hair & Styling", "Boutique Knotless Braids", "Featherlight medium knotless protective style", 7500, 150, 0, "SRV-102"),
        ("srv-editorial-cut", "service", "Hair & Styling", "Editorial Cut & Blowout", "Tailored consultation, wash, precision shape & finish", 3800, 60, 0, "SRV-103"),
        ("srv-balayage", "service", "Color & Treatment", "Hand-Painted Balayage", "Custom dimensional lift with bond-builder gloss", 14500, 150, 0, "SRV-201"),
        ("srv-keratin", "service", "Color & Treatment", "Keratin Velvet Treatment", "Frizz-smoothing amino infusion lasting 12 weeks", 11000, 120, 0, "SRV-202"),
        ("srv-botanical-gloss", "service", "Color & Treatment", "Botanical Scalp & Gloss", "Warm argan scalp massage & demi-permanent tone", 5200, 60, 0, "SRV-203"),
        ("srv-biab-mani", "service", "Nails & Atelier", "BIAB Builder Manicure", "Structured gel overlay with cuticle detail", 3200, 60, 0, "SRV-301"),
        ("srv-spa-pedi", "service", "Nails & Atelier", "Lavender Stone Pedicure", "Volcanic exfoliation, hot towel wrap & gel polish", 4000, 60, 0, "SRV-302"),
        ("srv-bridal-trial", "service", "Nails & Atelier", "Bridal Atelier Preview", "Full hair architecture & veil placement session", 9500, 90, 0, "SRV-303"),
        ("srv-exec-fade", "service", "Grooming", "Executive Taper & Hot Towel", "Precision skin fade, straight-razor line & mist", 2200, 45, 0, "SRV-401"),
        ("srv-beard-sculpt", "service", "Grooming", "Beard Sculpt & Cedar Oil", "Contour trim, steam compress & botanical balm", 1600, 30, 0, "SRV-402"),
        ("srv-detox-scalp", "service", "Grooming", "Charcoal Scalp Detox", "Clarifying exfoliation & tension-relief massage", 2800, 45, 0, "SRV-403"),
        # Retail Products
        ("prd-argan-elixir", "product", "Retail Products", "Kalahari Argan Hair Elixir", "Cold-pressed shine serum (100ml)", 3400, 0, 14, "RTL-501"),
        ("prd-silk-bonnet", "product", "Retail Products", "Mulberry Silk Sleep Wrap", "Double-lined 22-momme plum silk bonnet", 2900, 0, 4, "RTL-502"),
        ("prd-bond-mask", "product", "Retail Products", "Peptide Bond Repair Masque", "Weekly restorative protein & lipid mask (250ml)", 4800, 0, 9, "RTL-503"),
        ("prd-cuticle-oil", "product", "Retail Products", "Rosehip Cuticle Pen", "Pocket botanical nail & cuticle oil", 1250, 0, 3, "RTL-504"),
        ("prd-cedar-balm", "product", "Retail Products", "Atlas Cedar Beard Butter", "Whipped shea & cedarwood grooming balm", 2100, 0, 11, "RTL-505"),
        ("prd-violet-mist", "product", "Retail Products", "No-Yellow Violet Mist", "Leave-in toning thermal protectant (150ml)", 3100, 0, 6, "RTL-506"),
    ]
    cur.executemany(
        "INSERT INTO catalog_items (id, kind, category, name, description, price_ksh, duration_min, stock_qty, sku) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        catalog,
    )

    clients = [
        ("cli-nadia", "Nadia Wanjiku", "+254 712 409 821", "nadia.w@outlook.com", "sty-chloe", "Warm honey 7G root smudge + Olaplex No.1; prefers low heat on ends.", 9, 68400, yesterday, now_iso),
        ("cli-serena", "Serena Kamau", "+254 722 883 114", "serena.kamau@gmail.com", "sty-amara", "4C coily texture; silk press at 195°C max with argan heat shield.", 6, 34500, yesterday, now_iso),
        ("cli-tariq", "Tariq Al-Mansoor", "+254 733 519 040", "tariq@atelier.ke", "sty-marcus", "Mid drop fade #1.5 guard; sensitive neck—use aloe pre-shave.", 14, 39200, today, now_iso),
        ("cli-imani", "Imani Njoroge", "+254 701 942 330", "imani.n@gmail.com", "sty-zainab", "Soft almond BIAB shade 'Sheer Linen'; almond shape medium length.", 7, 29800, today, now_iso),
        ("cli-beatrice", "Beatrice Achieng", "+254 720 671 552", "b.achieng@yahoo.com", "sty-amara", "Prefers rosemary steam before knotless installs; sensitive edges.", 4, 31000, yesterday, now_iso),
        ("cli-devon", "Devon Otieno", "+254 790 112 784", "devon.otieno@gmail.com", "sty-marcus", "High taper + cedar beard oil; likes chilled hibiscus tea on arrival.", 5, 16500, yesterday, now_iso),
        ("cli-chidinma", "Chidinma Eze", "+254 718 330 912", "chidinma.eze@gmail.com", "sty-zainab", "November bridal party lead; ivory French tip & chignon trial.", 3, 24500, yesterday, now_iso),
        ("cli-farah", "Farah Mohammed", "+254 724 908 117", "farah.m@icloud.com", "sty-chloe", "Keratin Velvet every 12 weeks; espresso gloss toner.", 8, 76000, yesterday, now_iso),
    ]
    cur.executemany(
        "INSERT INTO clients (id, name, phone, email, preferred_stylist_id, formula_notes, visit_count, total_spent_ksh, last_visit, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        clients,
    )

    appointments = [
        # Today's morning settled/completed bookings
        ("apt-101", "cli-tariq", "sty-marcus", "srv-exec-fade", today, "09:00", 45, "Completed", "Regular morning taper", "tkt-1001", now_iso),
        ("apt-102", "cli-imani", "sty-zainab", "srv-biab-mani", today, "09:30", 60, "Completed", "Sheer Linen refill", "tkt-1002", now_iso),
        # Active / In-Service right now
        ("apt-103", "cli-serena", "sty-amara", "srv-silk-press", today, "10:00", 75, "In-Service", "Steam hydration + trim", "", now_iso),
        ("apt-104", "cli-nadia", "sty-chloe", "srv-balayage", today, "10:00", 150, "In-Service", "Autumn honey dimension", "", now_iso),
        # Confirmed & Pending for afternoon
        ("apt-105", "cli-devon", "sty-marcus", "srv-beard-sculpt", today, "10:30", 30, "Confirmed", "Before board meeting", "", now_iso),
        ("apt-106", "cli-chidinma", "sty-zainab", "srv-bridal-trial", today, "11:00", 90, "Confirmed", "Bringing cathedral veil", "", now_iso),
        ("apt-107", "cli-beatrice", "sty-amara", "srv-knotless", today, "12:00", 150, "Confirmed", "Color 1B/27 blend", "", now_iso),
        ("apt-108", "cli-farah", "sty-chloe", "srv-keratin", today, "13:30", 120, "Pending", "Confirm deposit via M-Pesa", "", now_iso),
        ("apt-109", "cli-imani", "sty-zainab", "srv-spa-pedi", today, "14:00", 60, "Confirmed", "Lavender scrub", "", now_iso),
        ("apt-110", "cli-tariq", "sty-marcus", "srv-detox-scalp", today, "14:30", 45, "Pending", "Waitlist slot moved up", "", now_iso),
        ("apt-111", "cli-serena", "sty-amara", "srv-editorial-cut", today, "15:30", 60, "Confirmed", "Layer refresh", "", now_iso),
        # Tomorrow's bookings
        ("apt-201", "cli-nadia", "sty-chloe", "srv-botanical-gloss", tomorrow, "10:00", 60, "Confirmed", "Post-balayage gloss check", "", now_iso),
        ("apt-202", "cli-chidinma", "sty-zainab", "srv-biab-mani", tomorrow, "11:00", 60, "Confirmed", "Bridal nail prep", "", now_iso),
        ("apt-203", "cli-beatrice", "sty-amara", "srv-silk-press", tomorrow, "13:00", 75, "Pending", "Requested corner suite", "", now_iso),
    ]
    cur.executemany(
        "INSERT INTO appointments (id, client_id, stylist_id, service_id, date, start_time, duration_min, status, notes, ticket_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        appointments,
    )

    # Seed 3 realistic settled morning tickets for today + 1 from yesterday
    tickets = [
        ("tkt-1001", "SP-2026-0841", "cli-tariq", "Tariq Al-Mansoor", "apt-101", 4300, 0, 593, 4300, "M-Pesa", 4300, 0, "Paid", f"{today}T09:52:00", today),
        ("tkt-1002", "SP-2026-0842", "cli-imani", "Imani Njoroge", "apt-102", 4450, 0, 614, 4450, "Card", 4450, 0, "Paid", f"{today}T10:34:00", today),
        ("tkt-1003", "SP-2026-0843", "", "Walk-In Guest", "", 6200, 620, 769, 5580, "Cash", 6000, 420, "Paid", f"{today}T10:48:00", today),
    ]
    cur.executemany(
        "INSERT INTO tickets (id, ticket_number, client_id, client_name, appointment_id, subtotal_ksh, discount_ksh, tax_ksh, total_ksh, payment_method, tendered_ksh, change_ksh, status, created_at, business_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        tickets,
    )

    ticket_items = [
        ("ti-1", "tkt-1001", "srv-exec-fade", "Executive Taper & Hot Towel", "service", "sty-marcus", "Marcus Kiprop", 1, 2200, 2200, 770),
        ("ti-2", "tkt-1001", "prd-cedar-balm", "Atlas Cedar Beard Butter", "product", "sty-marcus", "Marcus Kiprop", 1, 2100, 2100, 210),
        ("ti-3", "tkt-1002", "srv-biab-mani", "BIAB Builder Manicure", "service", "sty-zainab", "Zainab Hassan", 1, 3200, 3200, 1120),
        ("ti-4", "tkt-1002", "prd-cuticle-oil", "Rosehip Cuticle Pen", "product", "sty-zainab", "Zainab Hassan", 1, 1250, 1250, 125),
        ("ti-5", "tkt-1003", "srv-botanical-gloss", "Botanical Scalp & Gloss", "service", "sty-chloe", "Chloe Muthoni", 1, 5200, 5200, 1976),
        ("ti-6", "tkt-1003", "prd-cuticle-oil", "Rosehip Cuticle Pen", "product", "sty-amara", "Amara Ochieng", 1, 1000, 1000, 100),
    ]
    cur.executemany(
        "INSERT INTO ticket_items (id, ticket_id, catalog_item_id, item_name, kind, stylist_id, stylist_name, quantity, unit_price_ksh, line_total_ksh, commission_ksh) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        ticket_items,
    )


def row_to_dict(row: sqlite3.Row) -> dict:
    return dict(row) if row is not None else {}


def fetch_appointments(conn: sqlite3.Connection, date_str: str) -> list[dict]:
    rows = conn.execute(
        """
        SELECT a.*,
               c.name AS client_name,
               c.phone AS client_phone,
               c.formula_notes AS client_formula,
               s.name AS stylist_name,
               s.role AS stylist_role,
               s.avatar_url AS stylist_avatar,
               i.name AS service_name,
               i.category AS service_category,
               i.price_ksh AS service_price_ksh
        FROM appointments a
        JOIN clients c ON a.client_id = c.id
        JOIN stylists s ON a.stylist_id = s.id
        JOIN catalog_items i ON a.service_id = i.id
        WHERE a.date = ?
        ORDER BY a.start_time ASC
        """,
        (date_str,),
    ).fetchall()
    return [dict(r) for r in rows]


def attach_employee_client_history(conn: sqlite3.Connection, clients: list[dict], stylist_id: str) -> None:
    if not clients or not stylist_id:
        return
    client_ids = [client["id"] for client in clients]
    placeholders = ", ".join("?" for _ in client_ids)
    rows = conn.execute(
        f"""
        SELECT a.client_id, a.date, a.status, i.name AS service_name, i.duration_min
        FROM appointments a
        JOIN catalog_items i ON i.id = a.service_id
        WHERE a.stylist_id = ? AND a.status = 'Completed' AND a.client_id IN ({placeholders})
        ORDER BY a.date DESC, a.start_time DESC
        """,
        (stylist_id, *client_ids),
    ).fetchall()
    history: dict[str, list[dict]] = {}
    for row in rows:
        items = history.setdefault(row["client_id"], [])
        if len(items) < 5:
            items.append({key: row[key] for key in ("date", "status", "service_name", "duration_min")})
    for client in clients:
        client["service_history"] = history.get(client["id"], [])


def check_conflict(
    conn: sqlite3.Connection,
    stylist_id: str,
    date_str: str,
    start_time: str,
    duration_min: int,
    exclude_id: str = "",
) -> dict | None:
    new_start = time_to_minutes(start_time)
    new_end = new_start + duration_min
    rows = conn.execute(
        """
        SELECT a.id, a.start_time, a.duration_min, c.name AS client_name, i.name AS service_name
        FROM appointments a
        JOIN clients c ON a.client_id = c.id
        JOIN catalog_items i ON a.service_id = i.id
        WHERE a.stylist_id = ? AND a.date = ? AND a.status NOT IN ('Cancelled', 'No-Show')
        """,
        (stylist_id, date_str),
    ).fetchall()
    for r in rows:
        if exclude_id and r["id"] == exclude_id:
            continue
        ex_start = time_to_minutes(r["start_time"])
        ex_end = ex_start + int(r["duration_min"])
        if new_start < ex_end and new_end > ex_start:
            return {
                "conflict_id": r["id"],
                "client_name": r["client_name"],
                "service_name": r["service_name"],
                "window": f"{r['start_time']}–{minutes_to_time(ex_end)}",
            }
    return None


def compute_analytics(conn: sqlite3.Connection, date_str: str) -> dict:
    paid_tickets = conn.execute(
        "SELECT * FROM tickets WHERE business_date = ? AND status = 'Paid'",
        (date_str,),
    ).fetchall()
    all_today_tickets = conn.execute(
        "SELECT COUNT(*) FROM tickets WHERE business_date = ?",
        (date_str,),
    ).fetchone()[0]

    gross_revenue = sum(r["total_ksh"] for r in paid_tickets)
    total_discounts = sum(r["discount_ksh"] for r in paid_tickets)
    settled_count = len(paid_tickets)
    avg_ticket = round(gross_revenue / settled_count) if settled_count > 0 else 0

    by_method = {"M-Pesa": 0, "Card": 0, "Cash": 0}
    for r in paid_tickets:
        m = r["payment_method"]
        by_method[m] = by_method.get(m, 0) + r["total_ksh"]

    # Commission leaderboard across paid tickets for the date
    stylist_rows = conn.execute("SELECT id, name, role, avatar_url, commission_rate FROM stylists WHERE active = 1").fetchall()
    stylist_stats = {
        s["id"]: {
            "stylist_id": s["id"],
            "name": s["name"],
            "role": s["role"],
            "avatar_url": s["avatar_url"],
            "commission_rate": s["commission_rate"],
            "revenue_ksh": 0,
            "commission_ksh": 0,
            "services_count": 0,
        }
        for s in stylist_rows
    }

    item_rows = conn.execute(
        """
        SELECT ti.stylist_id, ti.line_total_ksh, ti.commission_ksh, ti.quantity
        FROM ticket_items ti
        JOIN tickets t ON ti.ticket_id = t.id
        WHERE t.business_date = ? AND t.status = 'Paid'
        """,
        (date_str,),
    ).fetchall()

    total_commissions = 0
    for ir in item_rows:
        sid = ir["stylist_id"]
        total_commissions += int(ir["commission_ksh"])
        if sid in stylist_stats:
            stylist_stats[sid]["revenue_ksh"] += int(ir["line_total_ksh"])
            stylist_stats[sid]["commission_ksh"] += int(ir["commission_ksh"])
            stylist_stats[sid]["services_count"] += int(ir["quantity"])

    leaderboard = sorted(stylist_stats.values(), key=lambda x: x["revenue_ksh"], reverse=True)

    appts_today = conn.execute(
        "SELECT status, COUNT(*) as cnt FROM appointments WHERE date = ? GROUP BY status",
        (date_str,),
    ).fetchall()
    status_counts = {r["status"]: r["cnt"] for r in appts_today}
    low_stock_count = conn.execute(
        "SELECT COUNT(*) FROM catalog_items WHERE kind = 'product' AND active = 1 AND stock_qty <= 5"
    ).fetchone()[0]

    return {
        "date": date_str,
        "gross_revenue_ksh": gross_revenue,
        "total_discounts_ksh": total_discounts,
        "settled_tickets": settled_count,
        "total_tickets": all_today_tickets,
        "avg_ticket_ksh": avg_ticket,
        "total_commissions_ksh": total_commissions,
        "payment_breakdown": by_method,
        "stylist_leaderboard": leaderboard,
        "appointment_counts": status_counts,
        "low_stock_count": low_stock_count,
    }


def compute_revenue_trend(conn: sqlite3.Connection, end_date: str, days: int) -> list[dict]:
    end = datetime.date.fromisoformat(end_date)
    start = end - datetime.timedelta(days=days - 1)
    rows = conn.execute(
        """
        SELECT business_date, SUM(total_ksh) AS revenue_ksh, COUNT(*) AS ticket_count
        FROM tickets
        WHERE business_date BETWEEN ? AND ? AND status = 'Paid'
        GROUP BY business_date
        """,
        (start.isoformat(), end.isoformat()),
    ).fetchall()
    totals = {
        row["business_date"]: {
            "revenue_ksh": int(row["revenue_ksh"] or 0),
            "ticket_count": int(row["ticket_count"] or 0),
        }
        for row in rows
    }
    return [
        {
            "date": (start + datetime.timedelta(days=offset)).isoformat(),
            **totals.get((start + datetime.timedelta(days=offset)).isoformat(), {"revenue_ksh": 0, "ticket_count": 0}),
        }
        for offset in range(days)
    ]


def compute_employee_dashboard(conn: sqlite3.Connection, business_date: str, stylist_id: str, user_id: str) -> dict:
    selected_date = datetime.date.fromisoformat(business_date)
    week_start = selected_date - datetime.timedelta(days=selected_date.weekday())
    week_end = week_start + datetime.timedelta(days=6)
    week_start_iso = week_start.isoformat()
    week_end_iso = week_end.isoformat()

    today_sales = conn.execute(
        """
        SELECT COALESCE(SUM(ti.line_total_ksh), 0) AS sales,
               COALESCE(SUM(ti.commission_ksh), 0) AS commission
        FROM ticket_items ti
        JOIN tickets t ON t.id = ti.ticket_id
        WHERE ti.stylist_id = ? AND t.business_date = ? AND t.status = 'Paid'
        """,
        (stylist_id, business_date),
    ).fetchone()
    week_sales = conn.execute(
        """
        SELECT t.business_date AS date,
               COALESCE(SUM(ti.line_total_ksh), 0) AS revenue_ksh,
               COUNT(DISTINCT t.id) AS ticket_count,
               COALESCE(SUM(ti.commission_ksh), 0) AS commission_ksh
        FROM ticket_items ti
        JOIN tickets t ON t.id = ti.ticket_id
        WHERE ti.stylist_id = ? AND t.business_date BETWEEN ? AND ? AND t.status = 'Paid'
        GROUP BY t.business_date
        """,
        (stylist_id, week_start_iso, week_end_iso),
    ).fetchall()
    sales_by_date = {row["date"]: dict(row) for row in week_sales}
    weekly_revenue = [
        {
            "date": (week_start + datetime.timedelta(days=offset)).isoformat(),
            "revenue_ksh": int(sales_by_date.get((week_start + datetime.timedelta(days=offset)).isoformat(), {}).get("revenue_ksh", 0)),
            "ticket_count": int(sales_by_date.get((week_start + datetime.timedelta(days=offset)).isoformat(), {}).get("ticket_count", 0)),
        }
        for offset in range(7)
    ]
    appointment_stats = conn.execute(
        """
        SELECT COUNT(*) AS eligible,
               SUM(CASE WHEN status = 'Completed' THEN 1 ELSE 0 END) AS completed
        FROM appointments
        WHERE stylist_id = ? AND date = ? AND status NOT IN ('Cancelled', 'No-Show')
        """,
        (stylist_id, business_date),
    ).fetchone()
    clients_served = conn.execute(
        """
        SELECT COUNT(DISTINCT client_id)
        FROM appointments
        WHERE stylist_id = ? AND date BETWEEN ? AND ? AND status = 'Completed'
        """,
        (stylist_id, week_start_iso, week_end_iso),
    ).fetchone()[0]
    low_stock_items = conn.execute(
        """
        SELECT id, name, stock_qty FROM catalog_items
        WHERE kind = 'product' AND active = 1 AND stock_qty <= 5
        ORDER BY stock_qty ASC, name ASC LIMIT 10
        """
    ).fetchall()
    task_counts = conn.execute(
        """
        SELECT COALESCE(SUM(CASE WHEN status != 'completed' THEN 1 ELSE 0 END), 0) AS pending,
               COALESCE(SUM(CASE WHEN status != 'completed' AND due_date != '' AND due_date < ? THEN 1 ELSE 0 END), 0) AS overdue
        FROM staff_tasks WHERE assigned_to_user_id = ?
        """,
        (business_date, user_id),
    ).fetchone()

    return {
        "today_sales_ksh": int(today_sales["sales"] or 0),
        "clients_served_week": int(clients_served or 0),
        "weekly_sales_ksh": sum(int(row["revenue_ksh"] or 0) for row in week_sales),
        "weekly_commission_ksh": sum(int(row["commission_ksh"] or 0) for row in week_sales),
        "performance_percent": round((int(appointment_stats["completed"] or 0) / int(appointment_stats["eligible"] or 1)) * 100) if appointment_stats["eligible"] else 0,
        "pending_tasks_count": int(task_counts["pending"] or 0),
        "overdue_tasks_count": int(task_counts["overdue"] or 0),
        "low_stock_items": [dict(row) for row in low_stock_items],
        "weekly_revenue": weekly_revenue,
    }


def compute_employee_earnings(conn: sqlite3.Connection, stylist_id: str, start_date: str, end_date: str) -> dict:
    daily_rows = conn.execute(
        """
        SELECT t.business_date AS date,
               COALESCE(SUM(ti.line_total_ksh), 0) AS revenue_ksh,
               COALESCE(SUM(ti.commission_ksh), 0) AS commission_ksh,
               COUNT(DISTINCT t.id) AS ticket_count
        FROM ticket_items ti
        JOIN tickets t ON t.id = ti.ticket_id
        WHERE ti.stylist_id = ? AND t.status = 'Paid'
          AND t.business_date BETWEEN ? AND ?
        GROUP BY t.business_date
        ORDER BY t.business_date
        """,
        (stylist_id, start_date, end_date),
    ).fetchall()
    daily_by_date = {row["date"]: dict(row) for row in daily_rows}
    start = datetime.date.fromisoformat(start_date)
    end = datetime.date.fromisoformat(end_date)
    daily = []
    current = start
    while current <= end:
        key = current.isoformat()
        row = daily_by_date.get(key, {})
        daily.append({
            "date": key,
            "revenue_ksh": int(row.get("revenue_ksh", 0)),
            "commission_ksh": int(row.get("commission_ksh", 0)),
            "ticket_count": int(row.get("ticket_count", 0)),
        })
        current += datetime.timedelta(days=1)

    tickets = conn.execute(
        """
        SELECT t.id, t.ticket_number, t.business_date, t.created_at,
               t.client_name, t.payment_method, t.transaction_reference,
               COALESCE(SUM(ti.line_total_ksh), 0) AS attributed_sales_ksh,
               COALESCE(SUM(ti.commission_ksh), 0) AS commission_ksh,
               COALESCE((
                   SELECT SUM(payout_item.amount_ksh)
                   FROM ticket_items earned_item
                   JOIN commission_payout_items payout_item ON payout_item.ticket_item_id = earned_item.id
                   WHERE earned_item.ticket_id = t.id AND earned_item.stylist_id = ?
               ), 0) AS commission_paid_ksh,
               COALESCE(SUM(ti.quantity), 0) AS quantity
        FROM tickets t
        JOIN ticket_items ti ON ti.ticket_id = t.id
        WHERE ti.stylist_id = ? AND t.status = 'Paid'
          AND t.business_date BETWEEN ? AND ?
        GROUP BY t.id
        ORDER BY t.business_date DESC, t.created_at DESC
        """,
        (stylist_id, stylist_id, start_date, end_date),
    ).fetchall()
    items = conn.execute(
        """
        SELECT ti.item_name, ti.kind,
               SUM(ti.quantity) AS quantity,
               SUM(ti.line_total_ksh) AS sales_ksh,
               SUM(ti.commission_ksh) AS commission_ksh
        FROM ticket_items ti
        JOIN tickets t ON t.id = ti.ticket_id
        WHERE ti.stylist_id = ? AND t.status = 'Paid'
          AND t.business_date BETWEEN ? AND ?
        GROUP BY ti.item_name, ti.kind
        ORDER BY sales_ksh DESC, ti.item_name
        """,
        (stylist_id, start_date, end_date),
    ).fetchall()
    commission_paid_ksh = conn.execute(
        """
        SELECT COALESCE(SUM(payout_item.amount_ksh), 0)
        FROM commission_payout_items payout_item
        JOIN ticket_items ti ON ti.id = payout_item.ticket_item_id
        JOIN tickets t ON t.id = ti.ticket_id
        WHERE ti.stylist_id = ? AND t.status = 'Paid'
          AND t.business_date BETWEEN ? AND ?
        """,
        (stylist_id, start_date, end_date),
    ).fetchone()[0]
    payouts = conn.execute(
        """
        SELECT p.id, p.payment_method, p.reference, p.notes, p.paid_at,
               p.recorded_by_name, SUM(pi.amount_ksh) AS amount_ksh
        FROM commission_payouts p
        JOIN commission_payout_items pi ON pi.payout_id = p.id
        JOIN ticket_items ti ON ti.id = pi.ticket_item_id
        JOIN tickets t ON t.id = ti.ticket_id
        WHERE ti.stylist_id = ? AND t.status = 'Paid'
          AND t.business_date BETWEEN ? AND ?
        GROUP BY p.id
        ORDER BY p.paid_at DESC
        """,
        (stylist_id, start_date, end_date),
    ).fetchall()
    ticket_values = [dict(row) for row in tickets]
    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_sales_ksh": sum(row["revenue_ksh"] for row in daily),
        "total_commission_ksh": sum(row["commission_ksh"] for row in daily),
        "commission_paid_ksh": int(commission_paid_ksh),
        "commission_balance_ksh": sum(row["commission_ksh"] for row in daily) - int(commission_paid_ksh),
        "ticket_count": sum(row["ticket_count"] for row in daily),
        "daily": daily,
        "tickets": ticket_values,
        "items": [dict(row) for row in items],
        "payouts": [dict(row) for row in payouts],
    }


def commission_totals(conn: sqlite3.Connection, stylist_id: str) -> dict[str, int]:
    earned = conn.execute(
        """
        SELECT COALESCE(SUM(ti.commission_ksh), 0)
        FROM ticket_items ti
        JOIN tickets t ON t.id = ti.ticket_id
        WHERE ti.stylist_id = ? AND ti.commission_ksh > 0 AND t.status = 'Paid'
        """,
        (stylist_id,),
    ).fetchone()[0]
    paid = conn.execute(
        """
        SELECT COALESCE(SUM(pi.amount_ksh), 0)
        FROM commission_payout_items pi
        JOIN ticket_items ti ON ti.id = pi.ticket_item_id
        JOIN tickets t ON t.id = ti.ticket_id
        WHERE ti.stylist_id = ? AND t.status = 'Paid'
        """,
        (stylist_id,),
    ).fetchone()[0]
    return {"earned_ksh": int(earned), "paid_ksh": int(paid), "balance_ksh": int(earned) - int(paid)}


def outstanding_commission_items(conn: sqlite3.Connection, stylist_id: str) -> list[sqlite3.Row]:
    return conn.execute(
        """
        SELECT ti.id AS ticket_item_id,
               ti.commission_ksh - COALESCE(SUM(pi.amount_ksh), 0) AS outstanding_ksh
        FROM ticket_items ti
        JOIN tickets t ON t.id = ti.ticket_id
        LEFT JOIN commission_payout_items pi ON pi.ticket_item_id = ti.id
        WHERE ti.stylist_id = ? AND ti.commission_ksh > 0 AND t.status = 'Paid'
        GROUP BY ti.id
        HAVING ti.commission_ksh > COALESCE(SUM(pi.amount_ksh), 0)
        ORDER BY t.business_date, t.created_at, ti.id
        """,
        (stylist_id,),
    ).fetchall()


def fetch_tickets(conn: sqlite3.Connection, date_str: str | None = None) -> list[dict]:
    if date_str:
        t_rows = conn.execute(
            "SELECT * FROM tickets WHERE business_date = ? ORDER BY created_at DESC",
            (date_str,),
        ).fetchall()
    else:
        t_rows = conn.execute("SELECT * FROM tickets ORDER BY created_at DESC LIMIT 100").fetchall()

    result = []
    for t in t_rows:
        td = dict(t)
        items = conn.execute("SELECT * FROM ticket_items WHERE ticket_id = ?", (t["id"],)).fetchall()
        td["items"] = [dict(i) for i in items]
        result.append(td)
    return result


def workspace_revision(conn) -> int:
    if DATABASE_URL:
        with EVENT_REVISION_LOCK:
            return EVENT_REVISION
    return conn.execute("PRAGMA data_version").fetchone()[0]


class SalonHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args) -> None:
        # Keep stdout clean; errors still surface explicitly
        pass

    def _send_json(self, code: int, payload: object, headers: dict[str, str] | None = None) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for name, value in (headers or {}).items():
            self.send_header(name, value)
        self.end_headers()
        self.wfile.write(body)

    def _send_csv(self, filename: str, csv_text: str) -> None:
        body = csv_text.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/csv; charset=utf-8")
        self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0:
            return {}
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def _stream_workspace_events(self) -> None:
        observer = get_conn()
        try:
            last_version = workspace_revision(observer)
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache, no-transform")
            self.send_header("Connection", "keep-alive")
            self.send_header("X-Accel-Buffering", "no")
            self.end_headers()
            self.wfile.write(b": connected\n\n")
            self.wfile.flush()
            last_heartbeat = time.monotonic()

            while True:
                time.sleep(0.4)
                current_version = workspace_revision(observer)
                if current_version != last_version:
                    last_version = current_version
                    self.wfile.write(b"event: workspace-updated\ndata: {}\n\n")
                    self.wfile.flush()
                    last_heartbeat = time.monotonic()
                elif time.monotonic() - last_heartbeat >= 15:
                    self.wfile.write(b": keep-alive\n\n")
                    self.wfile.flush()
                    last_heartbeat = time.monotonic()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            observer.close()

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path
        qs = parse_qs(parsed.query)
        today = datetime.date.today().isoformat()
        date_str = qs.get("date", [today])[0]

        if path == "/api/health":
            self._send_json(200, {"status": "ok", "engine": f"python-{DATABASE_ENGINE}"})
            return

        if path == "/api/events":
            with DB_LOCK:
                conn = get_conn()
                try:
                    user = _current_user(conn, self.headers.get("Cookie"))
                finally:
                    conn.close()
            if not user:
                self._send_json(401, {"error": "Sign in to continue."})
                return
            self._stream_workspace_events()
            return

        if path == "/api/auth/status":
            with DB_LOCK:
                conn = get_conn()
                try:
                    user_count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
                    user = _current_user(conn, self.headers.get("Cookie"))
                    self._send_json(
                        200,
                        {
                            "setup_required": user_count == 0,
                            "admin_setup_required": conn.execute("SELECT 1 FROM users WHERE role = 'admin' AND active = 1 LIMIT 1").fetchone() is None,
                            "superadmin_setup_required": conn.execute("SELECT 1 FROM users WHERE is_superadmin = 1 AND active = 1 LIMIT 1").fetchone() is None,
                            "demo_mode": DEMO_MODE,
                            "user": _public_user(user) if user else None,
                        },
                    )
                finally:
                    conn.close()
            return

        with DB_LOCK:
            conn = get_conn()
            try:
                user = _current_user(conn, self.headers.get("Cookie"))
                if not user:
                    self._send_json(401, {"error": "Sign in to continue."})
                    return

                if path == "/api/auth/me":
                    self._send_json(200, {"user": _public_user(user)})
                    return

                if path == "/api/superadmin/diagnostics":
                    if not bool(user["is_superadmin"]):
                        self._send_json(403, {"error": "Superadmin access is required."})
                        return
                    diagnostics = {
                        "api_status": "online",
                        "database_engine": DATABASE_ENGINE,
                        "active_accounts": int(conn.execute("SELECT COUNT(*) FROM users WHERE active = 1").fetchone()[0]),
                        "employees_without_stylist": int(conn.execute("SELECT COUNT(*) FROM users WHERE role = 'employee' AND active = 1 AND (stylist_id = '' OR stylist_id IS NULL)").fetchone()[0]),
                        "low_stock_items": int(conn.execute("SELECT COUNT(*) FROM catalog_items WHERE active = 1 AND kind = 'product' AND stock_qty <= 2").fetchone()[0]),
                        "open_support_requests": int(conn.execute("SELECT COUNT(*) FROM support_requests WHERE status != 'resolved'").fetchone()[0]),
                        "checked_at": datetime.datetime.now().isoformat(timespec="seconds"),
                    }
                    self._send_json(200, diagnostics)
                    return

                if path == "/api/training":
                    training_settings = conn.execute("SELECT day_of_week FROM training_settings WHERE id = 1").fetchone()
                    day_of_week = training_settings["day_of_week"] if training_settings else None
                    training_date = None
                    metrics = None
                    employee_commissions = []
                    my_commission = 0
                    requested_date = qs.get("date", [None])[0]
                    if day_of_week is not None:
                        if requested_date:
                            try:
                                training_date = datetime.date.fromisoformat(requested_date)
                            except ValueError:
                                self._send_json(400, {"error": "Enter a valid training date."})
                                return
                            if training_date.weekday() != day_of_week or training_date > datetime.date.today():
                                self._send_json(400, {"error": "Choose a past or current date that matches the weekly training day."})
                                return
                        else:
                            current_date = datetime.date.today()
                            days_since_training = (current_date.weekday() - int(day_of_week)) % 7
                            training_date = current_date - datetime.timedelta(days=days_since_training)
                        training_date_text = training_date.isoformat()
                        if user["role"] == "employee":
                            if user["stylist_id"]:
                                own_row = conn.execute(
                                    "SELECT COALESCE(SUM(ti.commission_ksh), 0) AS commission_ksh FROM ticket_items ti JOIN tickets t ON t.id = ti.ticket_id WHERE t.status = 'Paid' AND t.business_date = ? AND ti.stylist_id = ?",
                                    (training_date_text, user["stylist_id"]),
                                ).fetchone()
                                my_commission = int(own_row["commission_ksh"] or 0)
                        else:
                            sales_row = conn.execute(
                                "SELECT COALESCE(SUM(total_ksh), 0) AS sales_ksh, COUNT(DISTINCT COALESCE(NULLIF(client_id, ''), lower(client_name))) AS clients FROM tickets WHERE status = 'Paid' AND business_date = ?",
                                (training_date_text,),
                            ).fetchone()
                            commission_row = conn.execute(
                                "SELECT COALESCE(SUM(ti.commission_ksh), 0) AS commission_ksh FROM ticket_items ti JOIN tickets t ON t.id = ti.ticket_id WHERE t.status = 'Paid' AND t.business_date = ?",
                                (training_date_text,),
                            ).fetchone()
                            expense_row = conn.execute(
                                "SELECT COALESCE(SUM(amount_ksh), 0) AS expenses_ksh FROM salon_expenses WHERE expense_date = ?",
                                (training_date_text,),
                            ).fetchone()
                            total_sales = int(sales_row["sales_ksh"] or 0)
                            total_commission = int(commission_row["commission_ksh"] or 0)
                            expenses = int(expense_row["expenses_ksh"] or 0)
                            metrics = {
                                "total_sales_ksh": total_sales,
                                "total_clients": int(sales_row["clients"] or 0),
                                "total_commission_ksh": total_commission,
                                "expenses_ksh": expenses,
                                "profit_ksh": total_sales - total_commission - expenses,
                            }
                            employee_rows = conn.execute(
                                "SELECT u.id AS user_id, u.name, COALESCE(SUM(ti.commission_ksh), 0) AS commission_ksh FROM users u LEFT JOIN ticket_items ti ON ti.stylist_id = u.stylist_id AND ti.ticket_id IN (SELECT id FROM tickets WHERE status = 'Paid' AND business_date = ?) WHERE u.role = 'employee' AND u.active = 1 GROUP BY u.id, u.name ORDER BY u.name",
                                (training_date_text,),
                            ).fetchall()
                            employee_commissions = [{"user_id": row["user_id"], "name": row["name"], "commission_ksh": int(row["commission_ksh"] or 0)} for row in employee_rows]
                            if user["stylist_id"]:
                                own_row = conn.execute(
                                    "SELECT COALESCE(SUM(ti.commission_ksh), 0) AS commission_ksh FROM ticket_items ti JOIN tickets t ON t.id = ti.ticket_id WHERE t.status = 'Paid' AND t.business_date = ? AND ti.stylist_id = ?",
                                    (training_date_text, user["stylist_id"]),
                                ).fetchone()
                                my_commission = int(own_row["commission_ksh"] or 0)
                    self._send_json(200, {
                        "day_of_week": day_of_week,
                        "training_date": training_date.isoformat() if training_date else None,
                        "metrics": metrics,
                        "my_commission_ksh": my_commission,
                        "employee_commissions": employee_commissions,
                    })
                    return

                if path == "/api/settings/business":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required."})
                        return
                    self._send_json(200, {"settings": _business_settings(conn)})
                    return

                if path == "/api/audit-logs":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required."})
                        return
                    try:
                        filter_date = qs.get("date", [None])[0]
                        if filter_date:
                            datetime.date.fromisoformat(filter_date)
                        limit = min(max(int(qs.get("limit", ["100"])[0]), 1), 200)
                    except ValueError:
                        self._send_json(400, {"error": "A valid date and log limit are required."})
                        return
                    query = "SELECT * FROM audit_logs"
                    params: list = []
                    if filter_date:
                        query += " WHERE substr(created_at, 1, 10) = ?"
                        params.append(filter_date)
                    query += " ORDER BY created_at DESC LIMIT ?"
                    params.append(limit)
                    entries = [dict(row) for row in conn.execute(query, params).fetchall()]
                    self._send_json(200, {"entries": entries})
                    return

                if path == "/api/support/requests":
                    if user["role"] == "admin":
                        rows = conn.execute(
                            "SELECT * FROM support_requests ORDER BY updated_at DESC LIMIT 200"
                        ).fetchall()
                    else:
                        rows = conn.execute(
                            """
                            SELECT * FROM support_requests
                            WHERE requester_user_id = ?
                            ORDER BY updated_at DESC LIMIT 100
                            """,
                            (user["id"],),
                        ).fetchall()
                    self._send_json(200, {"requests": [dict(row) for row in rows]})
                    return

                if path == "/api/announcements":
                    rows = conn.execute(
                        """
                        SELECT a.*, CASE WHEN r.user_id IS NULL THEN 0 ELSE 1 END AS is_read
                        FROM announcements a
                        LEFT JOIN announcement_reads r
                          ON r.announcement_id = a.id AND r.user_id = ?
                        ORDER BY a.created_at DESC
                        LIMIT 200
                        """,
                        (user["id"],),
                    ).fetchall()
                    announcements = [dict(row) | {"is_read": bool(row["is_read"])} for row in rows]
                    unread_count = sum(
                        1 for item in announcements
                        if item["sender_user_id"] != user["id"] and not item["is_read"]
                    )
                    self._send_json(200, {"announcements": announcements, "unread_count": unread_count})
                    return

                if path == "/api/payroll/commissions":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required."})
                        return
                    staff_rows = conn.execute(
                        """
                        SELECT u.id, u.name, u.username, u.stylist_id, u.active, s.name AS stylist_name
                        FROM users u LEFT JOIN stylists s ON s.id = u.stylist_id
                        WHERE u.role = 'employee' ORDER BY u.name
                        """
                    ).fetchall()
                    employees = []
                    for staff in staff_rows:
                        totals = commission_totals(conn, staff["stylist_id"] or "")
                        employees.append(dict(staff) | totals)
                    payouts = conn.execute(
                        """
                        SELECT p.id, p.employee_user_id, u.name AS employee_name,
                               p.amount_ksh, p.payment_method, p.reference, p.notes,
                               p.paid_at, p.recorded_by_name
                        FROM commission_payouts p
                        JOIN users u ON u.id = p.employee_user_id
                        ORDER BY p.paid_at DESC LIMIT 200
                        """
                    ).fetchall()
                    self._send_json(200, {"employees": employees, "payouts": [dict(row) for row in payouts]})
                    return

                if path in {"/api/attendance", "/api/employee/attendance"}:
                    employee_view = path == "/api/employee/attendance"
                    if employee_view and user["role"] != "employee":
                        self._send_json(403, {"error": "Employee attendance is available only to the signed-in employee."})
                        return
                    if not employee_view and user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required."})
                        return
                    if employee_view:
                        end_date = qs.get("end", [today])[0]
                        try:
                            end = datetime.date.fromisoformat(end_date)
                            start_date = qs.get("start", [(end - datetime.timedelta(days=29)).isoformat()])[0]
                            start = datetime.date.fromisoformat(start_date)
                            if (end - start).days < 0 or (end - start).days > 365:
                                raise ValueError("date range is invalid")
                        except ValueError:
                            self._send_json(400, {"error": "Choose a valid attendance date range of up to 366 days."})
                            return
                        rows = conn.execute(
                            "SELECT * FROM attendance_records WHERE user_id = ? AND work_date BETWEEN ? AND ? ORDER BY work_date DESC",
                            (user["id"], start_date, end_date),
                        ).fetchall()
                    else:
                        try:
                            filter_date = qs.get("date", [today])[0]
                            datetime.date.fromisoformat(filter_date)
                        except ValueError:
                            self._send_json(400, {"error": "Choose a valid attendance date."})
                            return
                        rows = conn.execute(
                            """
                            SELECT a.*, u.name AS employee_name, u.username,
                                   s.name AS stylist_name
                            FROM attendance_records a
                            JOIN users u ON u.id = a.user_id
                            LEFT JOIN stylists s ON s.id = u.stylist_id
                            WHERE u.role = 'employee' AND a.work_date = ?
                            ORDER BY a.clock_in
                            """,
                            (filter_date,),
                        ).fetchall()
                    self._send_json(200, {"records": [dict(row) for row in rows]})
                    return

                if path == "/api/inventory/reports":
                    query = """
                        SELECT r.*, c.stock_qty
                        FROM inventory_reports r
                        JOIN catalog_items c ON c.id = r.catalog_item_id
                    """
                    if user["role"] == "employee":
                        query += " WHERE r.created_by_user_id = ?"
                        params = (user["id"],)
                    else:
                        params = ()
                    query += " ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END, r.created_at DESC"
                    reports = conn.execute(query, params).fetchall()
                    self._send_json(200, {"reports": [dict(row) for row in reports]})
                    return

                if path == "/api/tasks":
                    query = """
                        SELECT t.*, assignee.name AS assignee_name,
                               creator.name AS creator_name
                        FROM staff_tasks t
                        JOIN users assignee ON assignee.id = t.assigned_to_user_id
                        JOIN users creator ON creator.id = t.created_by_user_id
                    """
                    if user["role"] == "employee":
                        query += " WHERE t.assigned_to_user_id = ?"
                        params = (user["id"],)
                    else:
                        query += " WHERE assignee.role = 'employee'"
                        params = ()
                    query += " ORDER BY CASE t.status WHEN 'assigned' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END, CASE WHEN t.due_date = '' THEN 1 ELSE 0 END, t.due_date, t.created_at DESC"
                    rows = conn.execute(query, params).fetchall()
                    self._send_json(200, {"tasks": [dict(row) for row in rows]})
                    return

                if path in {"/api/employee/earnings", "/api/employee/earnings/export"}:
                    if user["role"] != "employee":
                        self._send_json(403, {"error": "Employee earnings are available only to the signed-in employee."})
                        return
                    try:
                        end_date = qs.get("end", [datetime.date.today().isoformat()])[0]
                        start_date = qs.get("start", [(datetime.date.fromisoformat(end_date) - datetime.timedelta(days=6)).isoformat()])[0]
                        start_value = datetime.date.fromisoformat(start_date)
                        end_value = datetime.date.fromisoformat(end_date)
                        days = (end_value - start_value).days
                        if days < 0 or days > 365:
                            raise ValueError("date range is invalid")
                    except ValueError:
                        self._send_json(400, {"error": "Choose a valid date range of up to 366 days."})
                        return
                    report = compute_employee_earnings(
                        conn,
                        user["stylist_id"] or "",
                        start_date,
                        end_date,
                    )
                    if path.endswith("/export"):
                        output = io.StringIO(newline="")
                        writer = csv.writer(output)
                        writer.writerow(["Date", "Ticket", "Client", "Payment method", "Attributed sales (KSh)", "Commission earned (KSh)", "Commission paid (KSh)", "Commission balance (KSh)", "Items"])
                        for ticket in report["tickets"]:
                            writer.writerow([
                                ticket["business_date"],
                                ticket["ticket_number"],
                                ticket["client_name"],
                                ticket["payment_method"],
                                ticket["attributed_sales_ksh"],
                                ticket["commission_ksh"],
                                ticket["commission_paid_ksh"],
                                ticket["commission_ksh"] - ticket["commission_paid_ksh"],
                                ticket["quantity"],
                            ])
                        payload = output.getvalue().encode("utf-8-sig")
                        self.send_response(200)
                        self.send_header("Content-Type", "text/csv; charset=utf-8")
                        self.send_header("Content-Disposition", f'attachment; filename="employee-earnings-{start_date}-to-{end_date}.csv"')
                        self.send_header("Content-Length", str(len(payload)))
                        self.send_header("Cache-Control", "no-store")
                        self.end_headers()
                        self.wfile.write(payload)
                    else:
                        self._send_json(200, report)
                    return

                if path in ("/api/tickets", "/api/analytics", "/api/analytics/trend", "/api/ledger/export") and user["role"] != "admin":
                    self._send_json(403, {"error": "Administrator access is required."})
                    return

                if path == "/api/employees" and user["role"] != "admin":
                    self._send_json(403, {"error": "Administrator access is required."})
                    return

                if path == "/api/employees":
                    employees = conn.execute(
                        "SELECT id, name, username, email, phone, job_title, stylist_id, role, active, created_at FROM users WHERE role = 'employee' ORDER BY name"
                    ).fetchall()
                    self._send_json(200, {"employees": [_public_user(row) | {"created_at": row["created_at"]} for row in employees]})
                    return

                if path == "/api/superadmin/admins":
                    if not bool(user["is_superadmin"]):
                        self._send_json(403, {"error": "Superadmin access is required to manage Admin accounts."})
                        return
                    admins = conn.execute(
                        "SELECT * FROM users WHERE role = 'admin' AND is_superadmin = 0 ORDER BY name"
                    ).fetchall()
                    self._send_json(200, {"admins": [_public_user(row) | {"created_at": row["created_at"]} for row in admins]})
                    return

                if path == "/api/bootstrap":
                    stylists = [dict(r) for r in conn.execute("SELECT * FROM stylists WHERE active = 1 ORDER BY name").fetchall()]
                    catalog = [dict(r) for r in conn.execute("SELECT * FROM catalog_items WHERE active = 1 ORDER BY kind, category, name").fetchall()]
                    clients = [dict(r) for r in conn.execute("SELECT * FROM clients ORDER BY name ASC").fetchall()]
                    if user["role"] != "admin":
                        if user["stylist_id"]:
                            assigned_client_ids = {
                                row["client_id"]
                                for row in conn.execute(
                                    "SELECT DISTINCT client_id FROM appointments WHERE stylist_id = ?",
                                    (user["stylist_id"],),
                                ).fetchall()
                            }
                            clients = [client for client in clients if client["id"] in assigned_client_ids]
                        else:
                            clients = []
                        for client in clients:
                            client["total_spent_ksh"] = 0
                        attach_employee_client_history(conn, clients, user["stylist_id"] or "")
                    appointments = fetch_appointments(conn, date_str)
                    employee_dashboard = None
                    if user["role"] == "employee":
                        if user["stylist_id"]:
                            appointments = [appointment for appointment in appointments if appointment["stylist_id"] == user["stylist_id"]]
                            stylists = [stylist for stylist in stylists if stylist["id"] == user["stylist_id"]]
                        else:
                            appointments = []
                            stylists = []
                        employee_dashboard = compute_employee_dashboard(conn, date_str, user["stylist_id"] or "", user["id"])
                    if user["role"] == "admin":
                        analytics = compute_analytics(conn, date_str)
                        tickets = fetch_tickets(conn, date_str)
                    else:
                        full_analytics = compute_analytics(conn, date_str)
                        analytics = {
                            **full_analytics,
                            "gross_revenue_ksh": 0,
                            "total_discounts_ksh": 0,
                            "settled_tickets": 0,
                            "total_tickets": 0,
                            "avg_ticket_ksh": 0,
                            "total_commissions_ksh": 0,
                            "payment_breakdown": {"M-Pesa": 0, "Card": 0, "Cash": 0},
                            "stylist_leaderboard": [],
                            "low_stock_count": 0,
                        }
                        tickets = []
                    self._send_json(
                        200,
                        {
                            "date": date_str,
                            "business_settings": _business_settings(conn),
                            "stylists": stylists,
                            "catalog": catalog,
                            "clients": clients,
                            "appointments": appointments,
                            "analytics": analytics,
                            "tickets": tickets,
                            "employee_dashboard": employee_dashboard,
                        },
                    )
                    return

                if path == "/api/appointments":
                    appointments = fetch_appointments(conn, date_str)
                    if user["role"] == "employee":
                        appointments = [appointment for appointment in appointments if user["stylist_id"] and appointment["stylist_id"] == user["stylist_id"]]
                    self._send_json(200, {"date": date_str, "appointments": appointments})
                    return

                if path == "/api/clients":
                    clients = [dict(r) for r in conn.execute("SELECT * FROM clients ORDER BY name ASC").fetchall()]
                    if user["role"] != "admin":
                        if user["stylist_id"]:
                            assigned_client_ids = {
                                row["client_id"] for row in conn.execute(
                                    "SELECT DISTINCT client_id FROM appointments WHERE stylist_id = ?",
                                    (user["stylist_id"],),
                                ).fetchall()
                            }
                            clients = [client for client in clients if client["id"] in assigned_client_ids]
                        else:
                            clients = []
                        for client in clients:
                            client["total_spent_ksh"] = 0
                        attach_employee_client_history(conn, clients, user["stylist_id"] or "")
                    self._send_json(200, {"clients": clients})
                    return

                if path == "/api/expenses":
                    rows = conn.execute("SELECT * FROM salon_expenses ORDER BY expense_date DESC, updated_at DESC LIMIT 500").fetchall()
                    self._send_json(200, {"expenses": [dict(row) for row in rows]})
                    return

                if path == "/api/catalog":
                    catalog = [dict(r) for r in conn.execute("SELECT * FROM catalog_items WHERE active = 1 ORDER BY kind, category, name").fetchall()]
                    self._send_json(200, {"catalog": catalog})
                    return

                if path == "/api/tickets":
                    filter_date = qs.get("date", [None])[0]
                    self._send_json(200, {"tickets": fetch_tickets(conn, filter_date)})
                    return

                if path == "/api/analytics":
                    self._send_json(200, compute_analytics(conn, date_str))
                    return

                if path == "/api/analytics/trend":
                    try:
                        days = int(qs.get("days", ["30"])[0])
                        if days < 7 or days > 90:
                            raise ValueError("days out of range")
                        datetime.date.fromisoformat(date_str)
                    except ValueError:
                        self._send_json(400, {"error": "A valid date and a range from 7 to 90 days are required."})
                        return
                    self._send_json(
                        200,
                        {"date": date_str, "days": days, "points": compute_revenue_trend(conn, date_str, days)},
                    )
                    return

                if path == "/api/ledger/export":
                    tickets = fetch_tickets(conn, date_str)
                    buf = io.StringIO()
                    writer = csv.writer(buf)
                    writer.writerow([
                        "Ticket Number",
                        "Business Date",
                        "Timestamp",
                        "Client",
                        "Payment Method",
                        "Subtotal (KSh)",
                        "Discount (KSh)",
                        "VAT 16% Incl (KSh)",
                        "Total (KSh)",
                        "Status",
                        "Items",
                    ])
                    for t in tickets:
                        item_summary = "; ".join(
                            f"{it['quantity']}x {it['item_name']} ({it['stylist_name'] or 'Studio'})"
                            for it in t["items"]
                        )
                        writer.writerow([
                            t["ticket_number"],
                            t["business_date"],
                            t["created_at"],
                            t["client_name"],
                            t["payment_method"],
                            t["subtotal_ksh"],
                            t["discount_ksh"],
                            t["tax_ksh"],
                            t["total_ksh"],
                            t["status"],
                            item_summary,
                        ])
                    self._send_csv(f"salon-pro-ledger-{date_str}.csv", buf.getvalue())
                    return

                self._send_json(404, {"error": f"Unknown endpoint: {path}"})
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            finally:
                conn.close()

    def _handle_password_reset_request(self, body: dict) -> None:
        generic_message = "If an active account uses that email, a password reset link will be sent shortly."
        config, config_error = _password_reset_config()
        if not config:
            self._send_json(
                503,
                {
                    "error": (
                        "Password reset email configuration is incomplete or invalid: "
                        f"{config_error}. Update these Vercel Production environment variables "
                        "and redeploy the app."
                    )
                },
            )
            return

        email_value = body.get("email", "")
        email = email_value.strip().lower() if isinstance(email_value, str) else ""
        if not email or len(email) > 254 or "@" not in email:
            self._send_json(200, {"message": generic_message})
            return

        now = datetime.datetime.now(datetime.timezone.utc)
        now_epoch = int(now.timestamp())
        token = secrets.token_urlsafe(32)
        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        destination = ""
        role = ""
        created = False
        remote_ip = self.headers.get("X-Real-IP", "").strip()
        if not remote_ip:
            forwarded_for = self.headers.get("X-Forwarded-For", "")
            if forwarded_for:
                remote_ip = forwarded_for.split(",", 1)[0].strip()
        if not remote_ip:
            client_address = getattr(self, "client_address", None)
            remote_ip = client_address[0] if client_address else "unknown"
        reset_ip_key = hashlib.sha256(f"password-reset-ip:{remote_ip}".encode("utf-8")).hexdigest()
        rate_limited = False

        with DB_LOCK:
            conn = get_conn()
            try:
                if not _password_reset_table_ready(conn):
                    self._send_json(503, {"error": "Password recovery is not ready yet. Please try again later."})
                    return
                attempt = conn.execute(
                    "SELECT attempts, locked_until FROM auth_attempts WHERE account_key = ?",
                    (reset_ip_key,),
                ).fetchone()
                if attempt and attempt["locked_until"] > now_epoch:
                    rate_limited = True
                else:
                    attempts = (attempt["attempts"] if attempt and not attempt["locked_until"] else 0) + 1
                    locked_until = now_epoch + 900 if attempts >= 3 else 0
                    conn.execute(
                        "INSERT INTO auth_attempts (account_key, attempts, locked_until) VALUES (?, ?, ?) "
                        "ON CONFLICT(account_key) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until",
                        (reset_ip_key, attempts, locked_until),
                    )

                user = None if rate_limited or not email or len(email) > 254 or "@" not in email else conn.execute(
                    "SELECT id, email, username, name, role, is_superadmin FROM users WHERE lower(email) = ? AND active = 1",
                    (email,),
                ).fetchone()
                if user and not rate_limited:
                    previous = conn.execute(
                        "SELECT created_at FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
                        (user["id"],),
                    ).fetchone()
                    recently_requested = False
                    if previous:
                        try:
                            previous_time = datetime.datetime.fromisoformat(previous["created_at"])
                            recently_requested = (now - previous_time).total_seconds() < 120
                        except (TypeError, ValueError):
                            recently_requested = False

                    if not recently_requested:
                        conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user["id"],))
                        conn.execute(
                            "INSERT INTO password_reset_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)",
                            (
                                token_hash,
                                user["id"],
                                now_epoch + 900,
                                now.isoformat(timespec="seconds"),
                            ),
                        )
                        conn.commit()
                        destination = user["email"]
                        role = "superadmin" if user["is_superadmin"] else user["role"]
                        created = True
                conn.commit()
            finally:
                conn.close()

        if created:
            reset_url = f"{config['base_url']}/{role}#{urlencode({'reset_token': token})}"
            try:
                _send_password_reset_email(destination, reset_url, config)
            except (OSError, smtplib.SMTPException, ssl.SSLError) as exc:
                with DB_LOCK:
                    conn = get_conn()
                    try:
                        conn.execute("DELETE FROM password_reset_tokens WHERE token_hash = ?", (token_hash,))
                        conn.commit()
                    finally:
                        conn.close()
                print(f"Password reset email delivery failed ({exc.__class__.__name__}).")
                self._send_json(503, {"error": _password_reset_delivery_error(exc)})
                return

        self._send_json(200, {"message": generic_message})

    def _handle_password_reset_confirm(self, body: dict) -> None:
        token = body.get("token", "")
        new_password = body.get("new_password", "")
        if not isinstance(token, str) or not token or not isinstance(new_password, str):
            self._send_json(400, {"error": "This reset link is invalid or expired. Request a new one."})
            return
        if len(new_password) < 10 or len(new_password) > 128:
            self._send_json(400, {"error": "Password must be between 10 and 128 characters."})
            return

        token_hash = hashlib.sha256(token.encode("utf-8")).hexdigest()
        now_epoch = int(time.time())
        with DB_LOCK:
            conn = get_conn()
            try:
                if not _password_reset_table_ready(conn):
                    self._send_json(503, {"error": "Password recovery is not ready yet. Please try again later."})
                    return
                reset = conn.execute(
                    "SELECT user_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?",
                    (token_hash, now_epoch),
                ).fetchone()
                if not reset:
                    self._send_json(400, {"error": "This reset link is invalid or expired. Request a new one."})
                    return

                consumed = conn.execute(
                    "DELETE FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?",
                    (token_hash, now_epoch),
                ).rowcount
                if consumed != 1:
                    self._send_json(400, {"error": "This reset link is invalid or expired. Request a new one."})
                    return

                user = conn.execute(
                    "SELECT * FROM users WHERE id = ? AND active = 1",
                    (reset["user_id"],),
                ).fetchone()
                if not user:
                    conn.execute("DELETE FROM password_reset_tokens WHERE token_hash = ?", (token_hash,))
                    conn.commit()
                    self._send_json(400, {"error": "This reset link is invalid or expired. Request a new one."})
                    return

                password_salt, password_digest = _credential_hash(new_password)
                conn.execute(
                    "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
                    (password_salt, password_digest, user["id"]),
                )
                conn.execute("DELETE FROM sessions WHERE user_id = ?", (user["id"],))
                conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (user["id"],))
                account_key = hashlib.sha256(user["username"].strip().lower().encode("utf-8")).hexdigest()
                conn.execute("DELETE FROM auth_attempts WHERE account_key = ?", (account_key,))
                _record_audit_event(conn, user, "password_reset", "account", "Password reset using verified email.")
                conn.commit()
                self._send_json(200, {"reset": True})
            finally:
                conn.close()

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json()
        except Exception:
            self._send_json(400, {"error": "Invalid JSON payload"})
            return

        if path == "/api/auth/password-reset/request":
            try:
                self._handle_password_reset_request(body)
            except Exception as exc:
                print(f"Password reset request failed ({exc.__class__.__name__}).")
                self._send_json(500, {"error": "Password reset service is temporarily unavailable."})
            return
        if path == "/api/auth/password-reset/confirm":
            try:
                self._handle_password_reset_confirm(body)
            except Exception as exc:
                print(f"Password reset confirmation failed ({exc.__class__.__name__}).")
                self._send_json(500, {"error": "Password reset service is temporarily unavailable."})
            return

        with DB_LOCK:
            conn = get_conn()
            try:
                if path == "/api/auth/setup":
                    if conn.execute("SELECT 1 FROM users WHERE role = 'admin' AND active = 1 LIMIT 1").fetchone():
                        self._send_json(409, {"error": "Administrator setup is already complete."})
                        return
                    name = body.get("name", "").strip()
                    username = body.get("username", "").strip().lower()
                    email = body.get("email", "").strip().lower()
                    password = body.get("password", "")
                    if not name or len(name) > 120 or not USERNAME_PATTERN.fullmatch(username):
                        self._send_json(400, {"error": "Enter a username with 3-30 letters, numbers, dots, dashes or underscores."})
                        return
                    if "@" not in email:
                        self._send_json(400, {"error": "Enter a valid work email."})
                        return
                    if len(password) < 10:
                        self._send_json(400, {"error": "Password must be at least 10 characters."})
                        return
                    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
                        self._send_json(409, {"error": "That username is already in use."})
                        return
                    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                        self._send_json(409, {"error": "An account already uses that email."})
                        return
                    password_salt, password_digest = _credential_hash(password)
                    pin_salt, pin_digest = _credential_hash(secrets.token_urlsafe(32))
                    user_id = f"usr-{uuid.uuid4().hex[:12]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO users (id, name, username, email, password_salt, password_hash, pin_salt, pin_hash, role, is_superadmin, active, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 0, 1, ?)
                        """,
                        (user_id, name, username, email, password_salt, password_digest, pin_salt, pin_digest, now_iso),
                    )
                    created_user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
                    token, expires_at = _create_session(conn, user_id)
                    _record_audit_event(conn, created_user, "create", "administrator", "Administrator account created.")
                    conn.commit()
                    cookie = f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL_SECONDS}"
                    if self.headers.get("X-Forwarded-Proto") == "https":
                        cookie += "; Secure"
                    self._send_json(
                        201,
                        {"user": _public_user(created_user), "expires_at": expires_at},
                        {"Set-Cookie": cookie},
                    )
                    return

                if path == "/api/auth/setup/superadmin":
                    if conn.execute("SELECT 1 FROM users WHERE is_superadmin = 1 LIMIT 1").fetchone():
                        self._send_json(409, {"error": "Superadmin setup is already complete."})
                        return
                    name = body.get("name", "").strip()
                    username = body.get("username", "").strip().lower()
                    email = body.get("email", "").strip().lower()
                    password = body.get("password", "")
                    if not name or not USERNAME_PATTERN.fullmatch(username):
                        self._send_json(400, {"error": "Enter a username with 3-30 letters, numbers, dots, dashes or underscores."})
                        return
                    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254 or not isinstance(password, str) or len(password) < 10 or len(password) > 128:
                        self._send_json(400, {"error": "Enter a valid email and a password between 10 and 128 characters."})
                        return
                    if conn.execute("SELECT 1 FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)", (username, email)).fetchone():
                        self._send_json(409, {"error": "That username or email is already in use."})
                        return
                    password_salt, password_digest = _credential_hash(password)
                    pin_salt, pin_digest = _credential_hash(secrets.token_urlsafe(32))
                    user_id = f"usr-{uuid.uuid4().hex[:12]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute("INSERT INTO users (id, name, username, email, password_salt, password_hash, pin_salt, pin_hash, role, is_superadmin, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 1, 1, ?)", (user_id, name, username, email, password_salt, password_digest, pin_salt, pin_digest, now_iso))
                    conn.execute("UPDATE users SET is_superadmin = 0 WHERE is_superadmin = 1 AND id <> ?", (user_id,))
                    created_user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
                    token, expires_at = _create_session(conn, user_id)
                    _record_audit_event(conn, created_user, "create", "superadmin", "Initial Superadmin account created.")
                    conn.commit()
                    cookie = f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL_SECONDS}"
                    if self.headers.get("X-Forwarded-Proto") == "https": cookie += "; Secure"
                    self._send_json(201, {"user": _public_user(created_user), "expires_at": expires_at}, {"Set-Cookie": cookie})
                    return

                if path == "/api/auth/login":
                    username = body.get("username", "").strip().lower()
                    password = body.get("password", "")
                    expected_role = body.get("role", "")
                    account_key = hashlib.sha256(username.encode("utf-8")).hexdigest()
                    now_epoch = int(time.time())
                    attempt = conn.execute(
                        "SELECT attempts, locked_until FROM auth_attempts WHERE account_key = ?",
                        (account_key,),
                    ).fetchone()
                    if attempt and attempt["locked_until"] > now_epoch:
                        self._send_json(429, {"error": "Too many sign-in attempts. Try again in 15 minutes."})
                        return

                    user = conn.execute(
                        "SELECT * FROM users WHERE username = ? AND active = 1",
                        (username,),
                    ).fetchone()
                    valid_credential = bool(
                        user
                        and expected_role in ("superadmin", "admin", "employee")
                        and _public_user(user)["role"] == expected_role
                        and password
                        and _credential_matches(password, user["password_salt"], user["password_hash"])
                    )
                    if not valid_credential:
                        attempts = (
                            1
                            if attempt and attempt["locked_until"] and attempt["locked_until"] <= now_epoch
                            else (attempt["attempts"] if attempt else 0) + 1
                        )
                        locked_until = now_epoch + 900 if attempts >= 15 else 0
                        conn.execute(
                            """
                            INSERT INTO auth_attempts (account_key, attempts, locked_until)
                            VALUES (?, ?, ?)
                            ON CONFLICT(account_key) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until
                            """,
                            (account_key, attempts, locked_until),
                        )
                        conn.commit()
                        if attempts >= 15:
                            self._send_json(429, {"error": "Too many sign-in attempts. Try again in 15 minutes."})
                            return
                        self._send_json(401, {"error": "Username, password, or access link is incorrect."})
                        return

                    conn.execute("DELETE FROM auth_attempts WHERE account_key = ?", (account_key,))
                    token, expires_at = _create_session(conn, user["id"])
                    _record_audit_event(conn, user, "sign_in", "session", "Successful sign-in.")
                    conn.commit()
                    cookie = f"{SESSION_COOKIE}={token}; Path=/; HttpOnly; SameSite=Strict; Max-Age={SESSION_TTL_SECONDS}"
                    if self.headers.get("X-Forwarded-Proto") == "https":
                        cookie += "; Secure"
                    self._send_json(
                        200,
                        {"user": _public_user(user), "expires_at": expires_at},
                        {"Set-Cookie": cookie},
                    )
                    return

                if path == "/api/auth/logout":
                    token = _session_token_from_cookie(self.headers.get("Cookie"))
                    user = _current_user(conn, self.headers.get("Cookie"))
                    if token:
                        if user:
                            _record_audit_event(conn, user, "sign_out", "session", "Signed out.")
                        conn.execute(
                            "DELETE FROM sessions WHERE token_hash = ?",
                            (hashlib.sha256(token.encode("utf-8")).hexdigest(),),
                        )
                        conn.commit()
                    self._send_json(
                        200,
                        {"logged_out": True},
                        {"Set-Cookie": f"{SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"},
                    )
                    return

                user = _current_user(conn, self.headers.get("Cookie"))
                if not user:
                    self._send_json(401, {"error": "Sign in to continue."})
                    return

                if path == "/api/auth/change-password":
                    current_password = body.get("current_password")
                    new_password = body.get("new_password")
                    if not isinstance(current_password, str) or not isinstance(new_password, str):
                        self._send_json(400, {"error": "Enter your current and new passwords."})
                        return
                    if len(new_password) < 10 or len(new_password) > 128:
                        self._send_json(400, {"error": "New password must be between 10 and 128 characters."})
                        return
                    if not _credential_matches(current_password, user["password_salt"], user["password_hash"]):
                        self._send_json(401, {"error": "Current password is incorrect."})
                        return
                    password_salt, password_digest = _credential_hash(new_password)
                    current_token_hash = hashlib.sha256(
                        _session_token_from_cookie(self.headers.get("Cookie")).encode("utf-8")
                    ).hexdigest()
                    conn.execute(
                        "UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?",
                        (password_salt, password_digest, user["id"]),
                    )
                    conn.execute(
                        "DELETE FROM sessions WHERE user_id = ? AND token_hash != ?",
                        (user["id"], current_token_hash),
                    )
                    _record_audit_event(conn, user, "change_password", "account", "Account password changed.")
                    conn.commit()
                    self._send_json(200, {"changed": True})
                    return

                if path in {"/api/employee/attendance/clock-in", "/api/employee/attendance/clock-out"}:
                    if user["role"] != "employee":
                        self._send_json(403, {"error": "Employee attendance is available only to the signed-in employee."})
                        return
                    now = datetime.datetime.now().astimezone()
                    work_date = now.date().isoformat()
                    now_iso = now.isoformat(timespec="seconds")
                    existing = conn.execute(
                        "SELECT * FROM attendance_records WHERE user_id = ? AND work_date = ?",
                        (user["id"], work_date),
                    ).fetchone()
                    if path.endswith("/clock-in"):
                        if existing:
                            message = "You are already clocked in." if not existing["clock_out"] else "You have already completed attendance for today."
                            self._send_json(409, {"error": message})
                            return
                        record_id = f"att-{uuid.uuid4().hex[:12]}"
                        conn.execute(
                            "INSERT INTO attendance_records (id, user_id, work_date, clock_in, clock_out, created_at) VALUES (?, ?, ?, ?, '', ?)",
                            (record_id, user["id"], work_date, now_iso, now_iso),
                        )
                        summary = "Employee clocked in."
                    else:
                        if not existing or existing["clock_out"]:
                            self._send_json(409, {"error": "Clock in before clocking out."})
                            return
                        record_id = existing["id"]
                        conn.execute("UPDATE attendance_records SET clock_out = ? WHERE id = ?", (now_iso, record_id))
                        summary = "Employee clocked out."
                    _record_audit_event(conn, user, "clock_in" if path.endswith("/clock-in") else "clock_out", "attendance", summary, record_id)
                    conn.commit()
                    record = conn.execute("SELECT * FROM attendance_records WHERE id = ?", (record_id,)).fetchone()
                    self._send_json(200, {"record": dict(record)})
                    return

                if path == "/api/inventory/reports":
                    item_id = body.get("catalog_item_id", "")
                    report_type = body.get("report_type", "")
                    note = body.get("note", "")
                    raw_quantity = body.get("quantity", 1)
                    if not isinstance(item_id, str) or not isinstance(report_type, str) or not isinstance(note, str):
                        self._send_json(400, {"error": "Inventory report fields are invalid."})
                        return
                    if isinstance(raw_quantity, bool) or (isinstance(raw_quantity, float) and not raw_quantity.is_integer()):
                        self._send_json(400, {"error": "Quantity must be a whole number."})
                        return
                    try:
                        quantity = int(raw_quantity)
                    except (TypeError, ValueError):
                        self._send_json(400, {"error": "Quantity must be a whole number."})
                        return
                    item = conn.execute("SELECT * FROM catalog_items WHERE id = ? AND kind = 'product' AND active = 1", (item_id,)).fetchone()
                    if not item:
                        self._send_json(404, {"error": "Active product was not found."})
                        return
                    if report_type not in {"usage", "low_stock", "damaged"} or len(note.strip()) > 500:
                        self._send_json(400, {"error": "Choose usage, low stock, or damaged and keep the note within 500 characters."})
                        return
                    if report_type in {"usage", "damaged"} and (quantity <= 0 or quantity > int(item["stock_qty"])):
                        self._send_json(400, {"error": f"Enter a quantity from 1 to {item['stock_qty']} for this stock report."})
                        return
                    if report_type == "low_stock":
                        duplicate = conn.execute(
                            "SELECT 1 FROM inventory_reports WHERE catalog_item_id = ? AND report_type = 'low_stock' AND status = 'open' LIMIT 1",
                            (item_id,),
                        ).fetchone()
                        if duplicate:
                            self._send_json(409, {"error": "An open low-stock report already exists for this product."})
                            return
                        quantity = int(item["stock_qty"])
                    else:
                        conn.execute("UPDATE catalog_items SET stock_qty = stock_qty - ? WHERE id = ?", (quantity, item_id))
                    report_id = f"inv-{uuid.uuid4().hex[:12]}"
                    created_at = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO inventory_reports
                            (id, catalog_item_id, item_name, report_type, quantity, note, status, created_by_user_id, created_by_name, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)
                        """,
                        (report_id, item_id, item["name"], report_type, quantity, note.strip(), user["id"], user["name"], created_at),
                    )
                    summary = f"Inventory {report_type.replace('_', ' ')} report for {item['name']} ({quantity} units)."
                    _record_audit_event(conn, user, "report", "inventory", summary, report_id)
                    conn.commit()
                    report = conn.execute("SELECT r.*, c.stock_qty FROM inventory_reports r JOIN catalog_items c ON c.id = r.catalog_item_id WHERE r.id = ?", (report_id,)).fetchone()
                    updated_item = conn.execute("SELECT * FROM catalog_items WHERE id = ?", (item_id,)).fetchone()
                    self._send_json(201, {"report": dict(report), "item": dict(updated_item)})
                    return

                if path == "/api/tasks":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required to assign tasks."})
                        return
                    title = body.get("title", "")
                    description = body.get("description", "")
                    assignee_id = body.get("assigned_to_user_id", "")
                    due_date = body.get("due_date", "")
                    priority = body.get("priority", "normal")
                    if not all(isinstance(value, str) for value in (title, description, assignee_id, due_date, priority)):
                        self._send_json(400, {"error": "Task fields must be text values."})
                        return
                    title, description, assignee_id, due_date, priority = title.strip(), description.strip(), assignee_id.strip(), due_date.strip(), priority.strip().lower()
                    if not title or len(title) > 120 or len(description) > 1000:
                        self._send_json(400, {"error": "Task title is required (120 characters max) and description must be 1000 characters or fewer."})
                        return
                    if priority not in {"low", "normal", "high", "urgent"}:
                        self._send_json(400, {"error": "Choose low, normal, high, or urgent task priority."})
                        return
                    if due_date:
                        try:
                            datetime.date.fromisoformat(due_date)
                        except ValueError:
                            self._send_json(400, {"error": "Choose a valid task due date."})
                            return
                    assignee = conn.execute("SELECT id FROM users WHERE id = ? AND role = 'employee' AND active = 1", (assignee_id,)).fetchone()
                    if not assignee:
                        self._send_json(400, {"error": "Choose an active employee for this task."})
                        return
                    task_id = f"task-{uuid.uuid4().hex[:12]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO staff_tasks
                            (id, title, description, assigned_to_user_id, created_by_user_id, status, priority, due_date, created_at, updated_at)
                        VALUES (?, ?, ?, ?, ?, 'assigned', ?, ?, ?, ?)
                        """,
                        (task_id, title, description, assignee_id, user["id"], priority, due_date, now_iso, now_iso),
                    )
                    _record_audit_event(conn, user, "assign", "staff_task", f"Assigned task: {title}.", task_id)
                    conn.commit()
                    task = conn.execute(
                        """
                        SELECT t.*, assignee.name AS assignee_name, creator.name AS creator_name
                        FROM staff_tasks t
                        JOIN users assignee ON assignee.id = t.assigned_to_user_id
                        JOIN users creator ON creator.id = t.created_by_user_id
                        WHERE t.id = ?
                        """,
                        (task_id,),
                    ).fetchone()
                    self._send_json(201, {"task": dict(task)})
                    return

                if path == "/api/payroll/payouts":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required to record commission payouts."})
                        return
                    employee_id = body.get("employee_id", "")
                    payment_method = body.get("payment_method", "")
                    reference = body.get("reference", "")
                    notes = body.get("notes", "")
                    raw_amount = body.get("amount_ksh", 0)
                    if isinstance(raw_amount, bool) or (isinstance(raw_amount, float) and not raw_amount.is_integer()):
                        self._send_json(400, {"error": "Enter a whole-number payout amount."})
                        return
                    try:
                        amount_ksh = int(raw_amount)
                    except (TypeError, ValueError):
                        self._send_json(400, {"error": "Enter a whole-number payout amount."})
                        return
                    if not isinstance(employee_id, str) or not isinstance(payment_method, str) or not isinstance(reference, str) or not isinstance(notes, str):
                        self._send_json(400, {"error": "Payout fields must be text values."})
                        return
                    reference, notes = reference.strip(), notes.strip()
                    if amount_ksh <= 0 or amount_ksh > 100000000:
                        self._send_json(400, {"error": "Payout amount must be a positive whole number."})
                        return
                    if payment_method not in {"Cash", "M-Pesa", "Bank Transfer"} or len(reference) > 100 or len(notes) > 500:
                        self._send_json(400, {"error": "Choose a payment method and keep the reference and note within their limits."})
                        return
                    employee = conn.execute(
                        "SELECT id, name, stylist_id FROM users WHERE id = ? AND role = 'employee'",
                        (employee_id,),
                    ).fetchone()
                    if not employee or not employee["stylist_id"]:
                        self._send_json(404, {"error": "Employee account or stylist profile was not found."})
                        return
                    outstanding = outstanding_commission_items(conn, employee["stylist_id"])
                    balance_ksh = sum(int(row["outstanding_ksh"]) for row in outstanding)
                    if amount_ksh > balance_ksh:
                        self._send_json(409, {"error": f"Payout exceeds the unpaid commission balance of KSh {balance_ksh:,}.", "balance_ksh": balance_ksh})
                        return
                    payout_id = f"pay-{uuid.uuid4().hex[:12]}"
                    paid_at = datetime.datetime.now().astimezone().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO commission_payouts
                            (id, employee_user_id, stylist_id, amount_ksh, payment_method, reference, notes, paid_at, recorded_by_user_id, recorded_by_name, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (payout_id, employee["id"], employee["stylist_id"], amount_ksh, payment_method, reference, notes, paid_at, user["id"], user["name"], paid_at),
                    )
                    remaining = amount_ksh
                    for item in outstanding:
                        if remaining <= 0:
                            break
                        allocated = min(remaining, int(item["outstanding_ksh"]))
                        conn.execute(
                            "INSERT INTO commission_payout_items (id, payout_id, ticket_item_id, amount_ksh) VALUES (?, ?, ?, ?)",
                            (f"payi-{uuid.uuid4().hex[:12]}", payout_id, item["ticket_item_id"], allocated),
                        )
                        remaining -= allocated
                    _record_audit_event(conn, user, "pay", "commission", f"Recorded KSh {amount_ksh:,} commission payout to {employee['name']}.", payout_id)
                    conn.commit()
                    self._send_json(201, {
                        "payout": {
                            "id": payout_id,
                            "employee_user_id": employee["id"],
                            "employee_name": employee["name"],
                            "amount_ksh": amount_ksh,
                            "payment_method": payment_method,
                            "reference": reference,
                            "notes": notes,
                            "paid_at": paid_at,
                            "recorded_by_name": user["name"],
                        }
                    })
                    return

                if path.startswith("/api/announcements/") and path.endswith("/read"):
                    announcement_id = path.split("/")[-2]
                    exists = conn.execute("SELECT 1 FROM announcements WHERE id = ?", (announcement_id,)).fetchone()
                    if not exists:
                        self._send_json(404, {"error": "Announcement not found."})
                        return
                    conn.execute(
                        "INSERT OR IGNORE INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)",
                        (announcement_id, user["id"], datetime.datetime.now().isoformat(timespec="seconds")),
                    )
                    conn.commit()
                    self._send_json(200, {"read": True, "id": announcement_id})
                    return

                if path == "/api/announcements":
                    title = body.get("title")
                    message = body.get("message")
                    if not isinstance(title, str) or not isinstance(message, str):
                        self._send_json(400, {"error": "Enter an announcement title and message."})
                        return
                    title = title.strip()
                    message = message.strip()
                    if len(title) < 4 or len(title) > 120 or len(message) < 5 or len(message) > 2000:
                        self._send_json(400, {"error": "Title must be 4-120 characters and message must be 5-2000 characters."})
                        return
                    announcement_id = f"ann-{uuid.uuid4().hex[:12]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO announcements
                            (id, sender_user_id, sender_name, sender_role, title, message, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?)
                        """,
                        (announcement_id, user["id"], user["name"], user["role"], title, message, now_iso),
                    )
                    conn.execute(
                        "INSERT INTO announcement_reads (announcement_id, user_id, read_at) VALUES (?, ?, ?)",
                        (announcement_id, user["id"], now_iso),
                    )
                    _record_audit_event(conn, user, "publish", "announcement", f"Published announcement: {title}.", announcement_id)
                    conn.commit()
                    self._send_json(201, {
                        "announcement": {
                            "id": announcement_id,
                            "sender_user_id": user["id"],
                            "sender_name": user["name"],
                            "sender_role": user["role"],
                            "title": title,
                            "message": message,
                            "created_at": now_iso,
                            "is_read": True,
                        }
                    })
                    return

                if path == "/api/support/requests":
                    category = body.get("category")
                    priority = body.get("priority")
                    subject = body.get("subject")
                    message = body.get("message")
                    categories = {"Access & accounts", "Appointments", "Sales & payments", "Clients", "Inventory", "Other"}
                    if (
                        not isinstance(category, str)
                        or category not in categories
                        or not isinstance(priority, str)
                        or priority not in {"low", "normal", "high"}
                        or not isinstance(subject, str)
                        or not isinstance(message, str)
                    ):
                        self._send_json(400, {"error": "Choose a valid category and priority and enter a subject and message."})
                        return
                    subject = subject.strip()
                    message = message.strip()
                    if len(subject) < 5 or len(subject) > 120 or len(message) < 10 or len(message) > 4000:
                        self._send_json(400, {"error": "Subject must be 5-120 characters and message must be 10-4000 characters."})
                        return
                    request_id = f"sup-{uuid.uuid4().hex[:12]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO support_requests
                            (id, requester_user_id, requester_name, requester_email, category, priority, subject, message,
                             status, admin_reply, created_at, updated_at, updated_by)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', '', ?, ?, ?)
                        """,
                        (request_id, user["id"], user["name"], user["email"], category, priority, subject, message, now_iso, now_iso, user["id"]),
                    )
                    _record_audit_event(conn, user, "create", "support_request", "Support request submitted.", request_id)
                    conn.commit()
                    request_row = conn.execute("SELECT * FROM support_requests WHERE id = ?", (request_id,)).fetchone()
                    self._send_json(201, {"request": dict(request_row)})
                    return

                if path == "/api/employees":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required."})
                        return
                    name = body.get("name", "").strip()
                    username = body.get("username", "").strip().lower()
                    email = body.get("email", "").strip().lower()
                    phone = body.get("phone", "")
                    job_title = body.get("job_title", "")
                    password = body.get("password", "")
                    if not isinstance(phone, str) or len(phone.strip()) > 40:
                        self._send_json(400, {"error": "Phone number must be text and 40 characters or fewer."})
                        return
                    phone = phone.strip()
                    if not isinstance(job_title, str) or not 2 <= len(job_title) <= 80:
                        self._send_json(400, {"error": "Enter the employee's position (2-80 characters)."})
                        return
                    job_title = job_title.strip()
                    if not 2 <= len(job_title) <= 80:
                        self._send_json(400, {"error": "Enter the employee's position (2-80 characters)."})
                        return
                    if not name or len(name) > 120 or not USERNAME_PATTERN.fullmatch(username):
                        self._send_json(400, {"error": "Enter a username with 3-30 letters, numbers, dots, dashes or underscores."})
                        return
                    if "@" not in email:
                        self._send_json(400, {"error": "Enter a valid employee work email."})
                        return
                    if len(password) < 10:
                        self._send_json(400, {"error": "Password must be at least 10 characters."})
                        return
                    if conn.execute("SELECT 1 FROM users WHERE username = ?", (username,)).fetchone():
                        self._send_json(409, {"error": "That username is already in use."})
                        return
                    if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                        self._send_json(409, {"error": "An account already uses this email."})
                        return
                    password_salt, password_digest = _credential_hash(password)
                    pin_salt, pin_digest = _credential_hash(secrets.token_urlsafe(32))
                    employee_id = f"usr-{uuid.uuid4().hex[:12]}"
                    stylist_id = employee_id
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO users (id, name, username, email, phone, job_title, password_salt, password_hash, pin_salt, pin_hash, stylist_id, role, active, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'employee', 1, ?)
                        """,
                        (employee_id, name, username, email, phone, job_title, password_salt, password_digest, pin_salt, pin_digest, stylist_id, now_iso),
                    )
                    conn.execute(
                        "INSERT INTO stylists (id, name, role, specialty, avatar_url, commission_rate, active) VALUES (?, ?, ?, ?, '', 0.35, 1)",
                        (employee_id, name, job_title, job_title),
                    )
                    _record_audit_event(conn, user, "create", "employee", "Employee account created.", employee_id)
                    conn.commit()
                    employee = conn.execute("SELECT * FROM users WHERE id = ?", (employee_id,)).fetchone()
                    self._send_json(201, {"employee": _public_user(employee) | {"created_at": employee["created_at"]}})
                    return

                if path == "/api/superadmin/admins":
                    if not bool(user["is_superadmin"]):
                        self._send_json(403, {"error": "Superadmin access is required to create Admin accounts."})
                        return
                    name = body.get("name", "").strip()
                    username = body.get("username", "").strip().lower()
                    email = body.get("email", "").strip().lower()
                    password = body.get("password", "")
                    if not name or len(name) > 120 or not USERNAME_PATTERN.fullmatch(username):
                        self._send_json(400, {"error": "Enter a username with 3-30 letters, numbers, dots, dashes or underscores."})
                        return
                    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254 or not isinstance(password, str) or len(password) < 10 or len(password) > 128:
                        self._send_json(400, {"error": "Enter a valid email and a password between 10 and 128 characters."})
                        return
                    if conn.execute("SELECT 1 FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?)", (username, email)).fetchone():
                        self._send_json(409, {"error": "That username or email is already in use."})
                        return
                    password_salt, password_digest = _credential_hash(password)
                    pin_salt, pin_digest = _credential_hash(secrets.token_urlsafe(32))
                    admin_id = f"usr-{uuid.uuid4().hex[:12]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        "INSERT INTO users (id, name, username, email, password_salt, password_hash, pin_salt, pin_hash, role, is_superadmin, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'admin', 0, 1, ?)",
                        (admin_id, name, username, email, password_salt, password_digest, pin_salt, pin_digest, now_iso),
                    )
                    _record_audit_event(conn, user, "create", "admin_account", "Admin account created by Superadmin.", admin_id)
                    conn.commit()
                    admin = conn.execute("SELECT * FROM users WHERE id = ?", (admin_id,)).fetchone()
                    self._send_json(201, {"admin": _public_user(admin) | {"created_at": admin["created_at"]}})
                    return

                if path.startswith("/api/superadmin/admins/") and path.endswith("/reset-password"):
                    if not bool(user["is_superadmin"]):
                        self._send_json(403, {"error": "Superadmin access is required to reset an Admin password."})
                        return
                    admin_id = path.split("/")[-2]
                    admin = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'admin' AND is_superadmin = 0", (admin_id,)).fetchone()
                    if not admin:
                        self._send_json(404, {"error": "Admin account not found."})
                        return
                    temporary_password = secrets.token_urlsafe(15)
                    password_salt, password_digest = _credential_hash(temporary_password)
                    conn.execute("UPDATE users SET password_salt = ?, password_hash = ? WHERE id = ?", (password_salt, password_digest, admin_id))
                    conn.execute("DELETE FROM sessions WHERE user_id = ?", (admin_id,))
                    conn.execute("DELETE FROM password_reset_tokens WHERE user_id = ?", (admin_id,))
                    account_key = hashlib.sha256(admin["username"].strip().lower().encode("utf-8")).hexdigest()
                    conn.execute("DELETE FROM auth_attempts WHERE account_key = ?", (account_key,))
                    _record_audit_event(conn, user, "reset_password", "admin_account", f"Temporary password issued for Admin @{admin['username']}; prior sessions revoked.", admin_id)
                    conn.commit()
                    self._send_json(200, {"temporary_password": temporary_password, "username": admin["username"]})
                    return

                if path.startswith("/api/tickets/") and path.endswith("/void") and user["role"] != "admin":
                    self._send_json(403, {"error": "Administrator access is required to void tickets."})
                    return

                if path == "/api/catalog" and user["role"] != "admin":
                    self._send_json(403, {"error": "Administrator access is required to manage the catalog."})
                    return

                if path == "/api/appointments":
                    client_id = body.get("client_id", "").strip()
                    stylist_id = body.get("stylist_id", "").strip()
                    service_id = body.get("service_id", "").strip()
                    date_str = body.get("date", datetime.date.today().isoformat()).strip()
                    start_time = body.get("start_time", "10:00").strip()
                    notes = body.get("notes", "").strip()
                    status = body.get("status", "Confirmed").strip()

                    if user["role"] == "employee" and (not user["stylist_id"] or stylist_id != user["stylist_id"]):
                        self._send_json(403, {"error": "Employees can only create appointments for their assigned stylist profile."})
                        return

                    if not (client_id and stylist_id and service_id):
                        self._send_json(400, {"error": "Client, stylist, and service are required."})
                        return

                    if user["role"] == "employee" and not conn.execute(
                        "SELECT 1 FROM appointments WHERE client_id = ? AND stylist_id = ? LIMIT 1",
                        (client_id, user["stylist_id"]),
                    ).fetchone():
                        self._send_json(403, {"error": "You can only book clients already assigned to your profile."})
                        return

                    srv = conn.execute("SELECT duration_min FROM catalog_items WHERE id = ?", (service_id,)).fetchone()
                    if not srv:
                        self._send_json(404, {"error": "Selected service was not found."})
                        return

                    duration_min = int(body.get("duration_min") or srv["duration_min"] or 60)
                    start_mins = time_to_minutes(start_time)
                    business_settings = _business_settings(conn)
                    opening_mins = time_to_minutes(business_settings["opening_time"])
                    closing_mins = time_to_minutes(business_settings["closing_time"])
                    if start_mins < opening_mins or start_mins + duration_min > closing_mins:
                        self._send_json(
                            400,
                            {"error": f"Appointments must fall within salon hours ({business_settings['opening_time']} – {business_settings['closing_time']})."},
                        )
                        return

                    conflict = check_conflict(conn, stylist_id, date_str, start_time, duration_min)
                    if conflict:
                        self._send_json(
                            409,
                            {
                                "error": f"Scheduling conflict: stylist is booked with {conflict['client_name']} ({conflict['service_name']}) from {conflict['window']}.",
                                "conflict": conflict,
                            },
                        )
                        return

                    apt_id = f"apt-{uuid.uuid4().hex[:8]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO appointments (id, client_id, stylist_id, service_id, date, start_time, duration_min, status, notes, ticket_id, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
                        """,
                        (apt_id, client_id, stylist_id, service_id, date_str, start_time, duration_min, status, notes, now_iso),
                    )
                    _record_audit_event(conn, user, "create", "appointment", "Appointment booked.", apt_id)
                    conn.commit()
                    created = [a for a in fetch_appointments(conn, date_str) if a["id"] == apt_id]
                    self._send_json(201, {"appointment": created[0] if created else None})
                    return

                if path == "/api/clients":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required to create client profiles."})
                        return
                    name = body.get("name", "").strip()
                    phone = body.get("phone", "").strip()
                    if not name or not phone:
                        self._send_json(400, {"error": "Client name and phone number are required."})
                        return
                    cli_id = f"cli-{uuid.uuid4().hex[:8]}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        INSERT INTO clients (id, name, phone, email, preferred_stylist_id, formula_notes, visit_count, total_spent_ksh, last_visit, created_at)
                        VALUES (?, ?, ?, ?, ?, ?, 0, 0, '', ?)
                        """,
                        (
                            cli_id,
                            name,
                            phone,
                            body.get("email", "").strip(),
                            body.get("preferred_stylist_id", "").strip(),
                            body.get("formula_notes", "").strip(),
                            now_iso,
                        ),
                    )
                    _record_audit_event(conn, user, "create", "client", "Client profile created.", cli_id)
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM clients WHERE id = ?", (cli_id,)).fetchone())
                    self._send_json(201, {"client": row})
                    return

                if path == "/api/catalog":
                    kind = body.get("kind", "service").strip()
                    if kind not in {"service", "product"}:
                        self._send_json(400, {"error": "Choose service or product for the catalog item."})
                        return
                    category = body.get("category", "Hair & Styling").strip()
                    name = body.get("name", "").strip()
                    price_ksh = int(body.get("price_ksh", 0))
                    commission_rate = body.get("commission_rate", 35)
                    if not name or price_ksh <= 0:
                        self._send_json(400, {"error": "Item name and a positive price in KSh are required."})
                        return
                    if isinstance(commission_rate, bool) or not isinstance(commission_rate, (int, float)) or not 0 <= commission_rate <= 100:
                        self._send_json(400, {"error": "Service commission must be between 0 and 100 percent."})
                        return
                    item_id = f"{'srv' if kind == 'service' else 'prd'}-{uuid.uuid4().hex[:8]}"
                    duration_min = int(body.get("duration_min", 60 if kind == "service" else 0))
                    stock_qty = int(body.get("stock_qty", 0 if kind == "service" else 10))
                    sku = body.get("sku", "").strip() or f"{'SRV' if kind == 'service' else 'RTL'}-{uuid.uuid4().hex[:4].upper()}"
                    conn.execute(
                        """
                        INSERT INTO catalog_items (id, kind, category, name, description, price_ksh, commission_rate, duration_min, stock_qty, sku)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (item_id, kind, category, name, body.get("description", "").strip(), price_ksh, float(commission_rate) / 100, duration_min, stock_qty, sku),
                    )
                    _record_audit_event(conn, user, "create", "catalog_item", "Service or product created.", item_id)
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM catalog_items WHERE id = ?", (item_id,)).fetchone())
                    self._send_json(201, {"item": row})
                    return

                if path == "/api/tickets/checkout":
                    items = body.get("items", [])
                    if not items:
                        self._send_json(400, {"error": "Cannot settle an empty ticket."})
                        return

                    client_id = body.get("client_id", "").strip()
                    client_name = body.get("client_name", "").strip() or "Walk-In Guest"
                    appointment_id = body.get("appointment_id", "").strip()
                    payment_method = body.get("payment_method", "M-Pesa").strip()
                    transaction_reference = body.get("transaction_reference", "")
                    if not isinstance(transaction_reference, str) or len(transaction_reference.strip()) > 100:
                        self._send_json(400, {"error": "Transaction reference must be text and 100 characters or fewer."})
                        return
                    transaction_reference = transaction_reference.strip()
                    if user["role"] == "employee":
                        if not user["stylist_id"]:
                            self._send_json(403, {"error": "This employee account has no assigned stylist profile."})
                            return
                        if client_id and not conn.execute(
                            "SELECT 1 FROM appointments WHERE client_id = ? AND stylist_id = ? LIMIT 1",
                            (client_id, user["stylist_id"]),
                        ).fetchone():
                            self._send_json(403, {"error": "You can only charge clients assigned to your profile."})
                            return
                        if appointment_id and not conn.execute(
                            "SELECT 1 FROM appointments WHERE id = ? AND stylist_id = ? AND client_id = ?",
                            (appointment_id, user["stylist_id"], client_id),
                        ).fetchone():
                            self._send_json(403, {"error": "You can only charge appointments assigned to your profile."})
                            return
                    tip_ksh = int(body.get("tip_ksh", 0) or 0)
                    tip_stylist_id = body.get("tip_stylist_id", "").strip()
                    if payment_method not in ("M-Pesa", "Card", "Cash"):
                        self._send_json(400, {"error": "Invalid payment method."})
                        return
                    if tip_ksh < 0:
                        self._send_json(400, {"error": "Tip amount cannot be negative."})
                        return

                    discount_type = body.get("discount_type", "none")
                    discount_value = float(body.get("discount_value", 0) or 0)
                    business_date = body.get("business_date", datetime.date.today().isoformat()).strip()

                    # Fetch stylists & catalog map
                    stylists_map = {
                        r["id"]: dict(r)
                        for r in conn.execute("SELECT id, name, commission_rate FROM stylists").fetchall()
                    }

                    prepared_items = []
                    subtotal_ksh = 0
                    client_loyalty = conn.execute("SELECT loyalty_points FROM clients WHERE id = ?", (client_id,)).fetchone() if client_id else None
                    reward_redeemed = bool(client_loyalty and int(client_loyalty["loyalty_points"] or 0) >= 15)

                    for req_item in items:
                        cat_id = req_item.get("catalog_item_id", "")
                        qty = int(req_item.get("quantity", 1))
                        if qty <= 0:
                            continue
                        cat_row = conn.execute("SELECT * FROM catalog_items WHERE id = ?", (cat_id,)).fetchone()
                        if not cat_row:
                            self._send_json(404, {"error": f"Catalog item {cat_id} not found."})
                            return

                        if cat_row["kind"] == "product" and int(cat_row["stock_qty"]) < qty:
                            self._send_json(
                                400,
                                {"error": f"Insufficient stock for {cat_row['name']} ({cat_row['stock_qty']} remaining)."},
                            )
                            return

                        unit_price = int(cat_row["price_ksh"])
                        line_total = unit_price * qty
                        subtotal_ksh += line_total

                        sid = user["stylist_id"] if user["role"] == "employee" else (req_item.get("stylist_id", "") or "")
                        s_info = stylists_map.get(sid)
                        s_name = s_info["name"] if s_info else ""
                        rate = float(cat_row["commission_rate"]) if (s_info and cat_row["kind"] == "service") else (0.10 if s_info else 0.0)
                        commission_ksh = round(line_total * rate)

                        prepared_items.append(
                            {
                                "id": f"ti-{uuid.uuid4().hex[:8]}",
                                "catalog_item_id": cat_id,
                                "item_name": cat_row["name"],
                                "kind": cat_row["kind"],
                                "stylist_id": sid,
                                "stylist_name": s_name,
                                "quantity": qty,
                                "unit_price_ksh": unit_price,
                                "line_total_ksh": line_total,
                                "commission_ksh": commission_ksh,
                                "commission_rate": float(cat_row["commission_rate"]),
                            }
                        )

                    items_subtotal_ksh = subtotal_ksh
                    if tip_ksh > 0:
                        if user["role"] == "employee":
                            tip_stylist_id = user["stylist_id"]
                        tip_stylist = stylists_map.get(tip_stylist_id) or next(
                            (
                                stylists_map.get(item["stylist_id"])
                                for item in prepared_items
                                if item["kind"] == "service" and stylists_map.get(item["stylist_id"])
                            ),
                            None,
                        )
                        if tip_stylist_id and not stylists_map.get(tip_stylist_id):
                            self._send_json(400, {"error": "Selected tip stylist not found."})
                            return
                        subtotal_ksh += tip_ksh
                        prepared_items.append(
                            {
                                "id": f"ti-{uuid.uuid4().hex[:8]}",
                                "catalog_item_id": "",
                                "item_name": "Stylist Tip",
                                "kind": "tip",
                                "stylist_id": tip_stylist_id or next(
                                    (
                                        item["stylist_id"]
                                        for item in prepared_items
                                        if item["kind"] == "service" and item["stylist_id"]
                                    ),
                                    "",
                                ),
                                "stylist_name": tip_stylist["name"] if tip_stylist else "",
                                "quantity": 1,
                                "unit_price_ksh": tip_ksh,
                                "line_total_ksh": tip_ksh,
                                "commission_ksh": 0,
                            }
                        )

                    if not prepared_items:
                        self._send_json(400, {"error": "No valid ticket items provided."})
                        return

                    loyalty_reward_discount_ksh = 0
                    if reward_redeemed:
                        reward_item = next((item for item in prepared_items if item["kind"] == "service"), None)
                        if reward_item:
                            # Apply 50% off one unit of the next service and reduce stylist commission accordingly.
                            loyalty_reward_discount_ksh = (reward_item["unit_price_ksh"] + 1) // 2
                            reward_item["line_total_ksh"] = max(0, reward_item["line_total_ksh"] - loyalty_reward_discount_ksh)
                            reward_item["commission_ksh"] = round(reward_item["line_total_ksh"] * (float(reward_item["commission_rate"]) if reward_item["stylist_id"] else 0))
                        else:
                            reward_redeemed = False

                    loyalty_earned = 1 if client_id and any(item["kind"] == "service" for item in prepared_items) else 0

                    discount_base_ksh = max(0, items_subtotal_ksh - loyalty_reward_discount_ksh)
                    if discount_type == "percent":
                        discount_ksh = round(discount_base_ksh * min(max(discount_value, 0.0), 100.0) / 100.0)
                    elif discount_type == "fixed":
                        discount_ksh = min(round(max(discount_value, 0.0)), discount_base_ksh)
                    else:
                        discount_ksh = 0

                    discount_ksh += loyalty_reward_discount_ksh
                    total_ksh = max(0, subtotal_ksh - discount_ksh)
                    # Kenyan standard 16% VAT inclusive extraction for clear receipt reporting
                    tax_ksh = round(max(0, items_subtotal_ksh - discount_ksh) * 16 / 116)

                    tendered_ksh = int(body.get("tendered_ksh") or total_ksh)
                    if payment_method == "Cash" and tendered_ksh < total_ksh:
                        self._send_json(400, {"error": f"Cash tendered (KSh {tendered_ksh:,}) is less than total (KSh {total_ksh:,})."})
                        return
                    if payment_method != "Cash":
                        tendered_ksh = total_ksh
                    change_ksh = max(0, tendered_ksh - total_ksh)

                    # Generate sequential ticket number
                    seq_count = conn.execute("SELECT COUNT(*) FROM tickets").fetchone()[0] + 841
                    ticket_id = f"tkt-{uuid.uuid4().hex[:8]}"
                    ticket_number = f"SP-{datetime.date.today().year}-{seq_count:04d}"
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")

                    if client_id:
                        cli_row = conn.execute("SELECT name FROM clients WHERE id = ?", (client_id,)).fetchone()
                        if cli_row:
                            client_name = cli_row["name"]

                    conn.execute(
                        """
                        INSERT INTO tickets (id, ticket_number, client_id, client_name, appointment_id, subtotal_ksh, discount_ksh, tax_ksh, total_ksh, payment_method, transaction_reference, tendered_ksh, change_ksh, status, created_at, business_date, loyalty_points_earned, loyalty_points_redeemed)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', ?, ?, ?, ?)
                        """,
                        (
                            ticket_id,
                            ticket_number,
                            client_id,
                            client_name,
                            appointment_id,
                            subtotal_ksh,
                            discount_ksh,
                            tax_ksh,
                            total_ksh,
                            payment_method,
                            transaction_reference,
                            tendered_ksh,
                            change_ksh,
                            now_iso,
                            business_date,
                            loyalty_earned,
                            15 if reward_redeemed else 0,
                        ),
                    )

                    for pi in prepared_items:
                        conn.execute(
                            """
                            INSERT INTO ticket_items (id, ticket_id, catalog_item_id, item_name, kind, stylist_id, stylist_name, quantity, unit_price_ksh, line_total_ksh, commission_ksh)
                            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                            """,
                            (
                                pi["id"],
                                ticket_id,
                                pi["catalog_item_id"],
                                pi["item_name"],
                                pi["kind"],
                                pi["stylist_id"],
                                pi["stylist_name"],
                                pi["quantity"],
                                pi["unit_price_ksh"],
                                pi["line_total_ksh"],
                                pi["commission_ksh"],
                            ),
                        )
                        if pi["kind"] == "product":
                            conn.execute(
                                "UPDATE catalog_items SET stock_qty = MAX(0, stock_qty - ?) WHERE id = ?",
                                (pi["quantity"], pi["catalog_item_id"]),
                            )

                    if client_id:
                        conn.execute(
                            """
                            UPDATE clients
                            SET visit_count = visit_count + 1,
                                loyalty_points = MAX(0, loyalty_points - ?) + ?,
                                total_spent_ksh = total_spent_ksh + ?,
                                last_visit = ?
                            WHERE id = ?
                            """,
                            (15 if reward_redeemed else 0, loyalty_earned, total_ksh, business_date, client_id),
                        )

                    if appointment_id:
                        conn.execute(
                            "UPDATE appointments SET status = 'Completed', ticket_id = ? WHERE id = ?",
                            (ticket_id, appointment_id),
                        )

                    _record_audit_event(conn, user, "create", "ticket", "Payment completed.", ticket_id)
                    conn.commit()
                    settled = [t for t in fetch_tickets(conn, business_date) if t["id"] == ticket_id]
                    self._send_json(201, {"ticket": settled[0] if settled else None})
                    return

                if path.startswith("/api/tickets/") and path.endswith("/void"):
                    ticket_id = path.split("/")[3]
                    tkt = conn.execute("SELECT * FROM tickets WHERE id = ?", (ticket_id,)).fetchone()
                    if not tkt:
                        self._send_json(404, {"error": "Ticket not found."})
                        return
                    if tkt["status"] == "Voided":
                        self._send_json(400, {"error": "Ticket is already voided."})
                        return

                    paid_commission = conn.execute(
                        """
                        SELECT COALESCE(SUM(pi.amount_ksh), 0)
                        FROM ticket_items ti
                        JOIN commission_payout_items pi ON pi.ticket_item_id = ti.id
                        WHERE ti.ticket_id = ?
                        """,
                        (ticket_id,),
                    ).fetchone()[0]
                    if paid_commission:
                        self._send_json(409, {"error": "This ticket includes commission that has already been paid. Resolve the commission payout before voiding it."})
                        return

                    items = conn.execute("SELECT * FROM ticket_items WHERE ticket_id = ?", (ticket_id,)).fetchall()
                    for it in items:
                        if it["kind"] == "product":
                            conn.execute(
                                "UPDATE catalog_items SET stock_qty = stock_qty + ? WHERE id = ?",
                                (it["quantity"], it["catalog_item_id"]),
                            )

                    if tkt["client_id"]:
                        conn.execute(
                            """
                            UPDATE clients
                            SET visit_count = MAX(0, visit_count - 1),
                                loyalty_points = MAX(0, loyalty_points - ?) + ?,
                                total_spent_ksh = MAX(0, total_spent_ksh - ?)
                            WHERE id = ?
                            """,
                            (int(tkt["loyalty_points_earned"] or 0), int(tkt["loyalty_points_redeemed"] or 0), tkt["total_ksh"], tkt["client_id"]),
                        )

                    if tkt["appointment_id"]:
                        conn.execute(
                            "UPDATE appointments SET status = 'Confirmed', ticket_id = '' WHERE id = ?",
                            (tkt["appointment_id"],),
                        )

                    conn.execute("UPDATE tickets SET status = 'Voided' WHERE id = ?", (ticket_id,))
                    _record_audit_event(conn, user, "void", "ticket", "Ticket voided and stock restored.", ticket_id)
                    conn.commit()
                    self._send_json(200, {"voided": True, "ticket_id": ticket_id})
                    return

                self._send_json(404, {"error": f"Unknown endpoint: {path}"})
            except Exception as exc:
                conn.rollback()
                self._send_json(500, {"error": str(exc)})
            finally:
                conn.close()

    def do_PATCH(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        try:
            body = self._read_json()
        except Exception:
            self._send_json(400, {"error": "Invalid JSON payload"})
            return

        with DB_LOCK:
            conn = get_conn()
            try:
                user = _current_user(conn, self.headers.get("Cookie"))
                if not user:
                    self._send_json(401, {"error": "Sign in to continue."})
                    return

                if path == "/api/auth/profile":
                    name = body.get("name", user["name"])
                    email = body.get("email", user["email"])
                    phone = body.get("phone", user["phone"] or "")
                    if not all(isinstance(value, str) for value in (name, email, phone)):
                        self._send_json(400, {"error": "Profile fields must be text values."})
                        return
                    name, email, phone = name.strip(), email.strip().lower(), phone.strip()
                    if not name or len(name) > 120:
                        self._send_json(400, {"error": "Name is required and must be 120 characters or fewer."})
                        return
                    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", email) or len(email) > 254:
                        self._send_json(400, {"error": "Enter a valid work email address."})
                        return
                    if len(phone) > 40:
                        self._send_json(400, {"error": "Phone number must be 40 characters or fewer."})
                        return
                    conflict = conn.execute(
                        "SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id != ?",
                        (email, user["id"]),
                    ).fetchone()
                    if conflict:
                        self._send_json(409, {"error": "Another staff account already uses that email."})
                        return
                    conn.execute("UPDATE users SET name = ?, email = ?, phone = ? WHERE id = ?", (name, email, phone, user["id"]))
                    _record_audit_event(conn, user, "update", "staff_profile", "Staff profile contact details updated.", user["id"])
                    conn.commit()
                    updated = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
                    self._send_json(200, {"user": _public_user(updated)})
                    return

                if path == "/api/training/settings":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required to choose the weekly training day."})
                        return
                    day_of_week = body.get("day_of_week")
                    if isinstance(day_of_week, bool) or not isinstance(day_of_week, int) or not 0 <= day_of_week <= 6:
                        self._send_json(400, {"error": "Choose a day of the week for training."})
                        return
                    now = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute("UPDATE training_settings SET day_of_week = ?, updated_at = ?, updated_by = ? WHERE id = 1", (day_of_week, now, user["name"]))
                    _record_audit_event(conn, user, "update", "training_schedule", f"Weekly training day set to {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'][day_of_week]}.")
                    conn.commit()
                    self._send_json(200, {"day_of_week": day_of_week})
                    return

                if path == "/api/expenses":
                    category = body.get("category", "").strip()
                    description = body.get("description", "").strip()
                    expense_date = body.get("expense_date", datetime.date.today().isoformat()).strip()
                    try:
                        amount = int(body.get("amount_ksh", 0))
                        datetime.date.fromisoformat(expense_date)
                    except (TypeError, ValueError):
                        self._send_json(400, {"error": "Enter a valid expense date and whole KSh amount."})
                        return
                    if not category or len(category) > 80 or len(description) > 240 or amount <= 0:
                        self._send_json(400, {"error": "Category is required, description must be under 240 characters and amount must be positive."})
                        return
                    expense_id = f"exp-{uuid.uuid4().hex[:10]}"
                    now = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute("INSERT INTO salon_expenses (id, category, description, amount_ksh, expense_date, created_by_name, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", (expense_id, category, description, amount, expense_date, user["name"], now))
                    _record_audit_event(conn, user, "create", "expense", f"Recorded {category} expense of KSh {amount:,}.", expense_id)
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM salon_expenses WHERE id = ?", (expense_id,)).fetchone())
                    self._send_json(201, {"expense": row})
                    return

                if path == "/api/settings/business":
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required."})
                        return
                    current = _business_settings(conn)
                    fields = ("business_name", "phone", "email", "address", "opening_time", "closing_time")
                    values = {field: body.get(field, current[field]) for field in fields}
                    if not all(isinstance(value, str) for value in values.values()):
                        self._send_json(400, {"error": "Business settings must be text values."})
                        return
                    values = {field: value.strip() for field, value in values.items()}
                    if not values["business_name"] or len(values["business_name"]) > 120:
                        self._send_json(400, {"error": "Business name is required and must be 120 characters or fewer."})
                        return
                    if len(values["phone"]) > 40 or len(values["email"]) > 254 or len(values["address"]) > 300:
                        self._send_json(400, {"error": "Contact details exceed the allowed length."})
                        return
                    if values["email"] and not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", values["email"]):
                        self._send_json(400, {"error": "Enter a valid business email address."})
                        return
                    time_pattern = re.compile(r"^(?:[01]\d|2[0-3]):(?:00|30)$")
                    if (
                        not time_pattern.fullmatch(values["opening_time"])
                        or not time_pattern.fullmatch(values["closing_time"])
                        or time_to_minutes(values["closing_time"]) <= time_to_minutes(values["opening_time"])
                    ):
                        self._send_json(400, {"error": "Business hours must use half-hour times and closing time must be after opening time."})
                        return
                    updated_at = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        UPDATE business_settings
                        SET business_name = ?, phone = ?, email = ?, address = ?, opening_time = ?, closing_time = ?, updated_at = ?, updated_by = ?
                        WHERE id = 1
                        """,
                        (*[values[field] for field in fields], updated_at, user["id"]),
                    )
                    _record_audit_event(conn, user, "update", "business_settings", "Business profile settings updated.")
                    conn.commit()
                    self._send_json(200, {"settings": _business_settings(conn)})
                    return

                if path.startswith("/api/support/requests/"):
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required to manage support requests."})
                        return
                    request_id = path.rsplit("/", 1)[-1]
                    existing = conn.execute("SELECT * FROM support_requests WHERE id = ?", (request_id,)).fetchone()
                    if not existing:
                        self._send_json(404, {"error": "Support request not found."})
                        return
                    status = body.get("status", existing["status"])
                    admin_reply = body.get("admin_reply", existing["admin_reply"])
                    if status not in {"open", "in_progress", "resolved"} or not isinstance(admin_reply, str) or len(admin_reply) > 2000:
                        self._send_json(400, {"error": "Choose a valid status and keep the reply to 2000 characters or fewer."})
                        return
                    updated_at = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute(
                        """
                        UPDATE support_requests
                        SET status = ?, admin_reply = ?, updated_at = ?, updated_by = ?
                        WHERE id = ?
                        """,
                        (status, admin_reply.strip(), updated_at, user["id"], request_id),
                    )
                    _record_audit_event(conn, user, "update", "support_request", f"Support request marked {status.replace('_', ' ')}.", request_id)
                    conn.commit()
                    updated = conn.execute("SELECT * FROM support_requests WHERE id = ?", (request_id,)).fetchone()
                    self._send_json(200, {"request": dict(updated)})
                    return

                if path.startswith("/api/superadmin/admins/"):
                    if not bool(user["is_superadmin"]):
                        self._send_json(403, {"error": "Superadmin access is required to manage Admin accounts."})
                        return
                    admin_id = path.rsplit("/", 1)[-1]
                    admin = conn.execute("SELECT * FROM users WHERE id = ? AND role = 'admin' AND is_superadmin = 0", (admin_id,)).fetchone()
                    if not admin:
                        self._send_json(404, {"error": "Admin account not found."})
                        return
                    if "active" not in body or not isinstance(body["active"], bool):
                        self._send_json(400, {"error": "Choose whether this Admin account should be active."})
                        return
                    active = int(body["active"])
                    conn.execute("UPDATE users SET active = ? WHERE id = ?", (active, admin_id))
                    if not active:
                        conn.execute("DELETE FROM sessions WHERE user_id = ?", (admin_id,))
                    _record_audit_event(conn, user, "activate" if active else "deactivate", "admin_account", "Admin account enabled by Superadmin." if active else "Admin account disabled by Superadmin.", admin_id)
                    conn.commit()
                    updated = conn.execute("SELECT * FROM users WHERE id = ?", (admin_id,)).fetchone()
                    self._send_json(200, {"admin": _public_user(updated) | {"created_at": updated["created_at"]}})
                    return

                if path.startswith("/api/employees/"):
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required."})
                        return
                    employee_id = path.rsplit("/", 1)[-1]
                    employee = conn.execute("SELECT * FROM users WHERE id = ?", (employee_id,)).fetchone()
                    if not employee or employee["role"] != "employee":
                        self._send_json(404, {"error": "Employee account not found."})
                        return
                    active = int(bool(body.get("active", employee["active"])))
                    conn.execute("UPDATE users SET active = ? WHERE id = ?", (active, employee_id))
                    conn.execute("UPDATE stylists SET active = ? WHERE id = ?", (active, employee["stylist_id"]))
                    if not active:
                        conn.execute("DELETE FROM sessions WHERE user_id = ?", (employee_id,))
                    _record_audit_event(conn, user, "activate" if active else "deactivate", "employee", "Employee account enabled." if active else "Employee account disabled.", employee_id)
                    conn.commit()
                    updated = conn.execute("SELECT * FROM users WHERE id = ?", (employee_id,)).fetchone()
                    self._send_json(200, {"employee": _public_user(updated) | {"created_at": updated["created_at"]}})
                    return

                if path.startswith("/api/catalog/") and user["role"] == "employee":
                    self._send_json(403, {"error": "Employees must report product usage or damage through inventory reports."})
                    return

                if path.startswith("/api/inventory/reports/"):
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required to manage inventory reports."})
                        return
                    report_id = path.rsplit("/", 1)[-1]
                    report = conn.execute("SELECT * FROM inventory_reports WHERE id = ?", (report_id,)).fetchone()
                    if not report:
                        self._send_json(404, {"error": "Inventory report was not found."})
                        return
                    status = body.get("status")
                    if status not in {"open", "resolved"}:
                        self._send_json(400, {"error": "Choose open or resolved report status."})
                        return
                    resolved_at = datetime.datetime.now().isoformat(timespec="seconds") if status == "resolved" else ""
                    resolved_by = user["id"] if status == "resolved" else ""
                    conn.execute(
                        "UPDATE inventory_reports SET status = ?, resolved_by_user_id = ?, resolved_at = ? WHERE id = ?",
                        (status, resolved_by, resolved_at, report_id),
                    )
                    _record_audit_event(conn, user, "update", "inventory_report", f"Inventory report marked {status}.", report_id)
                    conn.commit()
                    updated = conn.execute("SELECT r.*, c.stock_qty FROM inventory_reports r JOIN catalog_items c ON c.id = r.catalog_item_id WHERE r.id = ?", (report_id,)).fetchone()
                    self._send_json(200, {"report": dict(updated)})
                    return

                if path.startswith("/api/tasks/"):
                    task_id = path.rsplit("/", 1)[-1]
                    task = conn.execute("SELECT * FROM staff_tasks WHERE id = ?", (task_id,)).fetchone()
                    if not task:
                        self._send_json(404, {"error": "Task not found."})
                        return
                    if user["role"] == "employee" and task["assigned_to_user_id"] != user["id"]:
                        self._send_json(403, {"error": "You can only update tasks assigned to you."})
                        return
                    status = body.get("status")
                    allowed_statuses = {"assigned", "in_progress", "completed"} if user["role"] == "admin" else {"in_progress", "completed"}
                    if status not in allowed_statuses:
                        self._send_json(400, {"error": "Choose a task status available to your role."})
                        return
                    now_iso = datetime.datetime.now().isoformat(timespec="seconds")
                    completed_at = now_iso if status == "completed" else ""
                    conn.execute("UPDATE staff_tasks SET status = ?, updated_at = ?, completed_at = ? WHERE id = ?", (status, now_iso, completed_at, task_id))
                    _record_audit_event(conn, user, "update", "staff_task", f"Task marked {status.replace('_', ' ')}.", task_id)
                    conn.commit()
                    updated = conn.execute(
                        """
                        SELECT t.*, assignee.name AS assignee_name, creator.name AS creator_name
                        FROM staff_tasks t
                        JOIN users assignee ON assignee.id = t.assigned_to_user_id
                        JOIN users creator ON creator.id = t.created_by_user_id
                        WHERE t.id = ?
                        """,
                        (task_id,),
                    ).fetchone()
                    self._send_json(200, {"task": dict(updated)})
                    return

                if path.startswith("/api/appointments/"):
                    apt_id = path.split("/")[-1]
                    existing = conn.execute("SELECT * FROM appointments WHERE id = ?", (apt_id,)).fetchone()
                    if not existing:
                        self._send_json(404, {"error": "Appointment not found."})
                        return
                    if user["role"] == "employee" and (not user["stylist_id"] or existing["stylist_id"] != user["stylist_id"]):
                        self._send_json(403, {"error": "You can only update appointments assigned to you."})
                        return

                    if user["role"] == "employee":
                        if set(body) != {"status"}:
                            self._send_json(403, {"error": "Employees can only update service status."})
                            return
                        allowed_transition = (
                            existing["status"] in {"Pending", "Confirmed"} and body.get("status") == "In-Service"
                        ) or (existing["status"] == "In-Service" and body.get("status") == "Completed")
                        if not allowed_transition:
                            self._send_json(400, {"error": "This appointment status cannot be changed from its current state."})
                            return

                    new_stylist = body.get("stylist_id", existing["stylist_id"])
                    new_date = body.get("date", existing["date"])
                    new_time = body.get("start_time", existing["start_time"])
                    new_duration = int(body.get("duration_min", existing["duration_min"]))
                    new_status = body.get("status", existing["status"])
                    new_notes = body.get("notes", existing["notes"])
                    new_service = body.get("service_id", existing["service_id"])

                    if new_status not in ("Cancelled", "No-Show"):
                        business_settings = _business_settings(conn)
                        opening_mins = time_to_minutes(business_settings["opening_time"])
                        closing_mins = time_to_minutes(business_settings["closing_time"])
                        start_mins = time_to_minutes(new_time)
                        if start_mins < opening_mins or start_mins + new_duration > closing_mins:
                            self._send_json(
                                400,
                                {"error": f"Appointments must fall within salon hours ({business_settings['opening_time']} – {business_settings['closing_time']})."},
                            )
                            return

                    if new_status not in ("Cancelled", "No-Show") and (
                        new_stylist != existing["stylist_id"]
                        or new_date != existing["date"]
                        or new_time != existing["start_time"]
                        or new_duration != existing["duration_min"]
                    ):
                        conflict = check_conflict(conn, new_stylist, new_date, new_time, new_duration, exclude_id=apt_id)
                        if conflict:
                            self._send_json(
                                409,
                                {
                                    "error": f"Cannot reschedule: overlaps with {conflict['client_name']} ({conflict['window']}).",
                                    "conflict": conflict,
                                },
                            )
                            return

                    conn.execute(
                        """
                        UPDATE appointments
                        SET stylist_id = ?, date = ?, start_time = ?, duration_min = ?, status = ?, notes = ?, service_id = ?
                        WHERE id = ?
                        """,
                        (new_stylist, new_date, new_time, new_duration, new_status, new_notes, new_service, apt_id),
                    )
                    _record_audit_event(conn, user, "update", "appointment", "Appointment details updated.", apt_id)
                    conn.commit()
                    updated = [a for a in fetch_appointments(conn, new_date) if a["id"] == apt_id]
                    self._send_json(200, {"appointment": updated[0] if updated else None})
                    return

                if path.startswith("/api/expenses/"):
                    expense_id = path.split("/")[-1]
                    existing_expense = conn.execute("SELECT * FROM salon_expenses WHERE id = ?", (expense_id,)).fetchone()
                    if not existing_expense:
                        self._send_json(404, {"error": "Expense not found."})
                        return
                    category = body.get("category", existing_expense["category"]).strip()
                    description = body.get("description", existing_expense["description"]).strip()
                    expense_date = body.get("expense_date", existing_expense["expense_date"]).strip()
                    try:
                        amount = int(body.get("amount_ksh", existing_expense["amount_ksh"]))
                        datetime.date.fromisoformat(expense_date)
                    except (TypeError, ValueError):
                        self._send_json(400, {"error": "Enter a valid expense date and whole KSh amount."})
                        return
                    if not category or len(category) > 80 or len(description) > 240 or amount <= 0:
                        self._send_json(400, {"error": "Category is required, description must be under 240 characters and amount must be positive."})
                        return
                    now = datetime.datetime.now().isoformat(timespec="seconds")
                    conn.execute("UPDATE salon_expenses SET category = ?, description = ?, amount_ksh = ?, expense_date = ?, updated_at = ? WHERE id = ?", (category, description, amount, expense_date, now, expense_id))
                    _record_audit_event(conn, user, "update", "expense", f"Updated {category} expense to KSh {amount:,}.", expense_id)
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM salon_expenses WHERE id = ?", (expense_id,)).fetchone())
                    self._send_json(200, {"expense": row})
                    return

                if path.startswith("/api/clients/"):
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Administrator access is required to edit client profiles."})
                        return
                    cli_id = path.split("/")[-1]
                    existing = conn.execute("SELECT * FROM clients WHERE id = ?", (cli_id,)).fetchone()
                    if not existing:
                        self._send_json(404, {"error": "Client not found."})
                        return
                    conn.execute(
                        """
                        UPDATE clients
                        SET name = ?, phone = ?, email = ?, preferred_stylist_id = ?, formula_notes = ?
                        WHERE id = ?
                        """,
                        (
                            body.get("name", existing["name"]),
                            body.get("phone", existing["phone"]),
                            body.get("email", existing["email"]),
                            body.get("preferred_stylist_id", existing["preferred_stylist_id"]),
                            body.get("formula_notes", existing["formula_notes"]),
                            cli_id,
                        ),
                    )
                    _record_audit_event(conn, user, "update", "client", "Client profile updated.", cli_id)
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM clients WHERE id = ?", (cli_id,)).fetchone())
                    self._send_json(200, {"client": row})
                    return

                if path.startswith("/api/catalog/"):
                    item_id = path.split("/")[-1]
                    existing = conn.execute("SELECT * FROM catalog_items WHERE id = ?", (item_id,)).fetchone()
                    if not existing:
                        self._send_json(404, {"error": "Catalog item not found."})
                        return

                    stock_delta = body.get("stock_delta")
                    commission_rate = existing["commission_rate"]
                    if "commission_rate" in body:
                        if user["role"] != "admin" or existing["kind"] != "service":
                            self._send_json(403, {"error": "Only an administrator can change a service commission rate."})
                            return
                        requested_rate = body["commission_rate"]
                        if isinstance(requested_rate, bool) or not isinstance(requested_rate, (int, float)) or not 0 <= requested_rate <= 100:
                            self._send_json(400, {"error": "Service commission must be between 0 and 100 percent."})
                            return
                        commission_rate = float(requested_rate) / 100
                    if user["role"] == "employee" and existing["kind"] != "product":
                        self._send_json(403, {"error": "Employees can only adjust product stock."})
                        return
                    new_stock = int(existing["stock_qty"])
                    if stock_delta is not None:
                        try:
                            stock_delta = int(stock_delta)
                        except (TypeError, ValueError):
                            self._send_json(400, {"error": "Stock adjustment must be a whole number."})
                            return
                        if stock_delta == 0 or abs(stock_delta) > 10000:
                            self._send_json(400, {"error": "Stock adjustment must be between -10000 and 10000 and cannot be zero."})
                            return
                        new_stock = max(0, new_stock + stock_delta)
                    elif "stock_qty" in body:
                        new_stock = max(0, int(body["stock_qty"]))

                    conn.execute(
                        """
                        UPDATE catalog_items
                        SET name = ?, category = ?, description = ?, price_ksh = ?, commission_rate = ?, duration_min = ?, stock_qty = ?
                        WHERE id = ?
                        """,
                        (
                            body.get("name", existing["name"]),
                            body.get("category", existing["category"]),
                            body.get("description", existing["description"]),
                            int(body.get("price_ksh", existing["price_ksh"])),
                            commission_rate,
                            int(body.get("duration_min", existing["duration_min"])),
                            new_stock,
                            item_id,
                        ),
                    )
                    _record_audit_event(
                        conn,
                        user,
                        "adjust_stock" if "stock_delta" in body or "stock_qty" in body else "update",
                        "catalog_item",
                        (f"Service commission set to {float(body['commission_rate']):g}%." if "commission_rate" in body else ("Inventory stock adjusted." if "stock_delta" in body or "stock_qty" in body else "Catalog item updated.")),
                        item_id,
                    )
                    conn.commit()
                    row = dict(conn.execute("SELECT * FROM catalog_items WHERE id = ?", (item_id,)).fetchone())
                    self._send_json(200, {"item": row})
                    return

                self._send_json(404, {"error": f"Unknown endpoint: {path}"})
            except Exception as exc:
                conn.rollback()
                self._send_json(500, {"error": str(exc)})
            finally:
                conn.close()

    def do_DELETE(self) -> None:
        parsed = urlparse(self.path)
        path = parsed.path

        with DB_LOCK:
            conn = get_conn()
            try:
                user = _current_user(conn, self.headers.get("Cookie"))
                if not user:
                    self._send_json(401, {"error": "Sign in to continue."})
                    return
                if path.startswith("/api/appointments/"):
                    if user["role"] != "admin":
                        self._send_json(403, {"error": "Only administrators can delete appointments."})
                        return
                    apt_id = path.split("/")[-1]
                    existing = conn.execute("SELECT stylist_id FROM appointments WHERE id = ?", (apt_id,)).fetchone()
                    if not existing:
                        self._send_json(404, {"error": "Appointment not found."})
                        return
                    conn.execute("DELETE FROM appointments WHERE id = ?", (apt_id,))
                    _record_audit_event(conn, user, "delete", "appointment", "Appointment cancelled.", apt_id)
                    conn.commit()
                    self._send_json(200, {"deleted": True, "id": apt_id})
                    return
                self._send_json(404, {"error": f"Unknown endpoint: {path}"})
            except Exception as exc:
                self._send_json(500, {"error": str(exc)})
            finally:
                conn.close()


def main() -> None:
    init_db()
    server = ThreadingHTTPServer(("127.0.0.1", PORT), SalonHandler)
    server.daemon_threads = True
    server.block_on_close = False
    print(f"Salon Pro Python API listening on http://127.0.0.1:{PORT}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
