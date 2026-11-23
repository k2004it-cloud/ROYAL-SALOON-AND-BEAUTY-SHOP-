import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Activity, Bell, CalendarDays, CheckCircle2, Clock3, LockKeyhole, PackageSearch, Search, ShoppingBag, UsersRound, WalletCards } from 'lucide-react';
import type { Appointment, AppointmentStatus, CatalogItem, Client, EmployeeDashboard, EmployeeEarningsReport, StaffUser, Stylist, WorkspaceTab } from '../types';
import { formatKsh, salonApi } from '../api/client';
import { StatusBadge } from './StatusBadge';
import { StylistAvatar } from './StylistAvatar';

interface EmployeePagesProps {
  tab: WorkspaceTab;
  appointments: Appointment[];
  clients: Client[];
  catalog: CatalogItem[];
  stylists: Stylist[];
  user: StaffUser;
  dashboard?: EmployeeDashboard;
  date: string;
  onNavigate: (tab: WorkspaceTab) => void;
  onUpdateAppointment: (id: string, payload: Partial<{ status: AppointmentStatus }>) => Promise<void>;
  onOpenPosForClient: (clientId: string) => void;
  onProfileUpdated: (user: StaffUser) => void;
  onAdjustStock: (id: string, delta: number) => Promise<void>;
}

const TITLES: Partial<Record<WorkspaceTab, string>> = {
  earnings: 'My Earnings',
  'my-appointments': 'My Appointments',
  'my-clients': 'My Clients',
  timesheet: 'Timesheet & Attendance',
  tasks: 'Task Assignments',
  notifications: 'Notifications',
  profile: 'My Profile',
  inventory: 'Inventory',
  reports: 'My Reports',
  clients: 'Services & Clients',
};

function EmptyCard({ text }: { text: string }) {
  return <div className="salon-card col-span-full rounded-2xl px-5 py-10 text-center text-sm font-semibold text-[#64748B]">{text}</div>;
}

export function EmployeePages({ tab, appointments, clients, catalog, stylists, user, dashboard, date, onNavigate, onUpdateAppointment, onOpenPosForClient, onProfileUpdated, onAdjustStock }: EmployeePagesProps) {
  const [search, setSearch] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [profileName, setProfileName] = useState(user.name);
  const [profileEmail, setProfileEmail] = useState(user.email);
  const [profilePhone, setProfilePhone] = useState(user.phone ?? '');
  const [profileNotice, setProfileNotice] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const [earningsStart, setEarningsStart] = useState(() => {
    const from = new Date(date + 'T12:00:00');
    from.setDate(from.getDate() - 6);
    return from.toISOString().slice(0, 10);
  });
  const [earningsEnd, setEarningsEnd] = useState(date);
  const [earningsReport, setEarningsReport] = useState<EmployeeEarningsReport | null>(null);
  const [earningsLoading, setEarningsLoading] = useState(false);
  const [earningsError, setEarningsError] = useState('');
  const mine = appointments.slice().sort((a, b) => a.start_time.localeCompare(b.start_time));
  const completed = mine.filter((appointment) => appointment.status === 'Completed');
  const upcoming = mine.filter((appointment) => ['Pending', 'Confirmed', 'In-Service'].includes(appointment.status));
  const stylist = stylists.find((item) => item.id === user.stylist_id);
  const serviceItems = catalog.filter((item) => item.kind === 'service');
  const visibleClients = clients.filter((client) => (client.name + ' ' + client.phone).toLowerCase().includes(search.toLowerCase()));
  const products = catalog.filter((item) => item.kind === 'product').slice().sort((a, b) => a.stock_qty - b.stock_qty);
  const visibleProducts = products.filter((item) => (item.name + ' ' + item.category + ' ' + item.sku).toLowerCase().includes(search.toLowerCase()));
  const reportDays = earningsReport?.daily ?? [];
  const maxRevenue = Math.max(1, ...reportDays.map((point) => point.revenue_ksh));
  const notifications = useMemo(() => [
    ...(dashboard?.low_stock_items ?? []).map((item) => ({ key: 'stock-' + item.id, title: 'Low stock alert', text: item.name + ' has ' + item.stock_qty + ' left.', tab: 'inventory' as WorkspaceTab })),
    ...mine.filter((appointment) => !['Cancelled', 'No-Show'].includes(appointment.status)).map((appointment) => ({
      key: 'appointment-' + appointment.id, title: 'Appointment ' + appointment.status.toLowerCase(),
      text: appointment.start_time + ' · ' + appointment.client_name + ' · ' + appointment.service_name,
      tab: 'my-appointments' as WorkspaceTab,
    })),
  ], [dashboard?.low_stock_items, mine]);

  useEffect(() => {
    setProfileName(user.name);
    setProfileEmail(user.email);
    setProfilePhone(user.phone ?? '');
  }, [user.name, user.email, user.phone]);

  useEffect(() => {
    if (tab !== 'earnings' && tab !== 'reports') return;
    let active = true;
    const loadReport = async () => {
      setEarningsLoading(true);
      setEarningsError('');
      try {
        const report = await salonApi.employeeEarnings(earningsStart, earningsEnd);
        if (active) setEarningsReport(report);
      } catch (error) {
        if (active) setEarningsError(error instanceof Error ? error.message : 'Unable to load your earnings.');
      } finally {
        if (active) setEarningsLoading(false);
      }
    };
    void loadReport();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadReport();
    }, 8000);
    window.addEventListener('focus', loadReport);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', loadReport);
    };
  }, [tab, earningsStart, earningsEnd]);

  const changeStatus = async (appointment: Appointment) => {
    const next: AppointmentStatus | null = ['Pending', 'Confirmed'].includes(appointment.status)
      ? 'In-Service'
      : appointment.status === 'In-Service' ? 'Completed' : null;
    if (!next) return;
    await onUpdateAppointment(appointment.id, { status: next });
  };

  const savePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordNotice('');
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get('current_password') || '');
    const newPassword = String(form.get('new_password') || '');
    const confirmPassword = String(form.get('confirm_password') || '');
    if (newPassword !== confirmPassword) {
      setPasswordError('The new passwords do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await salonApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      setPasswordNotice('Your password was updated.');
      event.currentTarget.reset();
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : 'Unable to update your password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  const saveProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileError('');
    setProfileNotice('');
    setProfileBusy(true);
    try {
      const result = await salonApi.updateProfile({ name: profileName, email: profileEmail, phone: profilePhone });
      onProfileUpdated(result.user);
      setProfileNotice('Your profile details were saved.');
    } catch (error) {
      setProfileError(error instanceof Error ? error.message : 'Unable to save your profile.');
    } finally {
      setProfileBusy(false);
    }
  };

  const dateRangeControls = (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-xs font-semibold text-[#475467]">From<input type="date" value={earningsStart} max={earningsEnd} onChange={(event) => setEarningsStart(event.target.value)} className="salon-input mt-1 block px-3 text-sm" /></label>
      <label className="text-xs font-semibold text-[#475467]">To<input type="date" value={earningsEnd} min={earningsStart} onChange={(event) => setEarningsEnd(event.target.value)} className="salon-input mt-1 block px-3 text-sm" /></label>
      <a href={salonApi.employeeEarningsExportUrl(earningsStart, earningsEnd)} download className="inline-flex h-11 items-center rounded-lg bg-[#0D6EFD] px-4 text-xs font-bold text-white">Export CSV</a>
    </div>
  );

  const title = TITLES[tab];
  if (!title) return null;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#C5D8F4] bg-gradient-to-r from-[#0A1D3A] via-[#0B3B7A] to-[#0B5ED7] px-5 py-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">Employee workspace</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-[#E6F0FF]">{date}</p>
      </section>

      {tab === 'my-appointments' && (
        <section className="salon-card overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE6F1] px-5 py-4">
            <div><h2 className="text-lg font-bold text-[#14213D]">Assigned bookings</h2><p className="mt-1 text-xs text-[#64748B]">Update each service as you work through your day.</p></div>
            <button type="button" onClick={() => onNavigate('schedule')} className="rounded-lg bg-[#0D6EFD] px-3 py-2 text-xs font-bold text-white">Open schedule</button>
          </div>
          {mine.length ? mine.map((appointment) => {
            const next = ['Pending', 'Confirmed'].includes(appointment.status) ? 'Start service' : appointment.status === 'In-Service' ? 'Complete service' : '';
            return <article key={appointment.id} className="flex flex-wrap items-center gap-3 border-b border-[#E7ECF5] px-5 py-4 last:border-0">
              <span className="w-16 rounded-lg bg-[#EAF2FF] px-2 py-2 text-center text-xs font-bold text-[#0B5ED7]">{appointment.start_time}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#14213D]">{appointment.client_name}</p><p className="text-xs text-[#64748B]">{appointment.service_name} · {appointment.duration_min} min</p></div>
              <StatusBadge status={appointment.status} />
              {next && <button type="button" onClick={() => void changeStatus(appointment)} className="rounded-lg border border-[#B7D2FF] bg-[#EFF6FF] px-3 py-2 text-xs font-bold text-[#0757D8]">{next}</button>}
            </article>;
          }) : <EmptyCard text="No appointments assigned for this date." />}
        </section>
      )}

      {(tab === 'clients' || tab === 'my-clients') && (
        <div className="space-y-5">
          <section className="salon-card rounded-2xl p-4">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-[#14213D]"><SparklesIcon />Available Services</h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {serviceItems.map((service) => <article key={service.id} className="rounded-xl border border-[#E1E7F0] bg-white p-4">
                <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-[#14213D]">{service.name}</p><p className="mt-1 text-xs text-[#64748B]">{service.category} · {service.duration_min} min</p></div><span className="text-sm font-extrabold text-[#0B5ED7]">{formatKsh(service.price_ksh)}</span></div>
                {service.description && <p className="mt-2 text-xs text-[#667085]">{service.description}</p>}
              </article>)}
              {!serviceItems.length && <EmptyCard text="No active services are available." />}
            </div>
          </section>
          <section className="salon-card overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE6F1] px-5 py-4">
              <div><h2 className="text-lg font-bold text-[#14213D]">My Clients</h2><p className="mt-1 text-xs text-[#64748B]">Clients with appointments assigned to you.</p></div>
              <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Find a client" className="salon-input pl-9 pr-3 text-sm" /></label>
            </div>
            {visibleClients.length ? <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{visibleClients.map((client) => <article key={client.id} className="rounded-xl border border-[#E1E7F0] bg-white p-4">
              <div className="flex items-start justify-between gap-2"><div><p className="text-sm font-bold text-[#14213D]">{client.name}</p><p className="mt-1 text-xs text-[#64748B]">{client.phone}</p></div><button type="button" onClick={() => onOpenPosForClient(client.id)} className="rounded-lg bg-[#0D6EFD] px-2.5 py-1.5 text-[10px] font-bold text-white">Start sale</button></div>
              {client.formula_notes && <p className="mt-3 rounded-lg bg-[#F3F5FF] p-3 text-xs text-[#475467]"><strong>Formula / notes:</strong> {client.formula_notes}</p>}
            </article>)}</div> : <EmptyCard text={search ? 'No clients match your search.' : 'Clients with appointments assigned to you will appear here.'} />}
          </section>
        </div>
      )}

      {tab === 'inventory' && (
        <section className="salon-card overflow-hidden rounded-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DDE6F1] px-5 py-4"><div><h2 className="text-lg font-bold text-[#14213D]">Product stock</h2><p className="mt-1 text-xs text-[#64748B]">Check quantities and flag items that need attention.</p></div>
            <label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory" className="salon-input pl-9 pr-3 text-sm" /></label>
          </div>
          {visibleProducts.length ? <div className="divide-y divide-[#E7ECF5]">{visibleProducts.map((product) => <article key={product.id} className="flex items-center gap-3 px-5 py-4">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0B5ED7]"><PackageSearch className="h-5 w-5" /></span><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-[#14213D]">{product.name}</p><p className="text-xs text-[#64748B]">{product.category}{product.sku ? ' · ' + product.sku : ''}</p></div>
            <div className="flex shrink-0 items-center gap-2">
              <button type="button" aria-label={'Remove one ' + product.name + ' from stock'} disabled={product.stock_qty <= 0} onClick={() => void onAdjustStock(product.id, -1)} className="h-8 w-8 rounded-lg border border-[#DDE6F1] text-lg font-bold text-[#344054] disabled:opacity-40">−</button>
              <span className={'min-w-24 rounded-full px-3 py-1.5 text-center text-xs font-bold ' + (product.stock_qty <= 5 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>{product.stock_qty} in stock</span>
              <button type="button" aria-label={'Add one ' + product.name + ' to stock'} onClick={() => void onAdjustStock(product.id, 1)} className="h-8 w-8 rounded-lg border border-[#DDE6F1] text-lg font-bold text-[#0757D8]">+</button>
            </div>
          </article>)}</div> : <EmptyCard text="No products match your search." />}
        </section>
      )}

      {tab === 'reports' && (
        <div className="space-y-4">
          <section className="salon-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4"><div><h2 className="text-lg font-bold text-[#14213D]">Choose report dates</h2><p className="mt-1 text-xs text-[#64748B]">Your sales and commissions for completed, paid tickets.</p></div>{dateRangeControls}</section>
          {earningsError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{earningsError}</p>}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Attributed sales', value: formatKsh(earningsReport?.total_sales_ksh ?? 0) },
              { label: 'Commission earned', value: formatKsh(earningsReport?.total_commission_ksh ?? 0) },
              { label: 'Paid tickets', value: String(earningsReport?.ticket_count ?? 0) },
              { label: 'Clients served this week', value: String(dashboard?.clients_served_week ?? 0) },
            ].map((item) => <article key={item.label} className="salon-card rounded-2xl p-5"><p className="text-xs font-bold uppercase tracking-wide text-[#64748B]">{item.label}</p><p className="mt-2 text-2xl font-extrabold text-[#14213D]">{earningsLoading ? '…' : item.value}</p></article>)}
          </section>
          <section className="salon-card rounded-2xl p-5">
            <h2 className="text-lg font-bold text-[#14213D]">Sales by day</h2>
            {reportDays.length ? <div className="mt-5 overflow-x-auto"><div className="grid min-w-full gap-2" style={{ gridTemplateColumns: 'repeat(' + reportDays.length + ', minmax(54px, 1fr))' }}>
              {reportDays.map((point) => <div key={point.date} className="flex min-w-0 flex-col items-center gap-2"><div className="flex h-36 w-full items-end rounded-lg bg-[#F3F5FF] p-1"><div title={formatKsh(point.revenue_ksh)} className="w-full rounded-md bg-gradient-to-t from-[#0757D8] to-[#3B82F6]" style={{ height: Math.max(point.revenue_ksh ? 5 : 0, point.revenue_ksh / maxRevenue * 100) + '%' }} /></div><span className="text-[10px] font-semibold text-[#64748B]">{new Date(point.date + 'T12:00:00').toLocaleDateString('en-KE', { month: 'short', day: 'numeric' })}</span><span className="text-[10px] text-[#344054]">{formatKsh(point.revenue_ksh)}</span><span className="text-[9px] text-emerald-700">Comm. {formatKsh(point.commission_ksh)}</span></div>)}
            </div></div> : <EmptyCard text={earningsLoading ? 'Loading report…' : 'No sales in this date range.'} />}
          </section>
          <section className="salon-card overflow-hidden rounded-2xl"><div className="border-b border-[#E1E7F0] px-5 py-4"><h2 className="text-lg font-bold text-[#14213D]">Sales by service and product</h2></div>
            {earningsReport?.items.length ? <div className="divide-y divide-[#E1E7F0]">{earningsReport.items.map((item) => <div key={item.kind + item.item_name} className="grid grid-cols-2 gap-2 px-5 py-3 text-xs sm:grid-cols-4"><span className="font-semibold text-[#14213D]">{item.item_name}</span><span className="capitalize text-[#64748B]">{item.kind} · {item.quantity} sold</span><span className="text-[#14213D]">{formatKsh(item.sales_ksh)} sales</span><span className="font-semibold text-emerald-700">{formatKsh(item.commission_ksh)} commission</span></div>)}</div> : <EmptyCard text="No item sales in this date range." />}
          </section>
        </div>
      )}

      {tab === 'profile' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <section className="salon-card rounded-2xl p-5">
            <div className="flex items-center gap-4"><StylistAvatar src={stylist?.avatar_url} name={user.name} size="lg" /><div><h2 className="text-xl font-extrabold text-[#14213D]">{user.name}</h2><p className="text-sm text-[#64748B]">{stylist?.role || 'Employee'} · {stylist?.specialty || 'Salon team'}</p></div></div>
            <form onSubmit={(event) => void saveProfile(event)} className="mt-5 space-y-3 border-t border-[#E1E7F0] pt-4">
              <label className="block text-xs font-semibold text-[#344054]">Full name<input value={profileName} onChange={(event) => setProfileName(event.target.value)} maxLength={120} required className="salon-input mt-1 w-full px-3 text-sm" /></label>
              <label className="block text-xs font-semibold text-[#344054]">Work email<input type="email" value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} maxLength={254} required className="salon-input mt-1 w-full px-3 text-sm" /></label>
              <label className="block text-xs font-semibold text-[#344054]">Phone number<input type="tel" value={profilePhone} onChange={(event) => setProfilePhone(event.target.value)} maxLength={40} className="salon-input mt-1 w-full px-3 text-sm" /></label>
              <dl className="grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-[#64748B]">Username</dt><dd className="mt-1 font-semibold text-[#14213D]">{user.username}</dd></div><div><dt className="text-[#64748B]">Commission rate</dt><dd className="mt-1 font-semibold text-[#14213D]">{stylist?.commission_rate ?? 0}%</dd></div></dl>
              {profileError && <p role="alert" className="text-xs font-semibold text-red-700">{profileError}</p>}
              {profileNotice && <p role="status" className="text-xs font-semibold text-emerald-700">{profileNotice}</p>}
              <button disabled={profileBusy} className="rounded-lg bg-[#0D6EFD] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{profileBusy ? 'Saving…' : 'Save profile'}</button>
            </form>
          </section>
          <section className="salon-card rounded-2xl p-5"><h2 className="flex items-center gap-2 text-lg font-bold text-[#14213D]"><LockKeyhole className="h-5 w-5 text-[#0D6EFD]" />Change password</h2>
            <form onSubmit={(event) => void savePassword(event)} className="mt-4 space-y-3">
              <label className="block text-xs font-semibold text-[#344054]">Current password<input name="current_password" type="password" autoComplete="current-password" required className="salon-input mt-1 w-full px-3 text-sm" /></label>
              <label className="block text-xs font-semibold text-[#344054]">New password<input name="new_password" type="password" autoComplete="new-password" minLength={10} required className="salon-input mt-1 w-full px-3 text-sm" /></label>
              <label className="block text-xs font-semibold text-[#344054]">Confirm new password<input name="confirm_password" type="password" autoComplete="new-password" minLength={10} required className="salon-input mt-1 w-full px-3 text-sm" /></label>
              {passwordError && <p role="alert" className="text-xs font-semibold text-red-700">{passwordError}</p>}{passwordNotice && <p role="status" className="text-xs font-semibold text-emerald-700">{passwordNotice}</p>}
              <button disabled={passwordBusy} className="rounded-lg bg-[#0D6EFD] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{passwordBusy ? 'Saving…' : 'Update password'}</button>
            </form>
          </section>
        </div>
      )}

      {tab === 'earnings' && (
        <div className="space-y-4">
          <section className="salon-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4"><div><h2 className="text-lg font-bold text-[#14213D]">Choose date range</h2><p className="mt-1 text-xs text-[#64748B]">Only sales attributed to your stylist profile are included.</p></div>{dateRangeControls}</section>
          {earningsError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{earningsError}</p>}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: 'Sales attributed to me', value: formatKsh(earningsReport?.total_sales_ksh ?? 0), Icon: ShoppingBag },
              { label: 'Commission earned', value: formatKsh(earningsReport?.total_commission_ksh ?? 0), Icon: WalletCards },
              { label: 'Paid tickets', value: String(earningsReport?.ticket_count ?? 0), Icon: CheckCircle2 },
              { label: 'Appointments completed', value: String(completed.length), Icon: CalendarDays },
            ].map(({ label, value, Icon }) => <article key={label} className="salon-card rounded-2xl p-5"><Icon className="h-5 w-5 text-[#0D6EFD]" /><p className="mt-3 text-xs font-bold uppercase text-[#64748B]">{label}</p><p className="mt-2 text-2xl font-extrabold text-[#14213D]">{earningsLoading ? '…' : value}</p></article>)}
          </section>
          <section className="salon-card overflow-hidden rounded-2xl"><div className="border-b border-[#E1E7F0] px-5 py-4"><h2 className="text-lg font-bold text-[#14213D]">Earnings details</h2></div>
            {earningsReport?.tickets.length ? <div className="divide-y divide-[#E1E7F0]">{earningsReport.tickets.map((ticket) => <article key={ticket.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_1.2fr_1fr_1fr] sm:items-center"><div><p className="text-sm font-bold text-[#14213D]">{ticket.ticket_number}</p><p className="text-xs text-[#64748B]">{ticket.business_date}</p></div><p className="text-xs text-[#475467]">{ticket.client_name} · {ticket.payment_method}</p><p className="text-xs font-semibold text-[#14213D]">{formatKsh(ticket.attributed_sales_ksh)} sales</p><p className="text-xs font-bold text-emerald-700">{formatKsh(ticket.commission_ksh)} commission</p></article>)}</div> : <EmptyCard text={earningsLoading ? 'Loading earnings…' : 'No paid tickets attributed to you in this date range.'} />}
          </section>
          <button type="button" onClick={() => onNavigate('reports')} className="rounded-lg border border-[#DDE6F1] bg-white px-4 py-2.5 text-sm font-bold text-[#0757D8]">Open detailed report</button>
        </div>
      )}

      {(tab === 'timesheet' || tab === 'tasks') && <section className="salon-card rounded-2xl p-5"><div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0B5ED7]"><Clock3 className="h-5 w-5" /></span><div><h2 className="text-sm font-bold text-[#14213D]">{tab === 'tasks' ? 'Today’s assignment queue' : 'Today’s attendance summary'}</h2><p className="mt-1 text-xs text-[#64748B]">{mine.length} assigned · {completed.length} completed · {upcoming.length} in progress or upcoming</p></div></div>
        {upcoming.length > 0 && <div className="mt-4 divide-y divide-[#E1E7F0]">{upcoming.map((appointment) => <div key={appointment.id} className="flex items-center gap-3 py-3"><span className="text-xs font-bold text-[#0B5ED7]">{appointment.start_time}</span><span className="min-w-0 flex-1 truncate text-xs font-semibold text-[#14213D]">{appointment.service_name} · {appointment.client_name}</span><StatusBadge status={appointment.status} /></div>)}</div>}
      </section>}

      {tab === 'notifications' && <section className="salon-card overflow-hidden rounded-2xl"><div className="border-b border-[#E1E7F0] px-5 py-4"><h2 className="text-lg font-bold text-[#14213D]">Updates for your workday</h2></div>{notifications.length ? notifications.map((notification) => <button key={notification.key} type="button" onClick={() => onNavigate(notification.tab)} className="flex w-full items-center gap-3 border-b border-[#E1E7F0] px-5 py-4 text-left last:border-0 hover:bg-[#F8FAFF]"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0D6EFD]"><Bell className="h-4 w-4" /></span><span><strong className="block text-sm text-[#14213D]">{notification.title}</strong><span className="text-xs text-[#64748B]">{notification.text}</span></span></button>) : <EmptyCard text="You’re all caught up." />}</section>}
    </div>
  );
}

function SparklesIcon() {
  return <PackageSearch className="h-5 w-5 text-[#0D6EFD]" />;
}
