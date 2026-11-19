import { useMemo, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  ShoppingBag,
  X,
  AlertTriangle,
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
  onChangeDate: (date: string) => void;
  stylists: Stylist[];
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
}

const START_HOUR = 9;
const END_HOUR = 19;
const SLOT_HEIGHT_PX = 38; // 30-minute row height

const TIME_SLOTS: string[] = [];
for (let h = START_HOUR; h <= END_HOUR; h++) {
  TIME_SLOTS.push(`${String(h).padStart(2, '0')}:00`);
  if (h < END_HOUR) {
    TIME_SLOTS.push(`${String(h).padStart(2, '0')}:30`);
  }
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
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
  onChangeDate,
  stylists,
  appointments,
  clients,
  catalog,
  onCreateAppointment,
  onUpdateAppointment,
  onSendToPos,
}: ScheduleViewProps) {
  const [stylistFilter, setStylistFilter] = useState<string>('all');
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
  const [bookingOpen, setBookingOpen] = useState(false);

  // Booking modal state
  const services = useMemo(
    () => catalog.filter((c) => c.kind === 'service'),
    [catalog]
  );
  const [formClientId, setFormClientId] = useState<string>('');
  const [formStylistId, setFormStylistId] = useState<string>('');
  const [formServiceId, setFormServiceId] = useState<string>('');
  const [formTime, setFormTime] = useState<string>('10:00');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formError, setFormError] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);

  // Inspector reschedule state
  const [inspectorError, setInspectorError] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('');
  const [editStylist, setEditStylist] = useState<string>('');

  const visibleStylists = useMemo(() => {
    if (stylistFilter === 'all') return stylists;
    return stylists.filter((s) => s.id === stylistFilter);
  }, [stylists, stylistFilter]);

  const openBookingModal = (prefillStylistId?: string, prefillTime?: string) => {
    setFormClientId(clients[0]?.id ?? '');
    setFormStylistId(prefillStylistId || stylists[0]?.id || '');
    setFormServiceId(services[0]?.id ?? '');
    setFormTime(prefillTime || '11:00');
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
    try {
      await onUpdateAppointment(apt.id, { status });
      setSelectedAppointment((prev) => (prev ? { ...prev, status } : null));
    } catch (err) {
      setInspectorError(err instanceof Error ? err.message : 'Status update failed.');
    }
  };

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

  return (
    <div className="space-y-6">
      {/* Editorial Top Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="font-serif-editorial text-3xl font-semibold tracking-tight text-[#151C27]">
            Master Schedule
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            {formatReadableDate(date)} · {appointments.filter((a) => a.status !== 'Cancelled').length} active bookings
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Date Navigator */}
          <div className="inline-flex items-center bg-white border border-[#E5E7EB] rounded-lg p-1">
            <button
              type="button"
              onClick={() => onChangeDate(offsetIsoDate(date, -1))}
              aria-label="Previous day"
              className="h-9 w-9 flex items-center justify-center rounded-md text-[#4A4455] hover:bg-[#F9FAFB]"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangeDate(today)}
              className={`px-3 h-9 rounded-md text-xs font-semibold transition-colors whitespace-nowrap ${
                date === today ? 'bg-[#EDE9FE] text-[#6D28D9]' : 'text-[#151C27] hover:bg-[#F9FAFB]'
              }`}
            >
              Today
            </button>
            <input
              type="date"
              value={date}
              onChange={(e) => e.target.value && onChangeDate(e.target.value)}
              aria-label="Select schedule date"
              className="h-9 px-2 text-xs font-semibold text-[#151C27] bg-transparent focus:outline-none tabular-ksh"
            />
            <button
              type="button"
              onClick={() => onChangeDate(offsetIsoDate(date, 1))}
              aria-label="Next day"
              className="h-9 w-9 flex items-center justify-center rounded-md text-[#4A4455] hover:bg-[#F9FAFB]"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Stylist Filter */}
          <select
            value={stylistFilter}
            onChange={(e) => setStylistFilter(e.target.value)}
            aria-label="Filter by stylist"
            className="salon-input px-3 text-sm font-medium text-[#151C27]"
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
            className="h-11 px-5 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] active:scale-[0.98] text-white text-sm font-semibold inline-flex items-center gap-2 transition-all whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            New Appointment
          </button>
        </div>
      </div>

      {/* Multi-Column Stylist Diary Grid */}
      <div className="salon-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            {/* Stylist Column Headers */}
            <div
              className="grid border-b border-[#E5E7EB] bg-[#F9FAFB]"
              style={{
                gridTemplateColumns: `80px repeat(${visibleStylists.length}, minmax(185px, 1fr))`,
              }}
            >
              <div className="p-4 text-xs font-semibold text-[#6B7280] flex items-center justify-center border-r border-[#E5E7EB]">
                Time
              </div>
              {visibleStylists.map((stylist) => {
                const count = appointments.filter(
                  (a) => a.stylist_id === stylist.id && a.status !== 'Cancelled'
                ).length;
                return (
                  <div
                    key={stylist.id}
                    className="p-4 flex items-center gap-3 border-r last:border-r-0 border-[#E5E7EB]"
                  >
                    <StylistAvatar src={stylist.avatar_url} name={stylist.name} size="md" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#151C27] truncate">
                        {stylist.name}
                      </p>
                      <p className="text-xs text-[#6B7280] truncate">
                        {stylist.role} · {count} booked
                      </p>
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
              <div className="border-r border-[#E5E7EB] bg-[#F9FAFB]/60">
                {TIME_SLOTS.map((slot) => (
                  <div
                    key={slot}
                    style={{ height: `${SLOT_HEIGHT_PX}px` }}
                    className="px-2 flex items-start justify-center pt-1.5 text-xs font-semibold text-[#6B7280] tabular-ksh border-b border-[#E5E7EB]/70"
                  >
                    {slot.endsWith(':00') ? slot : ''}
                  </div>
                ))}
              </div>

              {/* Stylist Lanes */}
              {visibleStylists.map((stylist) => {
                const laneAppointments = appointments.filter(
                  (a) => a.stylist_id === stylist.id && a.status !== 'Cancelled'
                );

                return (
                  <div
                    key={stylist.id}
                    className="relative border-r last:border-r-0 border-[#E5E7EB]"
                  >
                    {/* Clickable 30-min grid rows */}
                    {TIME_SLOTS.map((slot) => (
                      <button
                        key={slot}
                        type="button"
                        onClick={() => openBookingModal(stylist.id, slot)}
                        style={{ height: `${SLOT_HEIGHT_PX}px` }}
                        aria-label={`Book ${stylist.name} at ${slot}`}
                        className="w-full block text-left border-b border-[#E5E7EB]/60 hover:bg-[#EDE9FE]/40 transition-colors"
                      />
                    ))}

                    {/* Appointment Blocks */}
                    {laneAppointments.map((apt) => {
                      const offsetMin = toMinutes(apt.start_time) - START_HOUR * 60;
                      const topPx = (offsetMin / 30) * SLOT_HEIGHT_PX + 2;
                      const heightPx = Math.max(
                        SLOT_HEIGHT_PX - 4,
                        (apt.duration_min / 30) * SLOT_HEIGHT_PX - 4
                      );

                      const cardTone =
                        apt.status === 'In-Service'
                          ? 'bg-[#EDE9FE] border-[#6D28D9]'
                          : apt.status === 'Completed'
                            ? 'bg-[#ECFDF5] border-[#10B981]'
                            : apt.status === 'Pending'
                              ? 'bg-[#FFFBEB] border-[#F59E0B]'
                              : 'bg-white border-[#DDD6FE]';

                      return (
                        <button
                          key={apt.id}
                          type="button"
                          onClick={() => openInspector(apt)}
                          style={{ top: `${topPx}px`, height: `${heightPx}px` }}
                          className={`absolute inset-x-1.5 z-10 rounded-lg border p-2.5 text-left shadow-sm hover:shadow-md transition-all overflow-hidden flex flex-col justify-between ${cardTone}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#151C27] truncate">
                                {apt.client_name}
                              </p>
                              <p className="text-[11px] font-medium text-[#4A4455] truncate">
                                {apt.service_name}
                              </p>
                            </div>
                            <span className="text-[11px] font-bold text-[#151C27] tabular-ksh shrink-0">
                              {apt.start_time}
                            </span>
                          </div>

                          {heightPx >= 64 && (
                            <div className="flex items-center justify-between gap-2 mt-1">
                              <StatusBadge status={apt.status} />
                              <span className="text-[11px] font-semibold text-[#4A4455] tabular-ksh">
                                {formatKsh(apt.service_price_ksh)}
                              </span>
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* New Appointment Modal */}
      {bookingOpen && (
        <div className="fixed inset-0 z-50 bg-[#120D1A]/50 flex items-center justify-center p-4">
          <div className="salon-sheet rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
              <div>
                <h2 className="font-serif-editorial text-2xl font-semibold text-[#151C27]">
                  Book Appointment
                </h2>
                <p className="text-xs text-[#6B7280] mt-0.5">{formatReadableDate(date)}</p>
              </div>
              <button
                type="button"
                onClick={() => setBookingOpen(false)}
                aria-label="Close booking dialog"
                className="h-10 w-10 rounded-lg flex items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6]"
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
                <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                  Client
                </label>
                <select
                  value={formClientId}
                  onChange={(e) => setFormClientId(e.target.value)}
                  className="salon-input w-full px-3 text-sm text-[#151C27]"
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
                  <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                    Stylist
                  </label>
                  <select
                    value={formStylistId}
                    onChange={(e) => setFormStylistId(e.target.value)}
                    className="salon-input w-full px-3 text-sm text-[#151C27]"
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
                  <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                    Start Time
                  </label>
                  <select
                    value={formTime}
                    onChange={(e) => setFormTime(e.target.value)}
                    className="salon-input w-full px-3 text-sm text-[#151C27] tabular-ksh"
                    required
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                  Service
                </label>
                <select
                  value={formServiceId}
                  onChange={(e) => setFormServiceId(e.target.value)}
                  className="salon-input w-full px-3 text-sm text-[#151C27]"
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
                <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                  Appointment Notes
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Optional formula or arrival preference"
                  className="salon-input w-full px-3 text-sm text-[#151C27]"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBookingOpen(false)}
                  className="h-11 px-4 rounded-lg border border-[#E5E7EB] bg-white text-sm font-semibold text-[#151C27] hover:bg-[#F9FAFB]"
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
        <div className="fixed inset-0 z-50 bg-[#120D1A]/50 flex items-center justify-center p-4">
          <div className="salon-sheet rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] pb-4">
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="font-serif-editorial text-2xl font-semibold text-[#151C27]">
                    {selectedAppointment.client_name}
                  </h2>
                  <StatusBadge status={selectedAppointment.status} />
                </div>
                <p className="text-xs text-[#6B7280] mt-1">
                  {selectedAppointment.client_phone} · {selectedAppointment.service_name}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAppointment(null)}
                aria-label="Close appointment details"
                className="h-10 w-10 rounded-lg flex items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6]"
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

            <div className="grid grid-cols-2 gap-4 text-sm bg-[#F9FAFB] rounded-xl p-4 border border-[#E5E7EB]">
              <div>
                <p className="text-xs text-[#6B7280]">Service Rate</p>
                <p className="tabular-ksh font-bold text-[#151C27] mt-0.5">
                  {formatKsh(selectedAppointment.service_price_ksh)}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#6B7280]">Duration</p>
                <p className="tabular-ksh font-semibold text-[#151C27] mt-0.5 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-[#6D28D9]" />
                  {selectedAppointment.duration_min} mins
                </p>
              </div>
              {selectedAppointment.client_formula && (
                <div className="col-span-2 pt-2 border-t border-[#E5E7EB]">
                  <p className="text-xs text-[#6B7280]">Client Formula Note</p>
                  <p className="text-xs font-medium text-[#151C27] mt-0.5">
                    {selectedAppointment.client_formula}
                  </p>
                </div>
              )}
            </div>

            {/* Reschedule Controls */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-[#4A4455] mb-1">
                  Assigned Stylist
                </label>
                <select
                  value={editStylist}
                  onChange={(e) => setEditStylist(e.target.value)}
                  className="salon-input w-full px-3 text-sm text-[#151C27]"
                >
                  {stylists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#4A4455] mb-1">
                  Start Time
                </label>
                <div className="flex gap-2">
                  <select
                    value={editTime}
                    onChange={(e) => setEditTime(e.target.value)}
                    className="salon-input flex-1 px-3 text-sm text-[#151C27] tabular-ksh"
                  >
                    {TIME_SLOTS.map((slot) => (
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
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#E5E7EB]">
              <div className="flex flex-wrap gap-2">
                {selectedAppointment.status !== 'In-Service' &&
                  selectedAppointment.status !== 'Completed' && (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(selectedAppointment, 'In-Service')}
                      className="h-10 px-3.5 rounded-lg bg-[#EDE9FE] text-[#6D28D9] text-xs font-semibold hover:bg-[#DDD6FE]"
                    >
                      Check In
                    </button>
                  )}
                {selectedAppointment.status === 'Pending' && (
                  <button
                    type="button"
                    onClick={() => handleStatusChange(selectedAppointment, 'Confirmed')}
                    className="h-10 px-3.5 rounded-lg border border-[#E5E7EB] bg-white text-xs font-semibold text-[#151C27] hover:bg-[#F9FAFB]"
                  >
                    Confirm
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
