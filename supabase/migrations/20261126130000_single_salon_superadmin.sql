alter table public.users
  add column if not exists is_superadmin integer not null default 0;

create unique index if not exists users_single_superadmin_idx
  on public.users (is_superadmin)
  where is_superadmin = 1;
