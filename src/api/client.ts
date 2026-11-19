import type {
  Appointment,
  AppointmentStatus,
  BootstrapPayload,
  CatalogItem,
  Client,
  PaymentMethod,
  Ticket,
} from '../types';

async function apiRequest<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
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
  bootstrap(date: string): Promise<BootstrapPayload> {
    return apiRequest<BootstrapPayload>(`/api/bootstrap?date=${encodeURIComponent(date)}`);
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

  checkoutTicket(payload: {
    client_id: string;
    client_name: string;
    appointment_id?: string;
    payment_method: PaymentMethod;
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
