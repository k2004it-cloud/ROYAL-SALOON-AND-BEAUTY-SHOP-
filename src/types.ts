export type WorkspaceTab = 'schedule' | 'pos' | 'clients' | 'catalog' | 'ledger';

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
  kind: 'service' | 'product';
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

export interface BootstrapPayload {
  date: string;
  stylists: Stylist[];
  catalog: CatalogItem[];
  clients: Client[];
  appointments: Appointment[];
  analytics: DailyAnalytics;
  tickets: Ticket[];
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
