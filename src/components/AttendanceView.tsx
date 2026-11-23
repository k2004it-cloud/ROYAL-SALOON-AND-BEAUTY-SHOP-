import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, UsersRound } from 'lucide-react';
import { salonApi, todayIsoDate } from '../api/client';
import type { AttendanceRecord, StaffUser } from '../types';

function localTime(value: string): string {
  return value ? new Date(value).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }) : '—';
}

function shiftHours(record?: AttendanceRecord): string {
  if (!record?.clock_out) return '—';
  const hours = (new Date(record.clock_out).getTime() - new Date(record.clock_in).getTime()) / 3600000;
  return Number.isFinite(hours) && hours >= 0 ? hours.toFixed(2) + ' h' : '—';
}

function lateMinutes(record: AttendanceRecord | undefined, openingTime: string): number {
  if (!record) return 0;
  const clockIn = new Date(record.clock_in);
  if (!Number.isFinite(clockIn.getTime())) return 0;
  const [hour, minute] = openingTime.split(':').map(Number);
  return Math.max(0, clockIn.getHours() * 60 + clockIn.getMinutes() - (hour * 60 + minute));
}

export function AttendanceView({ openingTime = '09:00' }: { openingTime?: string }) {
  const [date, setDate] = useState(todayIsoDate);
  const [employees, setEmployees] = useState<StaffUser[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [staff, attendance] = await Promise.all([salonApi.listEmployees(), salonApi.adminAttendance(date)]);
      setEmployees(staff.employees.filter((employee) => employee.active));
      setRecords(attendance.records);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load attendance records.');
    } finally {
      setLoading(false);
    }
  }, [date]);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('salon:workspace-updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('salon:workspace-updated', refresh);
    };
  }, [load]);

  const rows = useMemo(() => {
    const byUser = new Map(records.map((record) => [record.user_id, record]));
    return employees.map((employee) => ({ employee, record: byUser.get(employee.id) }))
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [employees, records]);
  const clockedIn = rows.filter(({ record }) => record && !record.clock_out).length;
  const completed = rows.filter(({ record }) => record?.clock_out).length;
  const late = rows.filter(({ record }) => lateMinutes(record, openingTime) > 0).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#C5D8F4] bg-gradient-to-r from-[#0A1D3A] via-[#0B3B7A] to-[#0B5ED7] px-5 py-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">Admin workspace</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Staff Attendance</h1>
        <p className="mt-2 text-sm text-[#E6F0FF]">Review clock-in and clock-out records by date.</p>
      </section>
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <article className="salon-card min-w-36 rounded-xl p-4"><p className="text-[10px] font-bold uppercase text-[#64748B]">Active staff</p><p className="mt-1 text-xl font-extrabold text-[#14213D]">{employees.length}</p></article>
          <article className="salon-card min-w-36 rounded-xl p-4"><p className="text-[10px] font-bold uppercase text-[#64748B]">On shift</p><p className="mt-1 text-xl font-extrabold text-[#0B5ED7]">{clockedIn}</p></article>
          <article className="salon-card min-w-36 rounded-xl p-4"><p className="text-[10px] font-bold uppercase text-[#64748B]">Shift completed</p><p className="mt-1 text-xl font-extrabold text-emerald-700">{completed}</p></article>
          <article className="salon-card min-w-36 rounded-xl p-4"><p className="text-[10px] font-bold uppercase text-[#64748B]">Late arrivals</p><p className="mt-1 text-xl font-extrabold text-amber-700">{late}</p></article>
        </div>
        <label className="text-xs font-semibold text-[#475467]">Attendance date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} className="salon-input mt-1 block px-3 text-sm" /></label>
      </section>
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      <section className="salon-card overflow-hidden rounded-2xl">
        <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] gap-3 border-b border-[#E1E7F0] bg-[#F7F9FC] px-5 py-3 text-[10px] font-bold uppercase tracking-wide text-[#64748B]"><span>Employee</span><span>Clock in</span><span>Clock out</span><span>Arrival</span><span>Hours</span></div>
        {loading ? <p className="px-5 py-10 text-center text-sm text-[#64748B]">Loading attendance…</p> : rows.length ? <div className="divide-y divide-[#E7ECF5]">{rows.map(({ employee, record }) => { const lateBy = lateMinutes(record, openingTime); return <article key={employee.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] items-center gap-3 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-bold text-[#14213D]">{employee.name}</p><p className="truncate text-[10px] text-[#64748B]">{employee.username}</p></div><span className="text-xs text-[#475467]">{record ? localTime(record.clock_in) : 'Not clocked in'}</span><span className="text-xs text-[#475467]">{record?.clock_out ? localTime(record.clock_out) : record ? 'Still on shift' : '—'}</span><span className={'text-xs font-bold ' + (lateBy ? 'text-amber-700' : 'text-emerald-700')}>{record ? (lateBy ? `Late ${lateBy} min` : 'On time') : '—'}</span><span className="text-xs font-bold text-[#14213D]">{shiftHours(record)}</span></article>; })}</div> : <div className="px-5 py-10 text-center"><UsersRound className="mx-auto h-8 w-8 text-[#0D6EFD]" /><p className="mt-3 text-sm font-semibold text-[#14213D]">No active employees found.</p></div>}
      </section>
      <p className="flex items-center gap-2 text-xs text-[#64748B]"><CalendarDays className="h-4 w-4" /><Clock3 className="h-4 w-4" />Employee clock records are saved as they clock in and out.</p>
    </div>
  );
}
