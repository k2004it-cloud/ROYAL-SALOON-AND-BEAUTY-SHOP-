alter table public.users
  add column if not exists password_change_required integer not null default 0;
