import { useCallback, useEffect, useState } from 'react';
import type {
  Appointment,
  AppointmentStatus,
  BootstrapPayload,
  CartLine,
  CatalogItem,
  PaymentMethod,
  Ticket,
  WorkspaceTab,
} from './types';
import { formatKsh, salonApi, todayIsoDate } from './api/client';
import { SidebarRail } from './components/SidebarRail';
import { ScheduleView } from './components/ScheduleView';
import { PosView } from './components/PosView';
import { ClientsView } from './components/ClientsView';
import { CatalogView } from './components/CatalogView';
import { LedgerView } from './components/LedgerView';

export default function App() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('schedule');
  const [railCollapsed, setRailCollapsed] = useState(false);
  const [businessDate, setBusinessDate] = useState<string>(todayIsoDate);

  const [data, setData] = useState<BootstrapPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>('');
  const [toast, setToast] = useState<string>('');

  // Shared POS Ticket state across workspace handoffs
  const [cart, setCart] = useState<CartLine[]>([]);
  const [posClientId, setPosClientId] = useState<string>('');
  const [linkedAppointmentId, setLinkedAppointmentId] = useState<string>('');

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => {
      setToast((curr) => (curr === msg ? '' : curr));
    }, 3400);
  }, []);

  const refreshData = useCallback(async (targetDate: string) => {
    setLoadError('');
    try {
      const payload = await salonApi.bootstrap(targetDate);
      setData(payload);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Unable to reach Salon Pro Python API.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData(businessDate);
  }, [businessDate, refreshData]);

  const handleAddToCart = (item: CatalogItem, overrideStylistId?: string) => {
    const defaultStylist =
      overrideStylistId || data?.stylists[0]?.id || '';
    setCart((prev) => {
      const existing = prev.find(
        (l) =>
          l.catalog_item_id === item.id &&
          l.stylist_id === defaultStylist
      );
      if (existing) {
        return prev.map((l) =>
          l.uid === existing.uid ? { ...l, quantity: l.quantity + 1 } : l
        );
      }
      return [
        ...prev,
        {
          uid: `${item.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          catalog_item_id: item.id,
          name: item.name,
          kind: item.kind,
          unit_price_ksh: item.price_ksh,
          quantity: 1,
          stylist_id: defaultStylist,
        },
      ];
    });
  };

  const handleSendToPos = (appointment: Appointment) => {
    const serviceItem = data?.catalog.find((c) => c.id === appointment.service_id);
    setPosClientId(appointment.client_id);
    setLinkedAppointmentId(appointment.id);
    setCart([
      {
        uid: `${appointment.service_id}-${Date.now()}`,
        catalog_item_id: appointment.service_id,
        name: appointment.service_name,
        kind: 'service',
        unit_price_ksh: serviceItem?.price_ksh ?? appointment.service_price_ksh,
        quantity: 1,
        stylist_id: appointment.stylist_id,
      },
    ]);
    setActiveTab('pos');
    showToast(`Loaded ${appointment.client_name}'s appointment into POS`);
  };

  const handleOpenPosForClient = (clientId: string) => {
    setPosClientId(clientId);
    setLinkedAppointmentId('');
    setActiveTab('pos');
  };

  const handleCreateAppointment = async (payload: {
    client_id: string;
    stylist_id: string;
    service_id: string;
    date: string;
    start_time: string;
    notes: string;
  }) => {
    await salonApi.createAppointment(payload);
    await refreshData(businessDate);
    showToast('Appointment booked');
  };

  const handleUpdateAppointment = async (
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
  ) => {
    await salonApi.updateAppointment(id, payload);
    await refreshData(businessDate);
    showToast('Schedule updated');
  };

  const handleCreateClient = async (payload: {
    name: string;
    phone: string;
    email?: string;
    preferred_stylist_id?: string;
    formula_notes?: string;
  }) => {
    await salonApi.createClient(payload);
    await refreshData(businessDate);
    showToast('Client profile created');
  };

  const handleUpdateClient = async (
    id: string,
    payload: Partial<{
      name: string;
      phone: string;
      email: string;
      preferred_stylist_id: string;
      formula_notes: string;
    }>
  ) => {
    await salonApi.updateClient(id, payload);
    await refreshData(businessDate);
    showToast('Client profile updated');
  };

  const handleCreateCatalogItem = async (payload: {
    kind: 'service' | 'product';
    category: string;
    name: string;
    description: string;
    price_ksh: number;
    duration_min: number;
    stock_qty: number;
  }) => {
    await salonApi.createCatalogItem(payload);
    await refreshData(businessDate);
    showToast('Catalog updated');
  };

  const handleAdjustStock = async (id: string, stockDelta: number) => {
    await salonApi.updateCatalogItem(id, { stock_delta: stockDelta });
    await refreshData(businessDate);
    showToast('Stock adjusted');
  };

  const handleCheckout = async (payload: {
    client_id: string;
    client_name: string;
    appointment_id?: string;
    payment_method: PaymentMethod;
    discount_type: 'none' | 'percent' | 'fixed';
    discount_value: number;
    tendered_ksh: number;
    business_date: string;
    items: Array<{ catalog_item_id: string; quantity: number; stylist_id: string }>;
  }): Promise<Ticket> => {
    const res = await salonApi.checkoutTicket(payload);
    setCart([]);
    setLinkedAppointmentId('');
    setPosClientId('');
    await refreshData(businessDate);
    showToast(`Settled ${res.ticket.ticket_number} (${formatKsh(res.ticket.total_ksh)})`);
    return res.ticket;
  };

  const handleVoidTicket = async (ticketId: string) => {
    await salonApi.voidTicket(ticketId);
    await refreshData(businessDate);
    showToast('Ticket voided and stock restored');
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen flex bg-[#F9FAFB]">
        <div className="hidden md:block w-[248px] bg-[#1E152A] shrink-0" />
        <main className="flex-1 p-6 md:p-10 space-y-6">
          <div className="h-9 w-56 rounded-lg bg-[#E5E7EB] animate-pulse" />
          <div className="h-[520px] rounded-2xl bg-white border border-[#E5E7EB] animate-pulse" />
        </main>
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB] p-6">
        <div className="salon-card rounded-2xl max-w-md w-full p-6 text-center space-y-4">
          <h1 className="font-serif-editorial text-2xl font-semibold text-[#151C27]">
            Salon Pro Unavailable
          </h1>
          <p className="text-sm text-[#6B7280]">{loadError}</p>
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              void refreshData(businessDate);
            }}
            className="h-11 px-5 rounded-lg bg-[#6D28D9] text-white text-sm font-semibold"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen flex bg-[#F9FAFB] text-[#151C27]">
      <SidebarRail
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        collapsed={railCollapsed}
        onToggleCollapse={() => setRailCollapsed((c) => !c)}
        todayRevenueKsh={data.analytics.gross_revenue_ksh}
        cartCount={cart.reduce((sum, line) => sum + line.quantity, 0)}
        lowStockCount={data.analytics.low_stock_count}
      />

      <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 md:pb-8">
        <div className="max-w-[1440px] mx-auto">
          {activeTab === 'schedule' && (
            <ScheduleView
              date={businessDate}
              onChangeDate={setBusinessDate}
              stylists={data.stylists}
              appointments={data.appointments}
              clients={data.clients}
              catalog={data.catalog}
              onCreateAppointment={handleCreateAppointment}
              onUpdateAppointment={handleUpdateAppointment}
              onSendToPos={handleSendToPos}
            />
          )}

          {activeTab === 'pos' && (
            <PosView
              catalog={data.catalog}
              clients={data.clients}
              stylists={data.stylists}
              cart={cart}
              selectedClientId={posClientId}
              linkedAppointmentId={linkedAppointmentId}
              businessDate={businessDate}
              onSelectClient={setPosClientId}
              onAddToCart={(item) => handleAddToCart(item)}
              onUpdateLineQty={(uid, delta) => {
                setCart((prev) =>
                  prev
                    .map((l) =>
                      l.uid === uid ? { ...l, quantity: l.quantity + delta } : l
                    )
                    .filter((l) => l.quantity > 0)
                );
              }}
              onUpdateLineStylist={(uid, stylistId) => {
                setCart((prev) =>
                  prev.map((l) => (l.uid === uid ? { ...l, stylist_id: stylistId } : l))
                );
              }}
              onRemoveLine={(uid) => {
                setCart((prev) => prev.filter((l) => l.uid !== uid));
              }}
              onClearCart={() => {
                setCart([]);
                setLinkedAppointmentId('');
              }}
              onCheckout={handleCheckout}
            />
          )}

          {activeTab === 'clients' && (
            <ClientsView
              clients={data.clients}
              stylists={data.stylists}
              onCreateClient={handleCreateClient}
              onUpdateClient={handleUpdateClient}
              onOpenPosForClient={handleOpenPosForClient}
            />
          )}

          {activeTab === 'catalog' && (
            <CatalogView
              catalog={data.catalog}
              onCreateItem={handleCreateCatalogItem}
              onAdjustStock={handleAdjustStock}
            />
          )}

          {activeTab === 'ledger' && (
            <LedgerView
              date={businessDate}
              analytics={data.analytics}
              tickets={data.tickets}
              onVoidTicket={handleVoidTicket}
            />
          )}
        </div>
      </main>

      {toast && (
        <div
          role="status"
          className="no-print fixed bottom-20 md:bottom-6 right-6 z-50 rounded-xl bg-[#1E152A] text-white px-4 py-3 text-xs font-semibold shadow-lg border border-white/10"
        >
          {toast}
        </div>
      )}
    </div>
  );
}
