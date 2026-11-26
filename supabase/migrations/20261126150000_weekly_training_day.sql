create table if not exists public.training_settings (
  id integer primary key check (id = 1),
  day_of_week integer check (day_of_week between 0 and 6),
  updated_at text not null,
  updated_by text not null default ''
);

insert into public.training_settings (id, day_of_week, updated_at, updated_by)
values (1, null, now()::text, '')
on conflict (id) do nothing;

alter table public.training_settings enable row level security;
revoke all on public.training_settings from anon, authenticated;
