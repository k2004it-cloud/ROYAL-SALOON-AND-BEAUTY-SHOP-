import type {
  Appointment,
  AppointmentStatus,
  AuditLogEntry,
  Announcement,
  AttendanceRecord,
  BootstrapPayload,
  BusinessSettings,
  CatalogItem,
  Client,
  CommissionEmployeeSummary,
  CommissionPayout,
  DailyRevenuePoint,
  EmployeeEarningsReport,
  InventoryReport,
  SalonExpense,
  InventoryReportType,
  PaymentMethod,
  AuthStatus,
  StaffUser,
  StaffTask,
  StaffTaskStatus,
  SupportRequest,
  SupportRequestStatus,
  Ticket,
} from '../types';

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(options?.headers || {}),
    },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data as T;
}

export function formatKsh(amount: number): string {
  const safe = Number.isFinite(amount) ? Math.round(amount) : 0;
  return `KSh ${safe.toLocaleString('en-KE')}`;
}

export function todayIsoDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function offsetIsoDate(baseIso: string, deltaDays: number): string {
  const [y, m, d] = baseIso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + deltaDays);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, '0');
  const dd = String(dt.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

export const salonApi = {
  superadminDiagnostics(): Promise<{
    api_status: string;
    database_engine: string;
    active_accounts: number;
    employees_without_stylist: number;
    low_stock_items: number;
    open_support_requests: number;
    checked_at: string;
  }> {
    return apiRequest('/api/superadmin/diagnostics');
  },
  listExpenses(): Promise<{ expenses: SalonExpense[] }> {
    return apiRequest('/api/expenses');
  },

  createExpense(payload: Pick<SalonExpense, 'category' | 'description' | 'amount_ksh' | 'expense_date'>): Promise<{ expense: SalonExpense }> {
    return apiRequest('/api/expenses', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateExpense(id: string, payload: Pick<SalonExpense, 'category' | 'description' | 'amount_ksh' | 'expense_date'>): Promise<{ expense: SalonExpense }> {
    return apiRequest(`/api/expenses/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(payload) });
  },

  authStatus(): Promise<AuthStatus> {
    return apiRequest<AuthStatus>('/api/auth/status');
  },

  setupAdmin(payload: { name: string; username: string; email: string; password: string }): Promise<{ user: StaffUser }> {
    return apiRequest('/api/auth/setup', { method: 'POST', body: JSON.stringify(payload) });
  },

  setupSuperadmin(payload: { name: string; username: string; email: string; password: string }): Promise<{ user: StaffUser }> {
    return apiRequest('/api/auth/setup/superadmin', { method: 'POST', body: JSON.stringify(payload) });
  },

  login(payload: { username: string; password: string; role: 'superadmin' | 'admin' | 'employee' }): Promise<{ user: StaffUser }> {
    return apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify(payload) });
  },

  requestPasswordReset(payload: { email: string }): Promise<{ message: string }> {
    return apiRequest('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify(payload) });
  },

  confirmPasswordReset(payload: { token: string; new_password: string }): Promise<{ reset: boolean }> {
    return apiRequest('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify(payload) });
  },

  logout(): Promise<{ logged_out: boolean }> {
    return apiRequest('/api/auth/logout', { method: 'POST', body: JSON.stringify({}) });
  },

  listEmployees(): Promise<{ employees: StaffUser[] }> {
    return apiRequest('/api/employees');
  },

  createEmployee(payload: { name: string; username: string; email: string; phone: string; password: string; stylist_id?: string }): Promise<{ employee: StaffUser }> {
    return apiRequest('/api/employees', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateEmployee(id: string, payload: { active?: boolean; stylist_id?: string }): Promise<{ employee: StaffUser }> {
    return apiRequest(`/api/employees/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  updateBusinessSettings(payload: Pick<BusinessSettings, 'business_name' | 'phone' | 'email' | 'address' | 'opening_time' | 'closing_time'>): Promise<{ settings: BusinessSettings }> {
    return apiRequest('/api/settings/business', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  changePassword(payload: { current_password: string; new_password: string }): Promise<{ changed: boolean }> {
    return apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateProfile(payload: { name: string; email: string; phone: string }): Promise<{ user: StaffUser }> {
    return apiRequest('/api/auth/profile', { method: 'PATCH', body: JSON.stringify(payload) });
  },

  employeeEarnings(start: string, end: string): Promise<EmployeeEarningsReport> {
    return apiRequest('/api/employee/earnings?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end));
  },

  employeeEarningsExportUrl(start: string, end: string): string {
    return '/api/employee/earnings/export?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end);
  },

  commissionPayroll(): Promise<{ employees: CommissionEmployeeSummary[]; payouts: CommissionPayout[] }> {
    return apiRequest('/api/payroll/commissions');
  },

  createCommissionPayout(payload: {
    employee_id: string;
    amount_ksh: number;
    payment_method: CommissionPayout['payment_method'];
    reference: string;
    notes: string;
  }): Promise<{ payout: CommissionPayout }> {
    return apiRequest('/api/payroll/payouts', { method: 'POST', body: JSON.stringify(payload) });
  },

  employeeAttendance(start: string, end: string): Promise<{ records: AttendanceRecord[] }> {
    return apiRequest('/api/employee/attendance?start=' + encodeURIComponent(start) + '&end=' + encodeURIComponent(end));
  },

  adminAttendance(date: string): Promise<{ records: AttendanceRecord[] }> {
    return apiRequest('/api/attendance?date=' + encodeURIComponent(date));
  },

  clockIn(): Promise<{ record: AttendanceRecord }> {
    return apiRequest('/api/employee/attendance/clock-in', { method: 'POST', body: JSON.stringify({}) });
  },

  clockOut(): Promise<{ record: AttendanceRecord }> {
    return apiRequest('/api/employee/attendance/clock-out', { method: 'POST', body: JSON.stringify({}) });
  },

  listTasks(): Promise<{ tasks: StaffTask[] }> {
    return apiRequest('/api/tasks');
  },

  createTask(payload: { title: string; description: string; assigned_to_user_id: string; priority: StaffTask['priority']; due_date: string }): Promise<{ task: StaffTask }> {
    return apiRequest('/api/tasks', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateTaskStatus(id: string, status: StaffTaskStatus): Promise<{ task: StaffTask }> {
    return apiRequest('/api/tasks/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status }) });
  },

  listAnnouncements(): Promise<{ announcements: Announcement[]; unread_count: number }> {
    return apiRequest('/api/announcements');
  },

  createAnnouncement(payload: { title: string; message: string }): Promise<{ announcement: Announcement }> {
    return apiRequest('/api/announcements', { method: 'POST', body: JSON.stringify(payload) });
  },

  markAnnouncementRead(id: string): Promise<{ read: boolean; id: string }> {
    return apiRequest('/api/announcements/' + encodeURIComponent(id) + '/read', { method: 'POST', body: JSON.stringify({}) });
  },

  listAuditLogs(date: string): Promise<{ entries: AuditLogEntry[] }> {
    return apiRequest(`/api/audit-logs?date=${encodeURIComponent(date)}`);
  },

  listSupportRequests(): Promise<{ requests: SupportRequest[] }> {
    return apiRequest('/api/support/requests');
  },

  createSupportRequest(payload: {
    category: string;
    priority: SupportRequest['priority'];
    subject: string;
    message: string;
  }): Promise<{ request: SupportRequest }> {
    return apiRequest('/api/support/requests', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateSupportRequest(
    id: string,
    payload: { status: SupportRequestStatus; admin_reply: string }
  ): Promise<{ request: SupportRequest }> {
    return apiRequest(`/api/support/requests/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  bootstrap(date: string): Promise<BootstrapPayload> {
    return apiRequest<BootstrapPayload>(`/api/bootstrap?date=${encodeURIComponent(date)}`);
  },

  analyticsTrend(date: string, days = 30): Promise<{ date: string; days: number; points: DailyRevenuePoint[] }> {
    return apiRequest(`/api/analytics/trend?date=${encodeURIComponent(date)}&days=${days}`);
  },

  createAppointment(payload: {
    client_id: string;
    stylist_id: string;
    service_id: string;
    date: string;
    start_time: string;
    duration_min?: number;
    status?: AppointmentStatus;
    notes?: string;
  }): Promise<{ appointment: Appointment }> {
    return apiRequest('/api/appointments', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateAppointment(
    id: string,
    payload: Partial<{
      stylist_id: string;
      service_id: string;
      date: string;
      start_time: string;
      duration_min: number;
      status: AppointmentStatus;
      notes: string;
    }>
  ): Promise<{ appointment: Appointment }> {
    return apiRequest(`/api/appointments/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  deleteAppointment(id: string): Promise<{ deleted: boolean }> {
    return apiRequest(`/api/appointments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  createClient(payload: {
    name: string;
    phone: string;
    email?: string;
    preferred_stylist_id?: string;
    formula_notes?: string;
  }): Promise<{ client: Client }> {
    return apiRequest('/api/clients', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateClient(
    id: string,
    payload: Partial<{
      name: string;
      phone: string;
      email: string;
      preferred_stylist_id: string;
      formula_notes: string;
    }>
  ): Promise<{ client: Client }> {
    return apiRequest(`/api/clients/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  createCatalogItem(payload: {
    kind: 'service' | 'product';
    category: string;
    name: string;
    description?: string;
    price_ksh: number;
    duration_min?: number;
    stock_qty?: number;
    sku?: string;
  }): Promise<{ item: CatalogItem }> {
    return apiRequest('/api/catalog', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateCatalogItem(
    id: string,
    payload: Partial<{
      name: string;
      category: string;
      description: string;
      price_ksh: number;
      duration_min: number;
      stock_qty: number;
      stock_delta: number;
    }>
  ): Promise<{ item: CatalogItem }> {
    return apiRequest(`/api/catalog/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  },

  inventoryReports(): Promise<{ reports: InventoryReport[] }> {
    return apiRequest('/api/inventory/reports');
  },

  createInventoryReport(payload: { catalog_item_id: string; report_type: InventoryReportType; quantity: number; note: string }): Promise<{ report: InventoryReport; item: CatalogItem }> {
    return apiRequest('/api/inventory/reports', { method: 'POST', body: JSON.stringify(payload) });
  },

  updateInventoryReport(id: string, status: InventoryReport['status']): Promise<{ report: InventoryReport }> {
    return apiRequest('/api/inventory/reports/' + encodeURIComponent(id), { method: 'PATCH', body: JSON.stringify({ status }) });
  },

  checkoutTicket(payload: {
    client_id: string;
    client_name: string;
    appointment_id?: string;
    payment_method: PaymentMethod;
    transaction_reference: string;
    tip_ksh?: number;
    tip_stylist_id?: string;
    discount_type: 'none' | 'percent' | 'fixed';
    discount_value: number;
    tendered_ksh: number;
    business_date: string;
    items: Array<{
      catalog_item_id: string;
      quantity: number;
      stylist_id: string;
    }>;
  }): Promise<{ ticket: Ticket }> {
    return apiRequest('/api/tickets/checkout', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  voidTicket(id: string): Promise<{ voided: boolean }> {
    return apiRequest(`/api/tickets/${encodeURIComponent(id)}/void`, {
      method: 'POST',
    });
  },

  exportLedgerUrl(date: string): string {
    return `/api/ledger/export?date=${encodeURIComponent(date)}`;
  },
};
