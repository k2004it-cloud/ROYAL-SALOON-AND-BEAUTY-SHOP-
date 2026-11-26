alter table public.catalog_items
  add column if not exists commission_rate double precision not null default 0.35
  check (commission_rate >= 0 and commission_rate <= 1);
