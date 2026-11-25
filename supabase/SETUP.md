# Supabase setup for Royal Salon

## Current status

The migrations preserve the original schema history, then add the tables used by the current salon admin and employee features. The forward migration renames the three incompatible legacy tables with a `legacy_v1_` prefix, preserving their data, and enables row-level security on the app tables while removing browser-role access.

The Python API supports both PostgreSQL and SQLite. It uses SQLite for local development by default; setting the server-only `SALON_DATABASE_URL` switches it to Supabase PostgreSQL. The local SQLite file is left untouched.

For Vercel, `api/index.py` adapts the existing API routes to a FastAPI function. Vercel serves the Vite build and sends `/api/*` requests to that function. The local Express/Python server remains available for development.

The app manages employee and admin login itself; Supabase Auth is not connected to that login flow. Password recovery uses a one-time email link. The raw reset token is never stored, links expire after 15 minutes, and a completed reset invalidates all active sessions for that account.

## Create the Supabase project

1. Create a Supabase project with the name you chose.
2. Save the database password somewhere private; Supabase will not show it again.
3. Wait for the database to finish provisioning.

## Apply the schema

From the repository root, sign in to the Supabase CLI, link your hosted project, and apply the versioned migrations in order:

```powershell
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push --remote
```

Use `--remote` so the CLI targets the linked hosted project instead of the local database. If prompted for the database password, enter it in the terminal. Keep this migration workflow in the CLI so Supabase records the migration history correctly.

After it succeeds, the public schema should contain the app tables, including `users`, `appointments`, `tickets`, `attendance_records`, `staff_tasks`, and `inventory_reports`.

The forward migration preserves the prior schema's overlapping tables by renaming them; it does not drop those tables or their data.

## Connect the local app

Install the PostgreSQL driver for the local backend with `pip install -r backend/requirements.txt`, then set `SALON_DATABASE_URL` in the backend's private environment using the connection string from **Connect** in the Supabase dashboard. Copy the connection string there; do not send it in chat. The Python process is a persistent backend; use the direct connection when the host supports it, or the session pooler when it needs IPv4 compatibility.

For local development, copy `.env.example` to `.env` and set `SALON_DATABASE_URL` there. `server.ts` loads `.env` and passes the value to the Python API. Keep the database connection string server-side. Do not add it to a `VITE_*` variable, frontend code, or source control. The browser continues to call the app API, which enforces the existing admin and employee permissions.

When PostgreSQL is first enabled, it will use the Supabase tables and will not copy records from `backend/salon_pro.db`. The admin setup screen will be available if no administrator exists in Supabase. Any data transfer from the local SQLite file should be handled as a separate, reviewed import.

## Deploy on Vercel

1. Push the repository to a Git provider and import it as a Vercel project. Keep the project root set to the repository root; `vercel.json` configures the Vite build, static output, API function, and SPA routes. Vercel installs the Python function dependencies from the root `requirements.txt`.
2. In Vercel project settings, add `SALON_DATABASE_URL` as a server-side environment variable for Production. Use the Supabase **Session pooler** URI on port `5432`, with `sslmode=require`. Do not prefix it with `VITE_`.
3. Deploy. Vercel builds the frontend and runs the Python API as a function. The Supabase migrations must be applied before deployment. The repository's migrations were up to date when this setup was added.
4. In Vercel Production environment variables, configure the SMTP provider: `SMTP_HOST`, `SMTP_PORT` (`587` for STARTTLS or `465` for implicit TLS), `SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL`. Set `APP_URL` to the HTTPS production origin, such as `https://your-domain.vercel.app`. Use a sender address authorized by your email provider. Keep all SMTP values server-side.
5. Deploy. Vercel builds the frontend and runs the Python API as a function. Apply the versioned Supabase migrations before deployment.
6. After deployment, verify `/api/health` reports `python-postgresql`, sign in with admin and employee accounts, and test password recovery with an account email you can access.

Do not add `.env` to the repository. Use Vercel's environment variable settings for the production connection string. The Vercel API adapter refuses to start if `SALON_DATABASE_URL` is missing, so it cannot silently fall back to SQLite.

Password reset endpoints are unavailable until SMTP and `APP_URL` are configured. The request endpoint returns the same message whether or not an active account matches the submitted email. It limits repeat requests for an account, stores only a SHA-256 hash of each random reset token, expires tokens after 15 minutes, and consumes all outstanding tokens after a successful reset.
