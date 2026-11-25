"""Reset an existing Royal Salon administrator login without deleting salon data."""

from __future__ import annotations

import getpass
import hashlib
import re
import secrets
import sys

try:
    import psycopg
except ImportError:
    print("Missing PostgreSQL driver. Install it with: python -m pip install -r backend/requirements.txt")
    raise SystemExit(1)


PASSWORD_ITERATIONS = 240_000
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9._-]{3,30}$")


def credential_hash(password: str) -> tuple[str, str]:
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PASSWORD_ITERATIONS)
    return salt.hex(), digest.hex()


def main() -> int:
    print("Admin recovery updates an existing account and preserves salon records.")
    database_url = getpass.getpass("Supabase PostgreSQL connection string (input hidden): ").strip()
    if not database_url.startswith(("postgres://", "postgresql://")):
        print("A PostgreSQL connection string is required.")
        return 1

    try:
        with psycopg.connect(database_url, connect_timeout=15) as conn:
            admins = conn.execute(
                "SELECT id, username, email, active FROM public.users WHERE role = 'admin' ORDER BY username"
            ).fetchall()
            if not admins:
                print("No admin account exists. Use the app's first-time Admin setup screen instead.")
                return 1

            print("\nAdmin accounts:")
            for index, (_, username, email, active) in enumerate(admins, start=1):
                state = "active" if active else "inactive"
                print(f"  {index}. {username} ({email}, {state})")

            selection = input("Choose the admin account number to recover: ").strip()
            if not selection.isdigit() or not 1 <= int(selection) <= len(admins):
                print("That account number is not in the list.")
                return 1

            user_id, old_username, _, _ = admins[int(selection) - 1]
            new_username = input(f"New username [{old_username}]: ").strip() or old_username
            if not USERNAME_PATTERN.fullmatch(new_username):
                print("Username must be 3–30 characters: letters, numbers, periods, underscores, or hyphens.")
                return 1

            password = getpass.getpass("New password (10–128 characters, input hidden): ")
            confirmation = getpass.getpass("Confirm new password: ")
            if len(password) < 10 or len(password) > 128:
                print("Password must be between 10 and 128 characters.")
                return 1
            if password != confirmation:
                print("Passwords did not match; no changes were made.")
                return 1

            collision = conn.execute(
                "SELECT 1 FROM public.users WHERE lower(username) = lower(%s) AND id <> %s",
                (new_username, user_id),
            ).fetchone()
            if collision:
                print("That username is already used by another account; no changes were made.")
                return 1

            salt, digest = credential_hash(password)
            conn.execute(
                "UPDATE public.users SET username = %s, password_salt = %s, password_hash = %s, active = 1 WHERE id = %s AND role = 'admin'",
                (new_username, salt, digest, user_id),
            )
            conn.execute("DELETE FROM public.sessions WHERE user_id = %s", (user_id,))
            account_keys = {
                hashlib.sha256(old_username.strip().lower().encode("utf-8")).hexdigest(),
                hashlib.sha256(new_username.strip().lower().encode("utf-8")).hexdigest(),
            }
            conn.execute(
                "DELETE FROM public.auth_attempts WHERE account_key = ANY(%s)",
                (list(account_keys),),
            )

        print(f"\nAdmin login reset successfully. Sign in with username: {new_username}")
        print("The new password was not displayed or saved by this script.")
        return 0
    except (psycopg.Error, OSError) as exc:
        print(f"Recovery failed: {exc.__class__.__name__}: {exc}")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
