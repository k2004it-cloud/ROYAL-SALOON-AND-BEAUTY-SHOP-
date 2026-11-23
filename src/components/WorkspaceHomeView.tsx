import { ArrowRight, Bell, CalendarDays, ChartNoAxesColumnIncreasing, Check, CircleDollarSign, Clock3, CreditCard, PackageSearch, Send, Sparkles, Star, UsersRound, Zap } from 'lucide-react';
import type { Appointment, CatalogItem, EmployeeDashboard, StaffUser, Stylist, WorkspaceTab } from '../types';
import { formatKsh } from '../api/client';
import { StatusBadge } from './StatusBadge';
import { StylistAvatar } from './StylistAvatar';

interface WorkspaceHomeViewProps {
  user: StaffUser;
  date: string;
  appointments: Appointment[];
  stylists: Stylist[];
  catalog: CatalogItem[];
  dashboard?: EmployeeDashboard;
  onNavigate: (tab: WorkspaceTab) => void;
}

function readableDate(isoDate: string): string {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-KE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export function WorkspaceHomeView({ user, date, appointments, stylists, catalog, dashboard, onNavigate }: WorkspaceHomeViewProps) {
  const stylist = stylists.find((item) => item.id === user.stylist_id);
  const appointmentCount = appointments.filter((item) => !['Cancelled', 'No-Show'].includes(item.status)).length;
  const completedCount = appointments.filter((item) => item.status === 'Completed').length;
  const performance = Math.max(0, Math.min(100, dashboard?.performance_percent ?? 0));
  const lowStockItems = dashboard?.low_stock_items ?? [];
  const appointmentRows = appointments.filter((item) => !['Cancelled', 'No-Show'].includes(item.status))
    .sort((a, b) => a.start_time.localeCompare(b.start_time)).slice(0, 4);
  const metrics = [
    { label: 'My Appointments', value: appointmentCount + ' Today', detail: completedCount + ' completed', Icon: CalendarDays, color: 'from-[#0874F9] to-[#0757D8]' },
    { label: 'Clients Served', value: (dashboard?.clients_served_week ?? 0) + ' This Week', detail: 'Completed visits', Icon: UsersRound, color: 'from-[#7651E8] to-[#5636C9]' },
    { label: 'Sales Today', value: formatKsh(dashboard?.today_sales_ksh ?? 0), detail: 'My recorded sales', Icon: CircleDollarSign, color: 'from-[#0BB981] to-[#008B62]' },
    { label: 'My Performance', value: performance + '%', detail: completedCount + ' of ' + appointmentCount + ' completed', Icon: Star, color: 'from-[#FFAB08] to-[#F47B0A]' },
  ];
  const actions: Array<{ label: string; tab: WorkspaceTab; Icon: typeof CalendarDays }> = [
    { label: 'View My Appointments', tab: 'my-appointments', Icon: CalendarDays },
    { label: 'Update Service Status', tab: 'my-appointments', Icon: Check },
    { label: 'Record Sales', tab: 'pos', Icon: CreditCard },
    { label: 'Check Stock', tab: 'inventory', Icon: PackageSearch },
    { label: 'View Clients', tab: 'clients', Icon: UsersRound },
    { label: 'Generate Report', tab: 'reports', Icon: ChartNoAxesColumnIncreasing },
    { label: 'Send Notification', tab: 'notifications', Icon: Send },
    { label: 'View Schedule', tab: 'schedule', Icon: Clock3 },
  ];
  const notifications = [
    ...lowStockItems.slice(0, 2).map((item) => ({
      key: 'stock-' + item.id, title: 'Low Stock Alert', detail: item.name + ' is running low (' + item.stock_qty + ' left).',
      Icon: PackageSearch, color: 'text-amber-700 bg-amber-100', tab: 'inventory' as WorkspaceTab,
    })),
    ...appointmentRows.slice(0, 2).map((item) => ({
      key: 'appointment-' + item.id, title: 'Appointment Update', detail: item.client_name + ' · ' + item.service_name + ' at ' + item.start_time + '.',
      Icon: Bell, color: 'text-blue-700 bg-blue-100', tab: 'my-appointments' as WorkspaceTab,
    })),
    ...(dashboard?.today_sales_ksh ? [{
      key: 'sales-today', title: 'Sales Recorded', detail: formatKsh(dashboard.today_sales_ksh) + ' attributed to your services today.',
      Icon: CircleDollarSign, color: 'text-emerald-700 bg-emerald-100', tab: 'reports' as WorkspaceTab,
    }] : []),
  ].slice(0, 3);

  return (
    <div className="space-y-4 sm:space-y-5">
      <section className="relative isolate overflow-hidden rounded-2xl border border-[#0B3B7A] bg-gradient-to-r from-[#071B53] via-[#0757D8] to-[#1479FF] px-5 py-6 text-white shadow-xl sm:px-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-4 -top-12 text-white/10"><Sparkles className="h-56 w-56" strokeWidth={0.8} /></div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-5">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">Employee workspace</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight sm:text-3xl">Welcome back, {user.name}!</h1>
            <p className="mt-2 text-sm text-[#E6F0FF]">Here’s what’s happening at the salon today.</p>
          </div>
          <div className="space-y-2 text-sm font-semibold text-white/95">
            <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />{readableDate(date)}</p>
            <p className="flex items-center gap-2"><Clock3 className="h-4 w-4" />{new Date().toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        </div>
      </section>

      <section aria-label="My work summary" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {metrics.map(({ label, value, detail, Icon, color }) => (
          <article key={label} className={'relative min-h-28 overflow-hidden rounded-xl bg-gradient-to-br ' + color + ' p-4 text-white shadow-lg'}>
            <div className="flex h-full items-center gap-3"><Icon className="h-9 w-9 shrink-0 text-white/95" /><div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wide text-white/85">{label}</p><p className="mt-1 truncate text-lg font-extrabold sm:text-xl">{value}</p>
              <p className="mt-1 truncate text-[10px] font-semibold text-white/85">{detail}</p>
            </div></div>
          </article>
        ))}
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]">
        <article className="salon-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-[#DDE6F1] px-4 py-3">
            <h2 className="flex items-center gap-2 text-lg font-extrabold text-[#14213D]"><CalendarDays className="h-5 w-5 text-[#0D6EFD]" />Today’s Appointments</h2>
            <button type="button" onClick={() => onNavigate('my-appointments')} className="inline-flex items-center gap-1 text-xs font-bold text-[#0B5ED7]">View All <ArrowRight className="h-4 w-4" /></button>
          </div>
          <div className="hidden grid-cols-[0.8fr_1.2fr_1.2fr_0.9fr_auto] gap-2 bg-[#F1F4FF] px-4 py-2 text-[10px] font-bold uppercase text-[#475467] sm:grid"><span>Time</span><span>Client</span><span>Service</span><span>Status</span><span>Action</span></div>
          {appointmentRows.length ? appointmentRows.map((appointment) => (
            <div key={appointment.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-[#E7ECF5] px-4 py-3 last:border-b-0 sm:grid-cols-[0.8fr_1.2fr_1.2fr_0.9fr_auto]">
              <span className="text-xs font-bold text-[#14213D]">{appointment.start_time}</span><span className="min-w-0 truncate text-xs font-semibold text-[#14213D]">{appointment.client_name}</span>
              <span className="hidden min-w-0 truncate text-xs text-[#344054] sm:block">{appointment.service_name}</span><span className="hidden sm:block"><StatusBadge status={appointment.status} /></span>
              <button type="button" onClick={() => onNavigate('my-appointments')} className="rounded-md bg-[#0D6EFD] px-3 py-1.5 text-[10px] font-bold text-white">View</button>
              <span className="col-span-2 text-[10px] text-[#667085] sm:hidden">{appointment.service_name} · <StatusBadge status={appointment.status} /></span>
            </div>
          )) : <div className="px-5 py-8 text-center"><p className="text-sm font-semibold text-[#14213D]">No appointments assigned today</p><p className="mt-1 text-xs text-[#64748B]">Your schedule will appear here when a booking is assigned to you.</p></div>}
        </article>

        <article className="salon-card rounded-2xl p-4">
          <div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-extrabold text-[#14213D]">My Profile</h2><button type="button" onClick={() => onNavigate('profile')} className="inline-flex items-center gap-1 text-xs font-bold text-[#0B5ED7]">Edit Profile <ArrowRight className="h-4 w-4" /></button></div>
          <div className="flex flex-wrap items-center gap-4">
            <StylistAvatar src={stylist?.avatar_url} name={user.name} size="lg" />
            <div className="min-w-0 flex-1"><h3 className="text-lg font-extrabold text-[#14213D]">{user.name}</h3><p className="text-sm font-semibold text-[#475467]">{stylist?.role || 'Stylist'}</p>
              <p className="mt-3 break-all text-xs text-[#14213D]">{user.email}</p><p className="mt-2 flex items-center gap-2 text-xs font-bold text-emerald-700"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />Active</p>
            </div>
          </div>
        </article>
      </section>

      <section className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)_minmax(210px,0.65fr)]">
        <article className="salon-card rounded-2xl p-3 sm:p-4">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-extrabold text-[#14213D]"><Zap className="h-5 w-5 fill-[#0D6EFD] text-[#0D6EFD]" />Quick Actions</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {actions.map(({ label, tab, Icon }) => <button key={label} type="button" onClick={() => onNavigate(tab)} className="flex min-h-[88px] flex-col items-center justify-center gap-2 rounded-xl border border-[#D8E1FA] bg-[#F3F5FF] p-2 text-center text-[11px] font-bold text-[#14213D] transition hover:border-[#0D6EFD] hover:bg-[#E8F1FF]"><Icon className="h-6 w-6 text-[#0D6EFD]" />{label}</button>)}
          </div>
        </article>
        <article className="salon-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#DDE6F1] px-4 py-3"><h2 className="flex items-center gap-2 text-lg font-extrabold text-[#14213D]"><Bell className="h-5 w-5" />Notifications</h2><button type="button" onClick={() => onNavigate('notifications')} className="inline-flex items-center gap-1 text-xs font-bold text-[#0B5ED7]">View All <ArrowRight className="h-4 w-4" /></button></div>
          <div className="divide-y divide-[#E7ECF5]">{notifications.length ? notifications.map(({ key, title, detail, Icon, color, tab }) => <button key={key} type="button" onClick={() => onNavigate(tab)} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-[#F8FAFF]"><span className={'flex h-8 w-8 shrink-0 items-center justify-center rounded-full ' + color}><Icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-xs font-bold text-[#14213D]">{title}</span><span className="mt-1 block text-[11px] leading-4 text-[#475467]">{detail}</span></span></button>) : <p className="px-4 py-8 text-center text-xs text-[#667085]">You’re all caught up.</p>}</div>
        </article>
        <article className="salon-card flex flex-col items-center rounded-2xl p-4 text-center">
          <h2 className="mb-3 flex items-center gap-2 self-start text-lg font-extrabold text-[#14213D]"><ChartNoAxesColumnIncreasing className="h-5 w-5 text-[#0D6EFD]" />Your Performance</h2>
          <div className="flex h-32 w-32 items-center justify-center rounded-full p-2" style={{ background: 'conic-gradient(#10A66A ' + performance + '%, #DCE5F1 0)' }}><div className="flex h-full w-full items-center justify-center rounded-full bg-white text-2xl font-extrabold text-[#14213D]">{performance}%</div></div>
          <p className="mt-3 text-sm font-extrabold text-[#14213D]">{performance >= 90 ? 'Excellent Performance' : performance >= 70 ? 'Good Progress' : 'Keep Building'}</p>
          <p className="mt-1 text-[11px] text-[#64748B]">Based on completed appointments today.</p>
          <button type="button" onClick={() => onNavigate('reports')} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#071B53] px-3 py-2 text-xs font-bold text-white">View Reports <ArrowRight className="h-4 w-4" /></button>
        </article>
      </section>
    </div>
  );
}
