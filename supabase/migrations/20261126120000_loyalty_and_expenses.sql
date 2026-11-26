alter table public.clients
  add column if not exists loyalty_points integer not null default 0;
alter table public.tickets
  add column if not exists loyalty_points_earned integer not null default 0,
  add column if not exists loyalty_points_redeemed integer not null default 0;

create table if not exists public.salon_expenses (
  id text primary key,
  category text not null,
  description text not null default '',
  amount_ksh integer not null check (amount_ksh > 0),
  expense_date text not null,
  created_by_name text not null,
  updated_at text not null
);
create index if not exists salon_expenses_date_idx on public.salon_expenses (expense_date desc);
