-- Schema for the Royal Salon admin and employee app.
-- The application currently connects through its server-side Python API.

create table public.users (
  id text primary key,
  name text not null,
  username text not null default '',
  email text not null,
  password_salt text not null,
  password_hash text not null,
  pin_salt text not null,
  pin_hash text not null,
  stylist_id text not null default '',
  phone text not null default '',
  role text not null check (role in ('admin', 'employee')),
  active integer not null default 1 check (active in (0, 1)),
  created_at text not null
);
create unique index users_email_unique_ci on public.users (lower(email));
create unique index idx_users_username_unique on public.users (lower(username));

create table public.sessions (
  token_hash text primary key,
  user_id text not null references public.users(id) on delete cascade,
  expires_at bigint not null,
  created_at text not null
);

create table public.auth_attempts (
  account_key text primary key,
  attempts integer not null default 0,
  locked_until bigint not null default 0
);

create table public.business_settings (
  id integer primary key check (id = 1),
  business_name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  opening_time text not null default '09:00',
  closing_time text not null default '19:30',
  updated_at text not null,
  updated_by text not null default ''
);

create table public.audit_logs (
  id text primary key,
  actor_user_id text not null default '',
  actor_name text not null,
  actor_role text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null default '',
  summary text not null,
  created_at text not null
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

create table public.support_requests (
  id text primary key,
  requester_user_id text not null,
  requester_name text not null,
  requester_email text not null default '',
  category text not null,
  priority text not null check (priority in ('low', 'normal', 'high')),
  subject text not null,
  message text not null,
  status text not null check (status in ('open', 'in_progress', 'resolved')),
  admin_reply text not null default '',
  created_at text not null,
  updated_at text not null,
  updated_by text not null default ''
);
create index support_requests_status_created_idx on public.support_requests (status, created_at desc);

create table public.announcements (
  id text primary key,
  sender_user_id text not null,
  sender_name text not null,
  sender_role text not null check (sender_role in ('admin', 'employee')),
  title text not null,
  message text not null,
  created_at text not null
);

create table public.announcement_reads (
  announcement_id text not null references public.announcements(id) on delete cascade,
  user_id text not null references public.users(id) on delete cascade,
  read_at text not null,
  primary key (announcement_id, user_id)
);

create table public.stylists (
  id text primary key,
  name text not null,
  role text not null,
  specialty text not null,
  avatar_url text not null,
  commission_rate double precision not null default 0.35,
  active integer not null default 1 check (active in (0, 1))
);

create table public.catalog_items (
  id text primary key,
  kind text not null check (kind in ('service', 'product')),
  category text not null,
  name text not null,
  description text not null default '',
  price_ksh integer not null,
  duration_min integer not null default 0,
  stock_qty integer not null default 0,
  sku text not null default '',
  active integer not null default 1 check (active in (0, 1))
);
create index catalog_items_active_kind_idx on public.catalog_items (active, kind, category, name);

create table public.clients (
  id text primary key,
  name text not null,
  phone text not null,
  email text not null default '',
  preferred_stylist_id text default '',
  formula_notes text not null default '',
  visit_count integer not null default 0,
  total_spent_ksh integer not null default 0,
  last_visit text not null default '',
  created_at text not null
);
create index clients_name_idx on public.clients (name);
create index clients_phone_idx on public.clients (phone);

create table public.appointments (
  id text primary key,
  client_id text not null references public.clients(id),
  stylist_id text not null references public.stylists(id),
  service_id text not null references public.catalog_items(id),
  date text not null,
  start_time text not null,
  duration_min integer not null,
  status text not null check (status in ('Pending', 'Confirmed', 'In-Service', 'Completed', 'Cancelled', 'No-Show')),
  notes text not null default '',
  ticket_id text default '',
  created_at text not null
);
create index appointments_date_start_idx on public.appointments (date, start_time);
create index appointments_stylist_date_idx on public.appointments (stylist_id, date, status);
create index appointments_client_idx on public.appointments (client_id, date desc);

create table public.tickets (
  id text primary key,
  ticket_number text not null unique,
  client_id text default '',
  client_name text not null,
  appointment_id text default '',
  subtotal_ksh integer not null,
  discount_ksh integer not null default 0,
  tax_ksh integer not null default 0,
  total_ksh integer not null,
  payment_method text not null check (payment_method in ('M-Pesa', 'Card', 'Cash')),
  transaction_reference text not null default '',
  tendered_ksh integer not null,
  change_ksh integer not null default 0,
  status text not null check (status in ('Paid', 'Voided')),
  created_at text not null,
  business_date text not null
);
create index tickets_business_date_idx on public.tickets (business_date, created_at desc);

create table public.ticket_items (
  id text primary key,
  ticket_id text not null references public.tickets(id) on delete cascade,
  catalog_item_id text not null,
  item_name text not null,
  kind text not null,
  stylist_id text default '',
  stylist_name text default '',
  quantity integer not null,
  unit_price_ksh integer not null,
  line_total_ksh integer not null,
  commission_ksh integer not null default 0
);
create index ticket_items_ticket_idx on public.ticket_items (ticket_id);
create index ticket_items_stylist_idx on public.ticket_items (stylist_id, ticket_id);

create table public.commission_payouts (
  id text primary key,
  employee_user_id text not null references public.users(id) on delete cascade,
  stylist_id text not null,
  amount_ksh integer not null check (amount_ksh > 0),
  payment_method text not null check (payment_method in ('Cash', 'M-Pesa', 'Bank Transfer')),
  reference text not null default '',
  notes text not null default '',
  paid_at text not null,
  recorded_by_user_id text not null references public.users(id) on delete cascade,
  recorded_by_name text not null,
  created_at text not null
);
create index commission_payouts_employee_paid_idx on public.commission_payouts (employee_user_id, paid_at desc);

create table public.commission_payout_items (
  id text primary key,
  payout_id text not null references public.commission_payouts(id) on delete cascade,
  ticket_item_id text not null references public.ticket_items(id),
  amount_ksh integer not null check (amount_ksh > 0)
);
create index idx_commission_payout_items_ticket on public.commission_payout_items(ticket_item_id);

create table public.attendance_records (
  id text primary key,
  user_id text not null references public.users(id) on delete cascade,
  work_date text not null,
  clock_in text not null,
  clock_out text not null default '',
  created_at text not null,
  unique (user_id, work_date)
);
create index attendance_work_date_idx on public.attendance_records (work_date desc, user_id);

create table public.staff_tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  assigned_to_user_id text not null references public.users(id) on delete cascade,
  created_by_user_id text not null references public.users(id) on delete cascade,
  status text not null check (status in ('assigned', 'in_progress', 'completed')),
  priority text not null default 'normal',
  due_date text not null default '',
  created_at text not null,
  updated_at text not null,
  completed_at text not null default ''
);
create index idx_staff_tasks_assignee_status on public.staff_tasks (assigned_to_user_id, status, due_date);

create table public.inventory_reports (
  id text primary key,
  catalog_item_id text not null references public.catalog_items(id),
  item_name text not null,
  report_type text not null check (report_type in ('usage', 'low_stock', 'damaged')),
  quantity integer not null default 1 check (quantity >= 0),
  note text not null default '',
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by_user_id text not null references public.users(id) on delete cascade,
  created_by_name text not null,
  created_at text not null,
  resolved_by_user_id text not null default '',
  resolved_at text not null default ''
);
create index idx_inventory_reports_status_created on public.inventory_reports (status, created_at desc);

-- Browser clients must not read salon records directly. The Python API remains
-- the authorization boundary and will connect with a server-only DB credential.
alter table public.users enable row level security;
alter table public.sessions enable row level security;
alter table public.auth_attempts enable row level security;
alter table public.business_settings enable row level security;
alter table public.audit_logs enable row level security;
alter table public.support_requests enable row level security;
alter table public.announcements enable row level security;
alter table public.announcement_reads enable row level security;
alter table public.stylists enable row level security;
alter table public.catalog_items enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.tickets enable row level security;
alter table public.ticket_items enable row level security;
alter table public.commission_payouts enable row level security;
alter table public.commission_payout_items enable row level security;
alter table public.attendance_records enable row level security;
alter table public.staff_tasks enable row level security;
alter table public.inventory_reports enable row level security;

revoke all on all tables in schema public from anon, authenticated;
