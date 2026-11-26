alter table public.users
  add column if not exists is_superadmin integer not null default 0;

-- Elevate the salon's first administrator as the single maintenance owner.
update public.users
set is_superadmin = 1
where id = (
  select id from public.users
  where role = 'admin' and active = 1
  order by created_at, id
  limit 1
)
and not exists (select 1 from public.users where is_superadmin = 1);

create unique index if not exists users_single_superadmin_idx
  on public.users (is_superadmin)
  where is_superadmin = 1;
