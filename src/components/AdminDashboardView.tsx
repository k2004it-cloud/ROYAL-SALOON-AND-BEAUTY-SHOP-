import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  CircleHelp,
  CreditCard,
  Database,
  Package,
  PackageSearch,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Users,
  UsersRound,
} from 'lucide-react';
import type {
  Appointment,
  BootstrapPayload,
  DailyRevenuePoint,
  StaffUser,
  Ticket,
  WorkspaceTab,
} from '../types';
import { formatKsh, salonApi } from '../api/client';
import { StylistAvatar } from './StylistAvatar';

interface AdminDashboardViewProps {
  userName: string;
  date: string;
  data: BootstrapPayload;
  onNavigate: (tab: WorkspaceTab) => void;
}

const ACTIVITY_COLORS = {
  blue: 'bg-[#0D6EFD] text-white',
  purple: 'bg-[#8054E8] text-white',
  cyan: 'bg-[#0DAFC2] text-white',
  green: 'bg-[#0DAF70] text-white',
  orange: 'bg-[#F59E0B] text-white',
};

function isSameDay(timestamp: string, date: string): boolean {
  return timestamp.slice(0, 10) === date;
}

function formatTime(timestamp: string): string {
  const parsed = new Date(timestamp);
  return Number.isNaN(parsed.getTime())
    ? 'Today'
    : parsed.toLocaleTimeString('en-KE', { hour: 'numeric', minute: '2-digit' });
}

function formatShortDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-KE', {
    month: 'short',
    day: 'numeric',
  });
}

function RevenueChart({ date, points, loading, error }: {
  date: string;
  points: DailyRevenuePoint[];
  loading: boolean;
  error: string;
}) {
  const chart = useMemo(() => {
    const width = 720;
    const left = 48;
    const right = 704;
    const top = 18;
    const bottom = 176;
    const max = Math.max(1, ...points.map((point) => point.revenue_ksh));
    const coords = points.map((point, index) => ({
      ...point,
      x: points.length > 1 ? left + (index * (right - left)) / (points.length - 1) : (left + right) / 2,
      y: bottom - (point.revenue_ksh / max) * (bottom - top),
    }));
    const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
    const area = coords.length ? `${line} L ${right} ${bottom} L ${left} ${bottom} Z` : '';
    const labels = coords.length > 1
      ? [coords[0], coords[Math.floor((coords.length - 1) / 2)], coords[coords.length - 1]]
      : coords;
    return { coords, line, area, labels, max };
  }, [points]);

  return (
    <section className="salon-card rounded-2xl p-3 sm:p-4 lg:col-span-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-[#12396D]" />
          <h2 className="font-sans text-sm font-bold text-[#14213D]">Sales overview</h2>
        </div>
        <span className="rounded-full border border-[#E1E7F0] bg-white px-3 py-1 text-[10px] font-semibold text-[#475467]">
          Last 30 days
        </span>
      </div>
      {error ? (
        <div role="alert" className="flex h-40 items-center justify-center rounded-xl bg-[#F4F7FC] px-4 text-center text-xs font-medium text-[#667085]">
          Sales trend could not be loaded: {error}
        </div>
      ) : loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-[#F1F4F9]" />
      ) : (
        <>
          <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-[#667085]">
            <span>{formatKsh(chart.max)}</span>
            <span>Paid ticket revenue</span>
          </div>
          <svg
            aria-label={`Sales trend ending ${date}`}
            className="h-36 w-full overflow-visible"
            role="img"
            viewBox="0 0 720 212"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="sales-area-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#0D6EFD" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#0D6EFD" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {[0, 1, 2, 3].map((line) => {
              const y = 18 + line * 52;
              const value = chart.max * (1 - line / 3);
              const label = value >= 1000 ? `${Math.round(value / 1000)}k` : String(Math.round(value));
              return (
                <g key={line}>
                  <line x1="48" x2="704" y1={y} y2={y} stroke="#E8EDF5" strokeWidth="1" />
                  <text x="40" y={y + 3} fill="#667085" fontSize="9" textAnchor="end">{label}</text>
                </g>
              );
            })}
            <path d={chart.area} fill="url(#sales-area-fill)" />
            <path d={chart.line} fill="none" stroke="#0874F9" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
            {chart.coords.filter((_, index) => index % 7 === 0 || index === chart.coords.length - 1).map((point) => (
              <circle key={point.date} cx={point.x} cy={point.y} r="4" fill="#0874F9" stroke="white" strokeWidth="2" />
            ))}
            {chart.labels.map((point) => (
              <text key={point.date} x={point.x} y="202" fill="#667085" fontSize="11" textAnchor="middle">
                {formatShortDate(point.date)}
              </text>
            ))}
          </svg>
          <div className="mt-1 flex justify-between text-[10px] text-[#667085]">
            <span>Daily revenue from paid tickets</span>
            <span>{formatKsh(points.reduce((sum, point) => sum + point.revenue_ksh, 0))} total</span>
          </div>
        </>
      )}
    </section>
  );
}

function AppointmentStatusPanel({ appointments }: { appointments: Appointment[] }) {
  const categories = [
    { name: 'Confirmed', color: '#0874F9' },
    { name: 'Pending', color: '#F59E0B' },
    { name: 'In-Service', color: '#8054E8' },
    { name: 'Completed', color: '#0DAF70' },
    { name: 'Cancelled', color: '#0DAFC2' },
    { name: 'No-Show', color: '#EF4444' },
  ];
  const total = appointments.length;
  const circumference = 2 * Math.PI * 44;
  let offset = 0;

  return (
    <section className="salon-card rounded-2xl p-3 sm:p-4 lg:col-span-3">
      <h2 className="font-sans text-sm font-bold text-[#14213D]">Appointment status</h2>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <svg aria-label={`${total} appointments today`} className="h-24 w-24 shrink-0" viewBox="0 0 120 120" role="img">
          <circle cx="60" cy="60" r="44" fill="none" stroke="#E8EDF5" strokeWidth="13" />
          {total > 0 && categories.map(({ name, color }) => {
            const count = appointments.filter((appointment) => appointment.status === name).length;
            const length = (count / total) * circumference;
            const currentOffset = offset;
            offset += length;
            return count > 0 ? (
              <circle
                key={name}
                cx="60"
                cy="60"
                r="44"
                fill="none"
                stroke={color}
                strokeDasharray={`${length} ${circumference - length}`}
                strokeDashoffset={-currentOffset}
                strokeWidth="13"
                transform="rotate(-90 60 60)"
              />
            ) : null;
          })}
          <text x="60" y="58" fill="#14213D" fontSize="21" fontWeight="700" textAnchor="middle">{total}</text>
          <text x="60" y="73" fill="#667085" fontSize="9" textAnchor="middle">Today</text>
        </svg>
        <div className="grid min-w-[116px] grid-cols-2 gap-x-3 gap-y-2 text-[10px] sm:grid-cols-1">
          {categories.map(({ name, color }) => {
            const count = appointments.filter((appointment) => appointment.status === name).length;
            return (
              <div key={name} className="flex items-center gap-1.5">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-[#475467]">{name}</span>
                <span className="ml-auto font-bold text-[#14213D]">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function RecentActivityPanel({ date, appointments, clients, tickets, employees, onViewAll }: {
  date: string;
  appointments: Appointment[];
  clients: BootstrapPayload['clients'];
  tickets: Ticket[];
  employees: StaffUser[];
  onViewAll: () => void;
}) {
  const activities = [
    ...appointments
      .filter((appointment) => isSameDay(appointment.created_at, date))
      .map((appointment) => ({
        id: `appointment-${appointment.id}`,
        title: 'New appointment',
        detail: `${appointment.client_name} · ${appointment.service_name}`,
        createdAt: appointment.created_at,
        Icon: CalendarDays,
        color: ACTIVITY_COLORS.blue,
      })),
    ...tickets
      .filter((ticket) => ticket.status === 'Paid' && isSameDay(ticket.created_at, date))
      .map((ticket) => ({
        id: `ticket-${ticket.id}`,
        title: 'Payment received',
        detail: `${ticket.client_name} · ${formatKsh(ticket.total_ksh)}`,
        createdAt: ticket.created_at,
        Icon: CreditCard,
        color: ACTIVITY_COLORS.purple,
      })),
    ...clients
      .filter((client) => isSameDay(client.created_at, date))
      .map((client) => ({
        id: `client-${client.id}`,
        title: 'New client profile',
        detail: client.name,
        createdAt: client.created_at,
        Icon: Users,
        color: ACTIVITY_COLORS.cyan,
      })),
    ...employees
      .filter((employee) => employee.created_at && isSameDay(employee.created_at, date))
      .map((employee) => ({
        id: `employee-${employee.id}`,
        title: 'Employee account added',
        detail: employee.name,
        createdAt: employee.created_at || date,
        Icon: UsersRound,
        color: ACTIVITY_COLORS.green,
      })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  return (
    <section className="salon-card overflow-hidden rounded-2xl lg:col-span-3">
      <div className="flex items-center justify-between gap-2 border-b border-[#E1E7F0] px-3 py-3">
        <h2 className="font-sans text-sm font-bold text-[#14213D]">Recent activity</h2>
        <button type="button" onClick={onViewAll} className="text-[10px] font-bold text-[#0B5ED7] hover:underline">
          View all
        </button>
      </div>
      {activities.length ? (
        <div className="divide-y divide-[#EEF1F6] px-4">
          {activities.map(({ id, title, detail, createdAt, Icon, color }) => (
            <article key={id} className="flex items-center gap-2.5 py-2">
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${color}`}>
                <Icon className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-semibold text-[#14213D]">{title}</p>
                <p className="truncate text-[10px] text-[#667085]">{detail}</p>
              </div>
              <span className="shrink-0 text-[9px] text-[#667085]">{formatTime(createdAt)}</span>
            </article>
          ))}
        </div>
      ) : (
        <div className="px-3 py-5 text-center">
          <Activity className="mx-auto h-6 w-6 text-[#98A2B3]" />
          <p className="mt-2 text-xs font-semibold text-[#344054]">No activity recorded today</p>
          <p className="mt-1 text-[10px] text-[#667085]">New bookings and payments will appear here.</p>
        </div>
      )}
    </section>
  );
}

function QuickActions({ onNavigate }: { onNavigate: (tab: WorkspaceTab) => void }) {
  const actions: Array<{ label: string; tab: WorkspaceTab; Icon: typeof CalendarPlus }> = [
    { label: 'Book appointment', tab: 'schedule', Icon: CalendarPlus },
    { label: 'Manage clients', tab: 'clients', Icon: Users },
    { label: 'Manage services', tab: 'catalog', Icon: PackageSearch },
    { label: 'Manage stock', tab: 'inventory', Icon: Package },
    { label: 'View reports', tab: 'reports', Icon: BarChart3 },
    { label: 'System settings', tab: 'settings', Icon: Settings },
    { label: 'View logs', tab: 'system-logs', Icon: Activity },
    { label: 'Backup data', tab: 'backups', Icon: Database },
  ];
  return (
    <section className="salon-card rounded-2xl p-3 sm:p-4 lg:col-span-5">
      <h2 className="font-sans text-sm font-bold text-[#14213D]">Quick actions</h2>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {actions.map(({ label, tab, Icon }) => (
          <button
            key={tab}
            type="button"
            onClick={() => onNavigate(tab)}
            className="flex min-h-[60px] flex-col items-center justify-center gap-1.5 rounded-xl border border-[#DFE7F1] bg-gradient-to-b from-white to-[#F3F7FF] px-2 py-2 text-center text-[10px] font-semibold leading-tight text-[#14213D] transition hover:border-[#9FC4FF] hover:bg-[#EAF2FF]"
          >
            <Icon className="h-5 w-5 text-[#0D6EFD]" />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

function EmployeeOverview({ employees, stylists, loading, error, onViewAll }: {
  employees: StaffUser[];
  stylists: BootstrapPayload['stylists'];
  loading: boolean;
  error: string;
  onViewAll: () => void;
}) {
  const activeEmployees = employees.filter((employee) => employee.active);
  return (
    <section className="salon-card overflow-hidden rounded-2xl lg:col-span-4">
      <div className="flex items-center justify-between border-b border-[#E1E7F0] px-3 py-3">
        <h2 className="font-sans text-sm font-bold text-[#14213D]">Employee overview</h2>
        <button type="button" onClick={onViewAll} className="text-[10px] font-bold text-[#0B5ED7] hover:underline">View all</button>
      </div>
      {error ? (
        <p role="alert" className="px-4 py-8 text-center text-xs text-[#B91C1C]">{error}</p>
      ) : loading ? (
        <div className="space-y-3 p-4">
          {[0, 1, 2].map((item) => <div key={item} className="h-9 animate-pulse rounded-lg bg-[#F1F4F9]" />)}
        </div>
      ) : activeEmployees.length ? (
        <>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 bg-[#F4F7FC] px-4 py-2 text-[9px] font-bold text-[#667085]">
            <span>Name</span><span>Role</span><span>Status</span>
          </div>
          <div className="divide-y divide-[#EEF1F6] px-4">
          {activeEmployees.slice(0, 4).map((employee) => {
            const stylist = stylists.find((item) => item.id === employee.stylist_id);
            return (
              <div key={employee.id} className="flex items-center gap-2.5 py-2">
                <StylistAvatar src={stylist?.avatar_url} name={employee.name} size="sm" />
                <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#14213D]">{employee.name}</span>
                <span className="hidden text-[10px] text-[#667085] sm:block">{stylist?.role || 'Employee'}</span>
                <span className="rounded-full bg-[#DCFCE7] px-2 py-1 text-[9px] font-bold text-[#15803D]">Active</span>
              </div>
            );
          })}
          </div>
        </>
      ) : (
        <p className="px-4 py-8 text-center text-xs text-[#667085]">No active employee accounts.</p>
      )}
    </section>
  );
}

function SystemHealth({ lowStockCount, onSupport, onBackups }: {
  lowStockCount: number;
  onSupport: () => void;
  onBackups: () => void;
}) {
  const rows = [
    { label: 'Salon data service', value: 'Connected', Icon: CheckCircle2, color: 'text-[#16A34A]' },
    { label: 'Inventory records', value: lowStockCount ? `${lowStockCount} low stock` : 'Up to date', Icon: PackageSearch, color: lowStockCount ? 'text-[#D97706]' : 'text-[#16A34A]' },
    { label: 'Database backups', value: 'Not configured', Icon: Database, color: 'text-[#D97706]' },
  ];
  return (
    <section className="salon-card rounded-2xl p-3 sm:p-4 lg:col-span-3">
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-[#12396D]" />
        <h2 className="font-sans text-sm font-bold text-[#14213D]">System health</h2>
      </div>
      <div className="space-y-2">
        {rows.map(({ label, value, Icon, color }) => (
          <div key={label} className="flex items-center gap-2">
            <Icon className={`h-3.5 w-3.5 shrink-0 ${color}`} />
            <span className="min-w-0 flex-1 text-[10px] text-[#475467]">{label}</span>
            <span className={`text-[9px] font-bold ${color}`}>{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 rounded-xl bg-gradient-to-r from-[#081B36] to-[#0B3B7A] p-2 text-white">
        <p className="flex items-center gap-2 text-[10px] font-bold"><CircleHelp className="h-4 w-4 text-[#F4B629]" />Need a hand?</p>
        <p className="mt-1 text-[9px] text-white/75">Open support or review backup options.</p>
        <div className="mt-2 flex gap-3">
          <button type="button" onClick={onSupport} className="text-[9px] font-bold text-[#B7D2FF] hover:underline">Support</button>
          <button type="button" onClick={onBackups} className="text-[9px] font-bold text-[#B7D2FF] hover:underline">Backups</button>
        </div>
      </div>
    </section>
  );
}

export function AdminDashboardView({ userName, date, data, onNavigate }: AdminDashboardViewProps) {
  const [employees, setEmployees] = useState<StaffUser[]>([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);
  const [employeesError, setEmployeesError] = useState('');
  const [salesPoints, setSalesPoints] = useState<DailyRevenuePoint[]>([]);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState('');

  useEffect(() => {
    let active = true;
    setEmployeesLoading(true);
    setEmployeesError('');
    void salonApi.listEmployees()
      .then(({ employees: result }) => {
        if (active) setEmployees(result);
      })
      .catch((error: unknown) => {
        if (active) setEmployeesError(error instanceof Error ? error.message : 'Unable to load employees.');
      })
      .finally(() => {
        if (active) setEmployeesLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    setSalesLoading(true);
    setSalesError('');
    void salonApi.analyticsTrend(date, 30)
      .then(({ points }) => {
        if (active) setSalesPoints(points);
      })
      .catch((error: unknown) => {
        if (active) setSalesError(error instanceof Error ? error.message : 'Unable to load sales history.');
      })
      .finally(() => {
        if (active) setSalesLoading(false);
      });
    return () => { active = false; };
  }, [date]);

  const activeAppointments = data.appointments.filter(
    (appointment) => !['Cancelled', 'No-Show'].includes(appointment.status)
  );
  const productStock = data.catalog
    .filter((item) => item.kind === 'product')
    .reduce((total, item) => total + item.stock_qty, 0);
  const activeEmployeeCount = employees.filter((employee) => employee.active).length;
  const stats = [
    { label: 'Total clients', value: String(data.clients.length), Icon: UsersRound, color: 'from-[#0874F9] to-[#0757D8]', note: 'Client profiles' },
    { label: "Today's bookings", value: String(activeAppointments.length), Icon: CalendarDays, color: 'from-[#7651E8] to-[#5636C9]', note: `${data.appointments.length} scheduled` },
    { label: "Today's sales", value: formatKsh(data.analytics.gross_revenue_ksh), Icon: ShoppingCart, color: 'from-[#0BB981] to-[#008B62]', note: `${data.analytics.settled_tickets} settled tickets` },
    { label: 'Products in stock', value: productStock.toLocaleString('en-KE'), Icon: Package, color: 'from-[#FFAB08] to-[#F47B0A]', note: `${data.analytics.low_stock_count} low-stock items` },
    { label: 'Active employees', value: employeesLoading ? '—' : String(activeEmployeeCount), Icon: Users, color: 'from-[#0EAFD0] to-[#07839D]', note: employeesError ? 'Unavailable' : 'Active accounts' },
  ];

  return (
    <div className="space-y-3">
      <section className="relative isolate overflow-hidden rounded-2xl border border-[#0B3B7A] bg-gradient-to-r from-[#081B36] via-[#0A3472] to-[#0757D8] px-4 py-3 text-white shadow-[0_16px_34px_-24px_rgba(10,29,58,0.42)] sm:px-5">
        <div aria-hidden="true" className="pointer-events-none absolute -right-3 -top-8 opacity-[0.12]">
          <ShieldCheck className="h-40 w-40" strokeWidth={1} />
        </div>
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-sans text-xl font-extrabold tracking-tight sm:text-2xl">Welcome back, {userName}!</h1>
            <p className="mt-1 text-xs text-[#E6F0FF]">Here is an overview of your salon system today.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-white/90">
            <CalendarDays className="h-4 w-4 text-[#B7D2FF]" />
            {new Date(`${date}T00:00:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
        </div>
      </section>

      <section aria-label="Salon summary" className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {stats.map(({ label, value, Icon, color, note }) => (
          <article key={label} className={`relative min-h-[84px] overflow-hidden rounded-2xl bg-gradient-to-br ${color} p-3 text-white shadow-[0_10px_22px_-16px_rgba(15,42,84,0.38)]`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-wide text-white/90">{label}</p>
                <p className="mt-1 truncate text-lg font-extrabold tabular-ksh">{value}</p>
                <p className="mt-0.5 truncate text-[9px] text-white/75">{note}</p>
              </div>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/15">
                <Icon className="h-4 w-4" />
              </span>
            </div>
          </article>
        ))}
      </section>

      {employeesError && (
        <p role="alert" className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
          Employee summary unavailable: {employeesError}
        </p>
      )}

      <div className="grid gap-3 lg:grid-cols-12">
        <RevenueChart date={date} points={salesPoints} loading={salesLoading} error={salesError} />
        <AppointmentStatusPanel appointments={data.appointments} />
        <RecentActivityPanel
          date={date}
          appointments={data.appointments}
          clients={data.clients}
          tickets={data.tickets}
          employees={employees}
          onViewAll={() => onNavigate('system-logs')}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-12">
        <QuickActions onNavigate={onNavigate} />
        <EmployeeOverview
          employees={employees}
          stylists={data.stylists}
          loading={employeesLoading}
          error={employeesError}
          onViewAll={() => onNavigate('employees')}
        />
        <SystemHealth
          lowStockCount={data.analytics.low_stock_count}
          onSupport={() => onNavigate('support')}
          onBackups={() => onNavigate('backups')}
        />
      </div>
    </div>
  );
}
