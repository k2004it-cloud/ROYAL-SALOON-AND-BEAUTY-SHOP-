# Supabase setup for Royal Salon

## Current status

The migration in `migrations/20261119215800_initial_salon_schema.sql` now describes the tables used by the salon admin and employee features. It enables row-level security and grants browser roles no table access.

The running Python API still uses the local SQLite database. This migration prepares the Supabase schema, but applying it does not switch the app's storage to Supabase. The Python API must be changed to use PostgreSQL before the hosted app can read or write these tables.

The app also currently manages its own employee and admin login sessions. Supabase Auth is not connected to that login flow.

## Create the Supabase project

1. Create a Supabase project with the name you chose.
2. Save the database password somewhere private; Supabase will not show it again.
3. Wait for the database to finish provisioning.

## Apply the schema

For a new, empty project, open **SQL Editor** in the Supabase dashboard, paste the contents of `migrations/20261119215800_initial_salon_schema.sql`, and run it. The migration is also kept in this repository so it can be applied through Supabase CLI as the deployment workflow is set up.

After it succeeds, the public schema should contain the app tables, including `users`, `appointments`, `tickets`, `attendance_records`, `staff_tasks`, and `inventory_reports`.

Do not apply this initial migration to a database that already has salon data or an earlier version of these tables without reviewing a data migration first.

## Connect the app after the project is ready

The next code change is to replace the Python API's SQLite connection with a PostgreSQL connection and map its existing queries to PostgreSQL. Then configure the backend with the database connection string from **Connect** in the Supabase dashboard. The Python process is a persistent backend; use the direct connection when the host supports it, or the session pooler when it needs IPv4 compatibility.

Keep the database connection string in a server-side secret such as `DATABASE_URL`. Do not add it to a `VITE_*` variable, frontend code, or source control. The browser should continue to call the app API, which enforces the existing admin and employee permissions.

When the backend connection is implemented, SQLite can remain the local-development default until the team chooses to make Supabase the default for all environments.
