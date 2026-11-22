import { useEffect, useMemo, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  ShoppingBag,
  X,
  AlertTriangle,
  Search,
  UsersRound,
  CalendarCheck,
  Banknote,
  Sparkles,
} from 'lucide-react';
import type {
  Appointment,
  AppointmentStatus,
  CatalogItem,
  Client,
  Stylist,
} from '../types';
import { formatKsh, offsetIsoDate, todayIsoDate } from '../api/client';
import { StylistAvatar } from './StylistAvatar';
import { StatusBadge } from './StatusBadge';

interface ScheduleViewProps {
  date: string;
  openingTime: string;
  closingTime: string;
  onChangeDate: (date: string) => void;
  stylists: Stylist[];
  employeeStylistId?: string;
  appointments: Appointment[];
  clients: Client[];
  catalog: CatalogItem[];
  onCreateAppointment: (payload: {
    client_id: string;
    stylist_id: string;
    service_id: string;
    date: string;
    start_time: string;
    notes: string;
  }) => Promise<void>;
  onUpdateAppointment: (
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
  ) => Promise<void>;
  onSendToPos: (appointment: Appointment) => void;
  onOpenWalkInPos: () => void;
  showFinancials: boolean;
  grossRevenueKsh: number;
}

const SLOT_HEIGHT_PX = 38; // 30-minute row height
const STATUS_FLOW: Partial<Record<AppointmentStatus, AppointmentStatus>> = {
  Pending: 'Confirmed',
  Confirmed: 'In-Service',
  'In-Service': 'Completed',
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function buildTimeSlots(openingTime: string, closingTime: string): string[] {
  const slots: string[] = [];
  const closingMinutes = toMinutes(closingTime);
  for (let minutes = toMinutes(openingTime); minutes < closingMinutes; minutes += 30) {
    slots.push(minutesToTime(minutes));
  }
  return slots;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

function formatReadableDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

export function ScheduleView({
  date,
  openingTime,
  closingTime,
  onChangeDate,
  stylists,
  employeeStylistId,
  appointments,
  clients,
  catalog,
  onCreateAppointment,
  onUpdateAppointment,
  onSendToPos,
  onOpenWalkInPos,
  showFinancials,
  grossRevenueKsh,
}: ScheduleViewProps) {
  const [stylistFilter, setStylistFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'All' | AppointmentStatus>('All');
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [quickActionError, setQuickActionError] = useState('');

  // Booking modal state
  const services = useMemo(
    () => catalog.filter((c) => c.kind === 'service'),
    [catalog]
  );
  const [formClientId, setFormClientId] = useState<string>('');
  const [formStylistId, setFormStylistId] = useState<string>('');
  const [formServiceId, setFormServiceId] = useState<string>('');
  const [formTime, setFormTime] = useState<string>(openingTime);
  const [formNotes, setFormNotes] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Inspector reschedule state
  const [inspectorError, setInspectorError] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('');
  const [editStylist, setEditStylist] = useState<string>('');
  const startMinutes = toMinutes(openingTime);
  const timeSlots = useMemo(() => buildTimeSlots(openingTime, closingTime), [openingTime, closingTime]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleStylists = useMemo(() => {
    if (employeeStylistId) return stylists.filter((stylist) => stylist.id === employeeStylistId);
    if (stylistFilter === 'all') return stylists;
    return stylists.filter((s) => s.id === stylistFilter);
  }, [stylists, stylistFilter, employeeStylistId]);

  const openBookingModal = (prefillStylistId?: string, prefillTime?: string) => {
    setFormClientId(clients[0]?.id ?? '');
    setFormStylistId(prefillStylistId || stylists[0]?.id || '');
    setFormServiceId(services[0]?.id ?? '');
    setFormTime(prefillTime || openingTime);
    setFormNotes('');
    setFormError('');
    setBookingOpen(true);
  };

  const openInspector = (apt: Appointment) => {
    setSelectedAppointment(apt);
    setEditTime(apt.start_time);
    setEditStylist(apt.stylist_id);
    setInspectorError('');
  };

  const handleBookSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSubmitting(true);
    try {
      await onCreateAppointment({
        client_id: formClientId,
        stylist_id: formStylistId,
        service_id: formServiceId,
        date,
        start_time: formTime,
        notes: formNotes,
      });
      setBookingOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to book appointment.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (apt: Appointment, status: AppointmentStatus) => {
    setInspectorError('');
    setQuickActionError('');
    try {
      await onUpdateAppointment(apt.id, { status });
      setSelectedAppointment((prev) => (prev ? { ...prev, status } : null));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Status update failed.';
      setInspectorError(message);
      setQuickActionError(message);
    }
  };

  const getAppointmentTiming = (apt: Appointment) => {
    if (date !== todayIsoDate()) return '';
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = toMinutes(apt.start_time);
    const endMinutes = startMinutes + apt.duration_min;
    if (apt.status === 'Completed' || apt.status === 'Cancelled' || apt.status === 'No-Show') {
      return '';
    }
    if (currentMinutes < startMinutes && startMinutes - currentMinutes <= 30) return 'Starting soon';
    if (currentMinutes >= endMinutes) return 'Overdue';
    return '';
  };

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const showCurrentTime = date === todayIsoDate() &&
    currentMinutes >= startMinutes &&
    currentMinutes <= toMinutes(closingTime);

  const handleReschedule = async () => {
    if (!selectedAppointment) return;
    setInspectorError('');
    try {
      await onUpdateAppointment(selectedAppointment.id, {
        start_time: editTime,
        stylist_id: editStylist,
      });
      setSelectedAppointment(null);
    } catch (err) {
      setInspectorError(err instanceof Error ? err.message : 'Reschedule failed.');
    }
  };

  const today = todayIsoDate();
  const activeAppointments = appointments.filter((apt) => apt.status !== 'Cancelled');
  const completedCount = appointments.filter((apt) => apt.status === 'Completed').length;
  const inServiceCount = appointments.filter((apt) => apt.status === 'In-Service').length;
  const nextAppointment = [...activeAppointments]
    .filter((apt) => apt.status !== 'Completed')
    .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))[0] ?? null;

  const filteredAppointments = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return appointments.filter((apt) => {
      const matchesStatus = statusFilter === 'All' || apt.status === statusFilter;
      const matchesSearch =
        !query ||
        apt.client_name.toLowerCase().includes(query) ||
        apt.service_name.toLowerCase().includes(query) ||
        apt.stylist_name.toLowerCase().includes(query);
      return matchesStatus && matchesSearch;
    });
  }, [appointments, searchQuery, statusFilter]);

  return (
    <div className="space-y-6">
      {/* Boutique Welcome Banner */}
      <section className="relative overflow-hidden rounded-3xl border border-[#C5D8F4] bg-gradient-to-r from-[#0A1D3A] via-[#0B3B7A] to-[#0B5ED7] px-5 py-5 text-white shadow-[0_18px_38px_-28px_rgba(74,29,56,0.75)] sm:px-7 sm:py-6">
        <div className="absolute -right-12 -top-16 h-44 w-44 rounded-full border border-white/10 bg-white/[0.03]" />
        <div className="absolute right-16 bottom-[-70px] h-40 w-40 rounded-full border border-[#B7D2FF]/10" />
        <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">
              <Sparkles className="h-3.5 w-3.5" />
              Royal Saloon & Beauty Hub
            </div>
            <h2 className="font-serif-editorial text-2xl font-semibold sm:text-3xl">
              {date === today ? 'Good morning, salon team' : 'Salon day at a glance'}
            </h2>
            <p className="mt-2 max-w-xl text-sm text-[#E6F0FF]">
              {activeAppointments.length} appointments, {inServiceCount} in service, and {completedCount} completed today.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => openBookingModal()}
              className="h-11 rounded-xl bg-white px-4 text-xs font-bold text-[#153560] shadow-sm transition-transform active:scale-[0.98]"
            >
              + New booking
            </button>
            {nextAppointment && (
              <button
                type="button"
                onClick={() => onSendToPos(nextAppointment)}
                className="h-11 rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-bold text-white backdrop-blur-sm transition-colors hover:bg-white/15"
              >
                Open next in POS
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Editorial Top Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563EB]">
            Royal Beauty Atelier
          </p>
          <h1 className="font-serif-editorial text-3xl font-semibold tracking-tight text-[#14213D]">
            Beauty Schedule
          </h1>
          <p className="text-sm text-[#64748B] mt-1">
            {formatReadableDate(date)} · {appointments.filter((a) => a.status !== 'Cancelled').length} active bookings
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date Navigator */}
          <div className="inline-flex items-center bg-white border border-[#E1E7F0] rounded-lg p-1">
            <button
              type="button"
              onClick={() => onChangeDate(offsetIsoDate(date, -1))}
              aria-label="Previous day"
              className="h-9 w-9 flex items-center justify-center rounded-md text-[#344054] hover:bg-[#F4F7FC]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangeDate(today)}
              className={`px-3 h-9 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                date === today ? 'bg-[#EDE9FE] text-[#6D28D9]' : 'text-[#14213D] hover:bg-[#F4F7FC]'
              }`}
            >
              Today
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && onChangeDate(e.target.value)}
              aria-label="Select schedule date"
              className="h-9 px-2 text-xs font-semibold text-[#14213D] bg-transparent focus:outline-none tabular-ksh"
            />
            <button
              type="button"
              onClick={() => onChangeDate(offsetIsoDate(date, 1))}
              aria-label="Next day"
              className="h-9 w-9 flex items-center justify-center rounded-md text-[#344054] hover:bg-[#F4F7FC]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Stylist Filter */}
          <select
            value={stylistFilter}
            onChange={(e) => setStylistFilter(e.target.value)}
            aria-label="Filter by stylist"
            className="salon-input px-3 text-sm font-medium text-[#14213D]"
          >
            <option value="all">All Stylists ({stylists.length})</option>
            {stylists.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => openBookingModal()}
            className="h-11 px-5 rounded-lg bg-gradient-to-r from-[#0D6EFD] to-[#0B5ED7] hover:from-[#1D4ED8] hover:to-[#1D4ED8] active:scale-[0.98] text-white text-sm font-semibold inline-flex items-center gap-2 transition-all whitespace-nowrap shrink-0 shadow-[0_10px_22px_-12px_rgba(13,110,253,0.28)]"
          >
            <Plus className="h-4 w-4" />
            New Appointment
          </button>
        </div>
      </div>

      {/* Salon-day Overview */}
      <section aria-label="Today's salon overview" className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {showFinancials && (
        <div className="salon-card rounded-2xl p-4 xl:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#64748B]">Settled revenue</p>
              <p className="mt-2 text-xl xl:text-2xl font-bold text-[#14213D] tabular-ksh">
                {formatKsh(grossRevenueKsh)}
              </p>
            </div>
            <span className="h-9 w-9 rounded-xl bg-[#E8F1FF] text-[#2563EB] flex items-center justify-center">
              <Banknote className="h-4 w-4" />
            </span>
          </div>
        </div>
        )}

        <div className="salon-card rounded-2xl p-4 xl:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#64748B]">Active bookings</p>
              <p className="mt-2 text-2xl font-bold text-[#14213D] tabular-ksh">{activeAppointments.length}</p>
            </div>
            <span className="h-9 w-9 rounded-xl bg-[#E8F1FF] text-[#2563EB] flex items-center justify-center">
              <CalendarCheck className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="salon-card rounded-2xl p-4 xl:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#64748B]">In service</p>
              <p className="mt-2 text-2xl font-bold text-[#14213D] tabular-ksh">{inServiceCount}</p>
              {inServiceCount === 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenWalkInPos}
                    className="text-xs font-bold text-[#0B5ED7] underline underline-offset-2"
                  >
                    Walk-in POS
                  </button>
                  <button
                    type="button"
                    onClick={() => openBookingModal()}
                    className="text-xs font-bold text-[#0B5ED7] underline underline-offset-2"
                  >
                    + Assign
                  </button>
                </div>
              )}
            </div>
            <span className="h-9 w-9 rounded-xl bg-[#F3EDE8] text-[#9A765F] flex items-center justify-center">
              <Clock className="h-4 w-4" />
            </span>
          </div>
        </div>

        <div className="salon-card rounded-2xl p-4 xl:p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#64748B]">Completed</p>
              <p className="mt-2 text-2xl font-bold text-[#14213D] tabular-ksh">{completedCount}</p>
            </div>
            <span className="h-9 w-9 rounded-xl bg-[#F3EDE8] text-[#9A765F] flex items-center justify-center">
              <UsersRound className="h-4 w-4" />
            </span>
          </div>
        </div>
      </section>

      <section className="grid xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)] gap-4">
        {nextAppointment ? (
          <div className="rounded-2xl border border-[#D8E7FB] bg-gradient-to-r from-[#F4F7FC] to-[#EAF2FF] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="h-14 w-14 rounded-2xl bg-[#0D6EFD] text-white flex flex-col items-center justify-center shrink-0 shadow-[0_10px_20px_-12px_rgba(13,110,253,0.35)]">
                <span className="text-[10px] font-bold uppercase tracking-wide">Next</span>
                <span className="text-sm font-bold tabular-ksh">{nextAppointment.start_time}</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#2563EB]">Next appointment</p>
                <p className="mt-1 text-lg font-semibold text-[#14213D] truncate">{nextAppointment.client_name}</p>
                <p className="text-xs text-[#64748B] truncate">
                  {nextAppointment.service_name} · {nextAppointment.stylist_name}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onSendToPos(nextAppointment)}
              className="h-10 px-4 rounded-lg border border-[#A7C6F8] bg-white text-xs font-bold text-[#0B5ED7] hover:bg-[#EAF2FF] whitespace-nowrap"
            >
              Send to POS
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#D8E7FB] bg-white p-5">
            <p className="text-sm font-semibold text-[#14213D]">No upcoming appointments</p>
            <p className="text-xs text-[#64748B] mt-1">The rest of this day is open for new bookings.</p>
          </div>
        )}

        <div className="salon-card rounded-2xl p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#64748B]">Stylist availability</p>
            <span className="text-xs font-semibold text-[#2563EB]">{stylists.length} specialists</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-2 gap-2">
            {stylists.map((stylist) => {
              const count = activeAppointments.filter((apt) => apt.stylist_id === stylist.id).length;
              return (
                <div key={stylist.id} className="flex items-center gap-2 rounded-xl bg-[#F4F7FC] border border-[#DDE6F1] px-2.5 py-2">
                  <StylistAvatar src={stylist.avatar_url} name={stylist.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-[#14213D] truncate">{stylist.name.split(' ')[0]}</p>
                    <p className="text-[10px] text-[#64748B]">{count} bookings</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="salon-card rounded-2xl p-3 flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#64748B]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search client, stylist, or service"
            className="salon-input w-full pl-10 pr-3 text-sm"
          />
        </div>
        <div className="flex items-center gap-1 overflow-x-auto">
          {(['All', 'Pending', 'Confirmed', 'In-Service', 'Completed'] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={`h-9 px-3 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                statusFilter === status
                  ? 'bg-[#0D6EFD] text-white'
                  : 'bg-[#F4F7FC] text-[#64748B] hover:bg-[#E8F1FF]'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </section>
      {quickActionError && (
        <p role="alert" className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
          {quickActionError}
        </p>
      )}

      {/* Mobile appointment timeline */}
      <section className="md:hidden space-y-3" aria-label="Mobile appointment timeline">
        {filteredAppointments.length === 0 ? (
          <div className="salon-card rounded-2xl px-5 py-10 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-[#E8F1FF] text-[#0B5ED7]">
              <Search className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm font-bold text-[#14213D]">No appointments found</p>
            <p className="mt-1 text-xs text-[#64748B]">Try another search or status filter.</p>
          </div>
        ) : (
          filteredAppointments
            .filter((apt) => apt.status !== 'Cancelled')
            .sort((a, b) => toMinutes(a.start_time) - toMinutes(b.start_time))
            .map((apt) => (
              <div
                key={apt.id}
                className="relative w-full rounded-2xl border border-[#DDE6F1] bg-white p-4 shadow-[0_8px_22px_-18px_rgba(15,42,84,0.12)]"
              >
                <span className="absolute bottom-4 left-0 top-4 w-1 rounded-r-full bg-[#0D6EFD]" />
                <button
                  type="button"
                  onClick={() => openInspector(apt)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3 pl-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#2563EB] tabular-ksh">
                        {apt.start_time} · {apt.duration_min} min
                      </p>
                      <p className="mt-1 truncate text-base font-bold text-[#14213D]">{apt.client_name}</p>
                      <p className="mt-0.5 truncate text-xs text-[#64748B]">{apt.service_name} · {apt.stylist_name.split(' ')[0]}</p>
                      {apt.client_formula && (
                        <p className="mt-2 line-clamp-2 text-[11px] font-medium text-[#64748B]">
                          Formula / alert: {apt.client_formula}
                        </p>
                      )}
                      {apt.notes && <p className="mt-1 line-clamp-1 text-[11px] text-[#64748B]">Note: {apt.notes}</p>}
                    </div>
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <StatusBadge status={apt.status} />
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${apt.ticket_id ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-[#FFF7ED] text-[#C2410C]'}`}>
                        {apt.ticket_id ? 'Settled' : `Balance due · ${formatKsh(apt.service_price_ksh)}`}
                      </span>
                      {getAppointmentTiming(apt) && (
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${getAppointmentTiming(apt) === 'Overdue' ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#FFFBEB] text-[#B45309]'}`}>
                          {getAppointmentTiming(apt)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
                {STATUS_FLOW[apt.status] && (
                  <button
                    type="button"
                    onClick={() => void handleStatusChange(apt, STATUS_FLOW[apt.status]!)}
                    className="mt-3 ml-2 inline-flex h-9 items-center rounded-lg bg-[#E8F1FF] px-3 text-xs font-bold text-[#0B5ED7]"
                  >
                    {apt.status === 'Pending' ? 'Confirm' : apt.status === 'Confirmed' ? 'Start service' : 'Complete'}
                  </button>
                )}
              </div>
            ))
        )}
      </section>

      <button
        type="button"
        aria-expanded={scheduleExpanded}
        aria-controls="stylist-diary-grid"
        onClick={() => setScheduleExpanded((expanded) => !expanded)}
        className="salon-card hidden w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left md:flex"
      >
        <span>
          <span className="block text-sm font-bold text-[#14213D]">
            {scheduleExpanded ? 'Hide full stylist schedule' : 'Show full stylist schedule'}
          </span>
          <span className="mt-1 block text-xs text-[#64748B]">
            {stylistFilter === 'all' ? `All ${visibleStylists.length} stylists` : visibleStylists[0]?.name}
            {` · ${openingTime}–${closingTime}`}
          </span>
        </span>
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-[#0B5ED7] transition-transform ${scheduleExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Multi-Column Stylist Diary Grid */}
      <div
        id="stylist-diary-grid"
        className={`${scheduleExpanded ? 'hidden md:block' : 'hidden'} salon-card overflow-hidden rounded-2xl`}
      >
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Stylist Column Headers */}
            <div
              className="grid border-b border-[#E1E7F0] bg-[#F4F7FC]"
              style={{
                gridTemplateColumns: `80px repeat(${visibleStylists.length}, minmax(185px, 1fr))`,
              }}
            >
              <div className="p-4 text-xs font-semibold text-[#667085] flex items-center justify-center border-r border-[#E1E7F0]">
                Time
              </div>
              {visibleStylists.map((stylist) => {
                const count = filteredAppointments.filter(
                  (a) => a.stylist_id === stylist.id && a.status !== 'Cancelled'
                ).length;
                return (
                  <div
                    key={stylist.id}
                    className="p-4 flex items-center gap-3 border-r last:border-r-0 border-[#E1E7F0]"
                  >
                    <StylistAvatar src={stylist.avatar_url} name={stylist.name} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#14213D] truncate">
                        {stylist.name}
                      </p>
                      <p className="text-xs text-[#667085] truncate">
                        {stylist.role} · {count} booked
                      </p>
                      {count === 0 && (
                        <button
                          type="button"
                          onClick={() => openBookingModal(stylist.id)}
                          className="mt-1 text-[10px] font-bold text-[#0B5ED7] underline underline-offset-2"
                        >
                          + Assign booking
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Schedule Time Matrix */}
            <div
              className="grid relative"
              style={{
                gridTemplateColumns: `80px repeat(${visibleStylists.length}, minmax(185px, 1fr))`,
              }}
            >
              {/* Left Time Gutter */}
              <div className="border-r border-[#E1E7F0] bg-[#F4F7FC]/60">
                {timeSlots.map((slot) => (
                  <div
                    key={slot}
                    style={{ height: `${SLOT_HEIGHT_PX}px` }}
                    className="px-2 flex items-start justify-center pt-1.5 text-xs font-semibold text-[#667085] tabular-ksh border-b border-[#E1E7F0]/70"
                  >
                    {slot.endsWith(':00') ? slot : ''}
                  </div>
                ))}
              </div>

              {/* Stylist Lanes */}
              {visibleStylists.map((stylist) => {
                const laneAppointments = filteredAppointments.filter(
                  (a) => a.stylist_id === stylist.id && a.status !== 'Cancelled'
                );

                return (
                  <div
                    key={stylist.id}
                    className="relative border-r last:border-r-0 border-[#E1E7F0]"
                  >
                    {/* Clickable 30-min grid rows */}
                    {timeSlots.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => openBookingModal(stylist.id, slot)}
                        style={{ height: `${SLOT_HEIGHT_PX}px` }}
                        aria-label={`Book ${stylist.name} at ${slot}`}
                        className="w-full block text-left border-b border-[#E1E7F0]/60 hover:bg-[#EDE9FE]/40 transition-colors"
                      />
                    ))}

                    {/* Appointment Blocks */}
                    {laneAppointments.map((apt) => {
                      const offsetMin = toMinutes(apt.start_time) - startMinutes;
                      const topPx = (offsetMin / 30) * SLOT_HEIGHT_PX + 2;
                      const heightPx = Math.max(
                        SLOT_HEIGHT_PX - 4,
                        (apt.duration_min / 30) * SLOT_HEIGHT_PX - 4
                      );

                      const cardTone =
                        apt.status === 'In-Service'
                          ? 'bg-[#E8F1FF] border-[#0D6EFD]'
                          : apt.status === 'Completed'
                            ? 'bg-[#F3EDE8] border-[#B88A74]'
                            : apt.status === 'Pending'
                              ? 'bg-[#FFFBEB] border-[#F59E0B]'
                              : 'bg-[#F4F7FC] border-[#A7C6F8]';

                      return (
                        <div
                          key={apt.id}
                          style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                          className={`absolute inset-x-1.5 z-10 rounded-lg border p-2.5 shadow-sm transition-all overflow-hidden flex flex-col justify-between ${cardTone}`}
                        >
                          <button
                            type="button"
                            onClick={() => openInspector(apt)}
                            className="min-h-0 flex-1 text-left overflow-hidden"
                          >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#14213D] truncate">
                                {apt.client_name}
                              </p>
                              <p className="text-[11px] font-medium text-[#344054] truncate">
                                {apt.service_name}
                              </p>
                            </div>
                            <span className="text-[10px] font-bold text-[#14213D] tabular-ksh shrink-0 whitespace-nowrap">
                              {apt.start_time}–{minutesToTime(toMinutes(apt.start_time) + apt.duration_min)}
                            </span>
                          </div>

                          {heightPx >= 64 && (
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <StatusBadge status={apt.status} />
                              <span className="text-[11px] font-semibold text-[#344054] tabular-ksh">
                                {formatKsh(apt.service_price_ksh)}
                              </span>
                            </div>
                          )}
                          {heightPx >= 100 && (apt.client_formula || apt.notes) && (
                            <p className="mt-1 truncate text-[10px] font-medium text-[#64748B]">
                              Alert: {apt.client_formula || apt.notes}
                            </p>
                          )}
                          {getAppointmentTiming(apt) && (
                            <span className={`mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[9px] font-bold ${getAppointmentTiming(apt) === 'Overdue' ? 'bg-[#FEF2F2] text-[#B91C1C]' : 'bg-[#FFFBEB] text-[#B45309]'}`}>
                              {getAppointmentTiming(apt)}
                            </span>
                          )}
                          </button>
                          {heightPx >= 100 && STATUS_FLOW[apt.status] && (
                            <button
                              type="button"
                              onClick={() => void handleStatusChange(apt, STATUS_FLOW[apt.status]!)}
                              className="mt-1 self-start rounded-md bg-white/80 px-2 py-1 text-[10px] font-bold text-[#0B5ED7] hover:bg-white"
                            >
                              {apt.status === 'Pending' ? 'Confirm' : apt.status === 'Confirmed' ? 'Start service' : 'Complete'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {showCurrentTime && (
                <div
                  aria-label={`Current time ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                  className="pointer-events-none absolute left-[80px] right-0 z-30 border-t-2 border-[#E11D48]"
                  style={{
                    top: `${((currentMinutes - startMinutes) / 30) * SLOT_HEIGHT_PX}px`,
                  }}
                >
                  <span className="-translate-y-1/2 absolute left-1 rounded bg-[#E11D48] px-1.5 py-0.5 text-[10px] font-bold text-white tabular-ksh">
                    {now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* New Appointment Modal */}
      {bookingOpen && (
        <div className="fixed inset-0 z-50 bg-[#071426]/50 flex items-center justify-center p-4">
          <div className="salon-sheet rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E1E7F0] pb-4">
              <div>
                <h2 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">
                  Book Appointment
                </h2>
                <p className="text-xs text-[#667085] mt-0.5">{formatReadableDate(date)}</p>
              </div>
              <button
                type="button"
                onClick={() => setBookingOpen(false)}
                aria-label="Close booking dialog"
                className="h-10 w-10 rounded-lg flex items-center justify-center text-[#667085] hover:bg-[#F1F4F9]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] p-3 text-xs font-semibold text-[#B91C1C] flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleBookSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                  Client
                </label>
                <select
                  value={formClientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  className="salon-input w-full px-3 text-sm text-[#14213D]"
                  required
                >
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.phone})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                    Stylist
                  </label>
                  <select
                    value={formStylistId}
                    onChange={(e) => setFormStylistId(e.target.value)}
                    className="salon-input w-full px-3 text-sm text-[#14213D]"
                    required
                  >
                    {stylists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                    Start Time
                  </label>
                  <select
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="salon-input w-full px-3 text-sm text-[#14213D] tabular-ksh"
                    required
                  >
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                  Service
                </label>
                <select
                  value={formServiceId}
                  onChange={(e) => setFormServiceId(e.target.value)}
                  className="salon-input w-full px-3 text-sm text-[#14213D]"
                  required
                >
                  {services.map((srv) => (
                    <option key={srv.id} value={srv.id}>
                      {srv.name} — {srv.duration_min}m ({formatKsh(srv.price_ksh)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                  Appointment Notes
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional formula or arrival preference"
                  className="salon-input w-full px-3 text-sm text-[#14213D]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBookingOpen(false)}
                  className="h-11 px-4 rounded-lg border border-[#E1E7F0] bg-white text-sm font-semibold text-[#14213D] hover:bg-[#F4F7FC]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="h-11 px-5 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-sm font-semibold disabled:opacity-60"
                >
                  {submitting ? 'Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Inspector Modal */}
      {selectedAppointment && (
        <div className="fixed inset-0 z-50 bg-[#071426]/50 flex items-center justify-center p-4">
          <div className="salon-sheet rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-[#E1E7F0] pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">
                    {selectedAppointment.client_name}
                  </h2>
                  <StatusBadge status={selectedAppointment.status} />
                </div>
                <p className="text-xs text-[#667085] mt-1">
                  {selectedAppointment.client_phone} · {selectedAppointment.service_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                aria-label="Close appointment details"
                className="h-10 w-10 rounded-lg flex items-center justify-center text-[#667085] hover:bg-[#F1F4F9]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {inspectorError && (
              <div className="rounded-lg bg-[#FEF2F2] border border-[#FECACA] p-3 text-xs font-semibold text-[#B91C1C] flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                <span>{inspectorError}</span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm bg-[#F4F7FC] rounded-xl p-4 border border-[#E1E7F0]">
              <div>
                <p className="text-xs text-[#667085]">Service Rate</p>
                <p className="tabular-ksh font-bold text-[#14213D] mt-0.5">
                  {formatKsh(selectedAppointment.service_price_ksh)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#667085]">Payment</p>
                <p className={`mt-0.5 text-xs font-bold ${selectedAppointment.ticket_id ? 'text-[#047857]' : 'text-[#C2410C]'}`}>
                  {selectedAppointment.ticket_id
                    ? 'Settled'
                    : `Balance due · ${formatKsh(selectedAppointment.service_price_ksh)}`}
                </p>
              </div>
              {selectedAppointment.notes && (
                <div className="col-span-2 border-t border-[#E1E7F0] pt-2">
                  <p className="text-xs text-[#667085]">Appointment note</p>
                  <p className="mt-0.5 text-xs font-medium text-[#14213D]">{selectedAppointment.notes}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-[#667085]">Duration</p>
                <p className="tabular-ksh font-semibold text-[#14213D] mt-0.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#6D28D9]" />
                  {selectedAppointment.duration_min} mins
                </p>
              </div>
              {selectedAppointment.client_formula && (
                <div className="col-span-2 pt-2 border-t border-[#E1E7F0]">
                  <p className="text-xs text-[#667085]">Client Formula Note</p>
                  <p className="text-xs font-medium text-[#14213D] mt-0.5">
                    {selectedAppointment.client_formula}
                  </p>
                </div>
              )}
            </div>

            {/* Reschedule Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1">
                  Assigned Stylist
                </label>
                <select
                  value={editStylist}
                  onChange={(e) => setEditStylist(e.target.value)}
                  className="salon-input w-full px-3 text-sm text-[#14213D]"
                >
                  {stylists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1">
                  Start Time
                </label>
                <div className="flex gap-2">
                  <select
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="salon-input flex-1 px-3 text-sm text-[#14213D] tabular-ksh"
                  >
                    {timeSlots.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleReschedule}
                    className="h-11 px-3 rounded-lg bg-[#EDE9FE] text-[#6D28D9] text-xs font-semibold hover:bg-[#DDD6FE] whitespace-nowrap"
                  >
                    Move
                  </button>
                </div>
              </div>
            </div>

            {/* Workflow Status Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E1E7F0]">
              <div className="flex flex-wrap gap-2">
                {STATUS_FLOW[selectedAppointment.status] && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(selectedAppointment, STATUS_FLOW[selectedAppointment.status]!)}
                      className="h-10 px-3.5 rounded-lg bg-[#EDE9FE] text-[#6D28D9] text-xs font-semibold hover:bg-[#DDD6FE]"
                    >
                      {selectedAppointment.status === 'Pending'
                        ? 'Confirm'
                        : selectedAppointment.status === 'Confirmed'
                          ? 'Start service'
                          : 'Complete'}
                    </button>
                  )}
                {selectedAppointment.status !== 'Completed' &&
                  selectedAppointment.status !== 'Cancelled' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(selectedAppointment, 'Cancelled')}
                      className="h-10 px-3.5 rounded-lg border border-[#EF4444] bg-white text-xs font-semibold text-[#EF4444] hover:bg-[#FEF2F2]"
                    >
                      Cancel Booking
                    </button>
                  )}
              </div>

              {selectedAppointment.status !== 'Completed' &&
                selectedAppointment.status !== 'Cancelled' && (
                  <button
                    type="button"
                    onClick={() => {
                      onSendToPos(selectedAppointment);
                      setSelectedAppointment(null);
                    }}
                    className="h-11 px-4 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    Send to POS Checkout
                  </button>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
