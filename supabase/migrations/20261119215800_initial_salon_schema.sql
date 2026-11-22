create extension if not exists pgcrypto;

create type public.salon_role as enum ('owner', 'manager', 'salonist', 'employee');
create type public.appointment_status as enum (
  'pending',
  'confirmed',
  'checked_in',
  'in_service',
  'completed',
  'cancelled',
  'no_show'
);
create type public.commission_kind as enum ('percentage', 'fixed');

create table public.salons (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 160),
  currency text not null default 'KES' check (currency = 'KES'),
  commission_basis text not null default 'discounted_price'
    check (commission_basis in ('original_price', 'discounted_price')),
  loyalty_points_per_amount integer not null default 1 check (loyalty_points_per_amount >= 0),
  loyalty_amount_step_ksh integer not null default 100 check (loyalty_amount_step_ksh > 0),
  work_auto_approval boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, name)
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  phone text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.salon_role not null,
  created_at timestamptz not null default now(),
  unique (salon_id, user_id),
  unique (salon_id, id)
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  employee_code text not null,
  name text not null,
  phone text not null default '',
  email text not null default '',
  role_title text not null default 'Stylist',
  specialty text not null default '',
  avatar_url text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, id),
  unique (salon_id, employee_code),
  foreign key (salon_id, profile_id) references public.user_roles (salon_id, user_id)
    deferrable initially deferred
);

create table public.service_categories (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  unique (salon_id, name)
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  category_id uuid,
  name text not null,
  description text not null default '',
  duration_min integer not null default 60 check (duration_min > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, category_id)
    references public.service_categories (salon_id, id) on delete set null
);

create table public.service_prices (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  service_id uuid not null,
  price_ksh bigint not null check (price_ksh >= 0),
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, service_id)
    references public.services (salon_id, id) on delete restrict
);

create table public.employee_service_rates (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  employee_id uuid not null,
  service_id uuid not null,
  commission_type public.commission_kind not null default 'percentage',
  commission_value numeric(12, 4) not null check (commission_value >= 0),
  effective_from timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, employee_id) references public.employees (salon_id, id) on delete restrict,
  foreign key (salon_id, service_id) references public.services (salon_id, id) on delete restrict,
  check (commission_type <> 'percentage' or commission_value <= 100)
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null,
  phone text not null,
  email text not null default '',
  preferred_employee_id uuid,
  formula_notes text not null default '',
  preferences text not null default '',
  birthday date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, preferred_employee_id)
    references public.employees (salon_id, id) on delete set null
);

create unique index customers_salon_phone_unique
  on public.customers (salon_id, phone) where phone <> '';

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  customer_id uuid,
  employee_id uuid not null,
  service_id uuid not null,
  status public.appointment_status not null default 'pending',
  starts_at timestamptz not null,
  duration_min integer not null check (duration_min > 0),
  service_name_snapshot text not null,
  price_ksh_snapshot bigint not null check (price_ksh_snapshot >= 0),
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, customer_id) references public.customers (salon_id, id) on delete set null,
  foreign key (salon_id, employee_id) references public.employees (salon_id, id) on delete restrict,
  foreign key (salon_id, service_id) references public.services (salon_id, id) on delete restrict
);

create index appointments_salon_starts_at_idx on public.appointments (salon_id, starts_at);
create index appointments_salon_employee_time_idx on public.appointments (salon_id, employee_id, starts_at);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  sku text not null default '',
  name text not null,
  category text not null default '',
  description text not null default '',
  price_ksh bigint not null check (price_ksh >= 0),
  cost_ksh bigint not null default 0 check (cost_ksh >= 0),
  quantity_on_hand integer not null default 0 check (quantity_on_hand >= 0),
  reorder_threshold integer not null default 0 check (reorder_threshold >= 0),
  supplier_name text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, id),
  unique (salon_id, sku)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete restrict,
  customer_id uuid,
  appointment_id uuid,
  receipt_number text not null,
  status text not null default 'open'
    check (status in ('open', 'unpaid', 'partially_paid', 'paid', 'refunded', 'cancelled')),
  subtotal_ksh bigint not null default 0 check (subtotal_ksh >= 0),
  discount_ksh bigint not null default 0 check (discount_ksh >= 0),
  tax_ksh bigint not null default 0 check (tax_ksh >= 0),
  total_ksh bigint not null default 0 check (total_ksh >= 0),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, id),
  unique (salon_id, receipt_number),
  foreign key (salon_id, customer_id) references public.customers (salon_id, id) on delete restrict,
  foreign key (salon_id, appointment_id) references public.appointments (salon_id, id) on delete restrict
);

create table public.sale_items (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  sale_id uuid not null,
  service_id uuid,
  product_id uuid,
  item_name_snapshot text not null,
  item_type text not null check (item_type in ('service', 'product')),
  quantity integer not null check (quantity > 0),
  unit_price_ksh bigint not null check (unit_price_ksh >= 0),
  discount_ksh bigint not null default 0 check (discount_ksh >= 0),
  line_total_ksh bigint not null check (line_total_ksh >= 0),
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, sale_id) references public.sales (salon_id, id) on delete restrict,
  foreign key (salon_id, service_id) references public.services (salon_id, id) on delete restrict,
  foreign key (salon_id, product_id) references public.products (salon_id, id) on delete restrict,
  check (
    (item_type = 'service' and service_id is not null and product_id is null)
    or (item_type = 'product' and product_id is not null and service_id is null)
  )
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  sale_id uuid not null,
  method text not null check (method in ('cash', 'mpesa', 'card', 'bank_transfer')),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'partially_paid', 'refunded', 'cancelled')),
  amount_ksh bigint not null check (amount_ksh > 0),
  transaction_reference text not null default '',
  confirmation_source text not null default '',
  confirmed_by uuid references auth.users (id) on delete set null,
  confirmed_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, sale_id) references public.sales (salon_id, id) on delete restrict,
  check (
    (status = 'confirmed' and confirmed_at is not null)
    or status <> 'confirmed'
  )
);

create table public.work_records (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  sale_item_id uuid,
  appointment_id uuid,
  customer_id uuid,
  service_id uuid not null,
  employee_id uuid not null,
  service_name_snapshot text not null,
  service_price_ksh_snapshot bigint not null check (service_price_ksh_snapshot >= 0),
  commission_type_snapshot public.commission_kind not null,
  commission_value_snapshot numeric(12, 4) not null check (commission_value_snapshot >= 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  notes text not null default '',
  submitted_by uuid references auth.users (id) on delete set null,
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, sale_item_id) references public.sale_items (salon_id, id) on delete restrict,
  foreign key (salon_id, appointment_id) references public.appointments (salon_id, id) on delete set null,
  foreign key (salon_id, customer_id) references public.customers (salon_id, id) on delete set null,
  foreign key (salon_id, service_id) references public.services (salon_id, id) on delete restrict,
  foreign key (salon_id, employee_id) references public.employees (salon_id, id) on delete restrict,
  check ((status = 'approved' and approved_at is not null) or status <> 'approved')
);

create unique index work_records_sale_employee_unique
  on public.work_records (salon_id, sale_item_id, employee_id) where sale_item_id is not null;
create unique index work_records_appointment_employee_unique
  on public.work_records (salon_id, appointment_id, employee_id) where appointment_id is not null;

create table public.commission_entries (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  employee_id uuid not null,
  work_record_id uuid,
  entry_type text not null check (entry_type in ('earned', 'payout', 'adjustment', 'reversal')),
  amount_ksh bigint not null check (amount_ksh <> 0),
  description text not null default '',
  source_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, employee_id) references public.employees (salon_id, id) on delete restrict,
  foreign key (salon_id, work_record_id) references public.work_records (salon_id, id) on delete restrict
);

create unique index commission_entries_work_record_once
  on public.commission_entries (salon_id, work_record_id)
  where entry_type = 'earned' and work_record_id is not null;

create table public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  employee_id uuid not null,
  amount_ksh bigint not null check (amount_ksh > 0),
  paid_at timestamptz not null default now(),
  payment_method text not null check (payment_method in ('cash', 'mpesa', 'bank_transfer')),
  reference text not null default '',
  notes text not null default '',
  paid_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, employee_id) references public.employees (salon_id, id) on delete restrict
);

create table public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  product_id uuid not null,
  movement_type text not null check (movement_type in ('purchase', 'sale', 'service_use', 'adjustment', 'return')),
  quantity_delta integer not null check (quantity_delta <> 0),
  unit_cost_ksh bigint check (unit_cost_ksh >= 0),
  sale_item_id uuid,
  notes text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, product_id) references public.products (salon_id, id) on delete restrict,
  foreign key (salon_id, sale_item_id) references public.sale_items (salon_id, id) on delete restrict
);

create unique index inventory_sale_item_once
  on public.inventory_movements (salon_id, sale_item_id, product_id)
  where movement_type = 'sale' and sale_item_id is not null;

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete restrict,
  category text not null,
  description text not null,
  amount_ksh bigint not null check (amount_ksh > 0),
  expense_date date not null default current_date,
  payment_method text not null check (payment_method in ('cash', 'mpesa', 'card', 'bank_transfer')),
  reference text not null default '',
  recorded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id)
);

create table public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  customer_id uuid not null,
  points_balance bigint not null default 0 check (points_balance >= 0),
  tier_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (salon_id, customer_id),
  unique (salon_id, id),
  foreign key (salon_id, customer_id) references public.customers (salon_id, id) on delete restrict
);

create table public.loyalty_tiers (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null,
  minimum_points bigint not null default 0 check (minimum_points >= 0),
  benefits text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  unique (salon_id, name)
);

alter table public.loyalty_accounts
  add constraint loyalty_accounts_tier_fk
  foreign key (salon_id, tier_id) references public.loyalty_tiers (salon_id, id) on delete set null;

create table public.loyalty_rules (
  salon_id uuid primary key references public.salons (id) on delete cascade,
  points_per_amount integer not null default 1 check (points_per_amount >= 0),
  amount_step_ksh integer not null default 100 check (amount_step_ksh > 0),
  points_expire_after_days integer check (points_expire_after_days is null or points_expire_after_days > 0),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null references public.salons (id) on delete cascade,
  name text not null,
  description text not null default '',
  points_cost bigint not null check (points_cost > 0),
  reward_type text not null check (reward_type in ('discount', 'free_service', 'offer', 'custom')),
  reward_value bigint not null default 0 check (reward_value >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (salon_id, id)
);

create table public.loyalty_transactions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  loyalty_account_id uuid not null,
  transaction_type text not null check (transaction_type in ('earned', 'redeemed', 'expired', 'reversal', 'adjustment')),
  points_delta bigint not null check (points_delta <> 0),
  sale_id uuid,
  description text not null default '',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, loyalty_account_id) references public.loyalty_accounts (salon_id, id) on delete restrict,
  foreign key (salon_id, sale_id) references public.sales (salon_id, id) on delete restrict
);

create unique index loyalty_earn_sale_once
  on public.loyalty_transactions (salon_id, loyalty_account_id, sale_id)
  where transaction_type = 'earned' and sale_id is not null;

create table public.loyalty_redemptions (
  id uuid primary key default gen_random_uuid(),
  salon_id uuid not null,
  loyalty_account_id uuid not null,
  reward_id uuid not null,
  sale_id uuid,
  points_spent bigint not null check (points_spent > 0),
  status text not null default 'pending' check (status in ('pending', 'redeemed', 'reversed')),
  redeemed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (salon_id, id),
  foreign key (salon_id, loyalty_account_id) references public.loyalty_accounts (salon_id, id) on delete restrict,
  foreign key (salon_id, reward_id) references public.loyalty_rewards (salon_id, id) on delete restrict,
  foreign key (salon_id, sale_id) references public.sales (salon_id, id) on delete restrict
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  salon_id uuid not null references public.salons (id) on delete restrict,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_salon_created_idx on public.audit_logs (salon_id, created_at desc);
create index commission_entries_employee_created_idx on public.commission_entries (salon_id, employee_id, created_at desc);
create index inventory_movements_product_created_idx on public.inventory_movements (salon_id, product_id, created_at desc);
create index payments_sale_status_idx on public.payments (salon_id, sale_id, status);
create index sales_salon_created_idx on public.sales (salon_id, created_at desc);
create index loyalty_transactions_account_created_idx on public.loyalty_transactions (salon_id, loyalty_account_id, created_at desc);

create or replace function public.is_salon_member(
  p_salon_id uuid,
  p_roles public.salon_role[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.salon_id = p_salon_id
      and ur.user_id = (select auth.uid())
      and (p_roles is null or ur.role = any (p_roles))
  );
$$;

create or replace function public.create_salon(p_name text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  new_salon_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if length(trim(coalesce(p_name, ''))) not between 1 and 160 then
    raise exception 'Salon name must be between 1 and 160 characters';
  end if;

  insert into public.profiles (id, full_name)
  values (auth.uid(), coalesce(auth.jwt() -> 'user_metadata' ->> 'full_name', ''))
  on conflict (id) do nothing;

  insert into public.salons (name)
  values (trim(p_name))
  returning id into new_salon_id;

  insert into public.user_roles (salon_id, user_id, role)
  values (new_salon_id, auth.uid(), 'owner');

  insert into public.loyalty_rules (salon_id)
  values (new_salon_id);

  return new_salon_id;
end;
$$;

grant execute on function public.create_salon(text) to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'employees', 'service_categories', 'services',
    'service_prices', 'employee_service_rates', 'customers', 'appointments',
    'sales', 'sale_items', 'payments', 'work_records', 'commission_entries',
    'commission_payouts', 'products', 'inventory_movements', 'expenses',
    'loyalty_accounts', 'loyalty_tiers', 'loyalty_rules', 'loyalty_rewards',
    'loyalty_transactions', 'loyalty_redemptions', 'audit_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format(
      'create policy salon_member_read on public.%I for select to authenticated using (public.is_salon_member(salon_id))',
      table_name
    );
  end loop;
end;
$$;

create policy salons_member_read on public.salons
  for select to authenticated using (public.is_salon_member(id));
create policy salons_owner_update on public.salons
  for update to authenticated using (public.is_salon_member(id, array['owner'::public.salon_role]))
  with check (public.is_salon_member(id, array['owner'::public.salon_role]));

create policy user_roles_member_read on public.user_roles
  for select to authenticated using (
    user_id = (select auth.uid())
    or public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role])
  );
create policy user_roles_owner_write on public.user_roles
  for all to authenticated using (public.is_salon_member(salon_id, array['owner'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role]));

alter table public.profiles enable row level security;
create policy profiles_self_read on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy profiles_self_update on public.profiles
  for update to authenticated using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

revoke all on function public.is_salon_member(uuid, public.salon_role[]) from public;
grant execute on function public.is_salon_member(uuid, public.salon_role[]) to authenticated;

create policy employees_manager_write on public.employees
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]));

create policy service_categories_manager_write on public.service_categories
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]));
create policy services_manager_write on public.services
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]));
create policy service_prices_manager_write on public.service_prices
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]));
create policy employee_service_rates_manager_write on public.employee_service_rates
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]));
create policy customers_staff_write on public.customers
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role, 'salonist'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role, 'salonist'::public.salon_role]));
create policy appointments_staff_write on public.appointments
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role, 'salonist'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role, 'salonist'::public.salon_role]));
create policy work_records_staff_write on public.work_records
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role, 'salonist'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role, 'salonist'::public.salon_role]));
create policy products_manager_write on public.products
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]));
create policy expenses_manager_write on public.expenses
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role, 'manager'::public.salon_role]));
create policy loyalty_rules_owner_write on public.loyalty_rules
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role]));
create policy loyalty_tiers_owner_write on public.loyalty_tiers
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role]));
create policy loyalty_rewards_owner_write on public.loyalty_rewards
  for all to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role]))
  with check (public.is_salon_member(salon_id, array['owner'::public.salon_role]));
create policy audit_logs_owner_read on public.audit_logs
  for select to authenticated
  using (public.is_salon_member(salon_id, array['owner'::public.salon_role]));

revoke all on function public.create_salon(text) from public;
grant execute on function public.create_salon(text) to authenticated;
