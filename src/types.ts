export type WorkspaceTab =
  | 'dashboard'
  | 'my-day'
  | 'earnings'
  | 'my-appointments'
  | 'my-clients'
  | 'timesheet'
  | 'tasks'
  | 'notifications'
  | 'profile'
  | 'schedule'
  | 'pos'
  | 'clients'
  | 'catalog'
  | 'employees'
  | 'inventory'
  | 'reports'
  | 'settings'
  | 'system-logs'
  | 'backups'
  | 'support';

export type StaffRole = 'admin' | 'employee';

export interface StaffUser {
  id: string;
  name: string;
  username: string;
  email: string;
  phone?: string;
  stylist_id?: string;
  role: StaffRole;
  active: boolean;
  created_at?: string;
}

export interface BusinessSettings {
  business_name: string;
  phone: string;
  email: string;
  address: string;
  opening_time: string;
  closing_time: string;
  updated_at: string;
  updated_by: string;
}

export interface AuditLogEntry {
  id: string;
  actor_name: string;
  actor_role: StaffRole;
  action: string;
  entity_type: string;
  entity_id: string;
  summary: string;
  created_at: string;
}

export type SupportRequestStatus = 'open' | 'in_progress' | 'resolved';

export interface SupportRequest {
  id: string;
  requester_name: string;
  requester_email: string;
  category: string;
  priority: 'low' | 'normal' | 'high';
  subject: string;
  message: string;
  status: SupportRequestStatus;
  admin_reply: string;
  created_at: string;
  updated_at: string;
  updated_by: string;
}

export interface Announcement {
  id: string;
  sender_user_id: string;
  sender_name: string;
  sender_role: StaffRole;
  title: string;
  message: string;
  created_at: string;
  is_read: boolean;
}

export interface EmployeeEarningsReport {
  start_date: string;
  end_date: string;
  total_sales_ksh: number;
  total_commission_ksh: number;
  ticket_count: number;
  daily: Array<DailyRevenuePoint & { commission_ksh: number }>;
  tickets: Array<{
    id: string;
    ticket_number: string;
    business_date: string;
    created_at: string;
    client_name: string;
    payment_method: PaymentMethod;
    attributed_sales_ksh: number;
    commission_ksh: number;
    quantity: number;
  }>;
  items: Array<{
    item_name: string;
    kind: 'service' | 'product' | 'tip';
    quantity: number;
    sales_ksh: number;
    commission_ksh: number;
  }>;
}

export interface AuthStatus {
  setup_required: boolean;
  demo_mode: boolean;
  user: StaffUser | null;
}

export type AppointmentStatus =
  | 'Pending'
  | 'Confirmed'
  | 'In-Service'
  | 'Completed'
  | 'Cancelled'
  | 'No-Show';

export type PaymentMethod = 'M-Pesa' | 'Card' | 'Cash';

export interface Stylist {
  id: string;
  name: string;
  role: string;
  specialty: string;
  avatar_url: string;
  commission_rate: number;
  active: number;
}

export interface CatalogItem {
  id: string;
  kind: 'service' | 'product';
  category: string;
  name: string;
  description: string;
  price_ksh: number;
  duration_min: number;
  stock_qty: number;
  sku: string;
  active: number;
}

export interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  preferred_stylist_id: string;
  formula_notes: string;
  visit_count: number;
  total_spent_ksh: number;
  last_visit: string;
  created_at: string;
}

export interface Appointment {
  id: string;
  client_id: string;
  stylist_id: string;
  service_id: string;
  date: string;
  start_time: string;
  duration_min: number;
  status: AppointmentStatus;
  notes: string;
  ticket_id: string;
  created_at: string;
  client_name: string;
  client_phone: string;
  client_formula: string;
  stylist_name: string;
  stylist_role: string;
  stylist_avatar: string;
  service_name: string;
  service_category: string;
  service_price_ksh: number;
}

export interface TicketItem {
  id: string;
  ticket_id: string;
  catalog_item_id: string;
  item_name: string;
  kind: 'service' | 'product' | 'tip';
  stylist_id: string;
  stylist_name: string;
  quantity: number;
  unit_price_ksh: number;
  line_total_ksh: number;
  commission_ksh: number;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  client_id: string;
  client_name: string;
  appointment_id: string;
  subtotal_ksh: number;
  discount_ksh: number;
  tax_ksh: number;
  total_ksh: number;
  payment_method: PaymentMethod;
  tendered_ksh: number;
  change_ksh: number;
  status: 'Paid' | 'Voided';
  created_at: string;
  business_date: string;
  items: TicketItem[];
}

export interface StylistLeaderboardRow {
  stylist_id: string;
  name: string;
  role: string;
  avatar_url: string;
  commission_rate: number;
  revenue_ksh: number;
  commission_ksh: number;
  services_count: number;
}

export interface DailyAnalytics {
  date: string;
  gross_revenue_ksh: number;
  total_discounts_ksh: number;
  settled_tickets: number;
  total_tickets: number;
  avg_ticket_ksh: number;
  total_commissions_ksh: number;
  payment_breakdown: Record<PaymentMethod, number>;
  stylist_leaderboard: StylistLeaderboardRow[];
  appointment_counts: Record<string, number>;
  low_stock_count: number;
}

export interface DailyRevenuePoint {
  date: string;
  revenue_ksh: number;
  ticket_count: number;
}

export interface BootstrapPayload {
  date: string;
  business_settings: BusinessSettings;
  stylists: Stylist[];
  catalog: CatalogItem[];
  clients: Client[];
  appointments: Appointment[];
  analytics: DailyAnalytics;
  tickets: Ticket[];
  employee_dashboard?: EmployeeDashboard;
}

export interface EmployeeDashboard {
  today_sales_ksh: number;
  clients_served_week: number;
  weekly_sales_ksh: number;
  weekly_commission_ksh: number;
  performance_percent: number;
  low_stock_items: Array<{ id: string; name: string; stock_qty: number }>;
  weekly_revenue: DailyRevenuePoint[];
}

export interface CartLine {
  uid: string;
  catalog_item_id: string;
  name: string;
  kind: 'service' | 'product';
  unit_price_ksh: number;
  quantity: number;
  stylist_id: string;
}
