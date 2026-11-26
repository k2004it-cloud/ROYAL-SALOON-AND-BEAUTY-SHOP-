alter table public.users
  add column if not exists job_title text not null default '';
