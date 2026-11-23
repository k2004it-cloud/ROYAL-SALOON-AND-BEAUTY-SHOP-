# Supabase setup for Royal Salon

## Current status

The migrations preserve the original schema history, then add the tables used by the current salon admin and employee features. The forward migration renames the three incompatible legacy tables with a `legacy_v1_` prefix, preserving their data, and enables row-level security on the app tables while removing browser-role access.

The running Python API still uses the local SQLite database. This migration prepares the Supabase schema, but applying it does not switch the app's storage to Supabase. The Python API must be changed to use PostgreSQL before the hosted app can read or write these tables.

The app also currently manages its own employee and admin login sessions. Supabase Auth is not connected to that login flow.

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

## Connect the app after the project is ready

The next code change is to replace the Python API's SQLite connection with a PostgreSQL connection and map its existing queries to PostgreSQL. Then configure the backend with the database connection string from **Connect** in the Supabase dashboard. The Python process is a persistent backend; use the direct connection when the host supports it, or the session pooler when it needs IPv4 compatibility.

Keep the database connection string in a server-side secret such as `DATABASE_URL`. Do not add it to a `VITE_*` variable, frontend code, or source control. The browser should continue to call the app API, which enforces the existing admin and employee permissions.

When the backend connection is implemented, SQLite can remain the local-development default until the team chooses to make Supabase the default for all environments.
