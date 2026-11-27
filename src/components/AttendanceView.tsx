import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Clock3, Download, Printer, UsersRound } from 'lucide-react';
import QRCode from 'qrcode';
import { salonApi, todayIsoDate } from '../api/client';
import type { AttendanceRecord, StaffUser } from '../types';

function localTime(value: string): string {
  return value ? new Date(value).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }) : '—';
}

function shiftHours(record?: AttendanceRecord): string {
  if (!record?.clock_out) return '—';
  const hours = (new Date(record.clock_out).getTime() - new Date(record.clock_in).getTime()) / 3600000;
  return Number.isFinite(hours) && hours >= 0 ? hours.toFixed(2) + ' h' : '—';
}

function arrivalOffsetMinutes(record: AttendanceRecord | undefined, openingTime: string): number {
  if (!record) return 0;
  const clockIn = new Date(record.clock_in);
  if (!Number.isFinite(clockIn.getTime())) return 0;
  const [hour, minute] = openingTime.split(':').map(Number);
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(clockIn);
  const actualHour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const actualMinute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return actualHour * 60 + actualMinute - (hour * 60 + minute);
}

function arrivalLabel(record: AttendanceRecord | undefined, openingTime: string): string {
  const offset = arrivalOffsetMinutes(record, openingTime);
  if (!offset) return 'On time';
  const minutes = Math.abs(offset);
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const duration = [hours ? `${hours} h` : '', remainder ? `${remainder} min` : ''].filter(Boolean).join(' ');
  return `${offset < 0 ? 'Early' : 'Late'} ${duration}`;
}

export function AttendanceView({ openingTime = '09:00' }: { openingTime?: string }) {
  const [date, setDate] = useState(todayIsoDate);
  const [employees, setEmployees] = useState<StaffUser[]>([]);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attendanceQr, setAttendanceQr] = useState('');
  const [qrError, setQrError] = useState('');

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

  useEffect(() => {
    let active = true;
    void salonApi.attendanceQrCode()
      .then(({ code }) => QRCode.toDataURL(code, { width: 320, margin: 2, errorCorrectionLevel: 'H' }))
      .then((dataUrl) => { if (active) setAttendanceQr(dataUrl); })
      .catch((cause) => { if (active) setQrError(cause instanceof Error ? cause.message : 'Unable to load the attendance QR code.'); });
    return () => { active = false; };
  }, []);

  const rows = useMemo(() => {
    const byUser = new Map(records.map((record) => [record.user_id, record]));
    return employees.map((employee) => ({ employee, record: byUser.get(employee.id) }))
      .sort((a, b) => a.employee.name.localeCompare(b.employee.name));
  }, [employees, records]);
  const clockedIn = rows.filter(({ record }) => record && !record.clock_out).length;
  const completed = rows.filter(({ record }) => record?.clock_out).length;
  const late = rows.filter(({ record }) => arrivalOffsetMinutes(record, openingTime) > 0).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#C5D8F4] bg-gradient-to-r from-[#0A1D3A] via-[#0B3B7A] to-[#0B5ED7] px-5 py-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">Admin workspace</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Staff Attendance</h1>
        <p className="mt-2 text-sm text-[#E6F0FF]">Review clock-in and clock-out records by date.</p>
      </section>

      <section id="attendance-qr-print" className="salon-card rounded-2xl p-5">
        <style>{'@media print { body * { visibility: hidden !important; } #attendance-qr-print, #attendance-qr-print * { visibility: visible !important; } #attendance-qr-print { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: white !important; border: 0 !important; box-shadow: none !important; } .attendance-print-copy { display: block !important; } .attendance-qr-screen { display: none !important; } }'}</style>
        <div className="attendance-qr-screen flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="text-lg font-bold text-[#14213D]">Physical attendance QR code</h2><p className="mt-1 max-w-xl text-xs text-[#64748B]">Print and place this code at the salon. Employees scan it from Timesheet & Attendance to record their check-in.</p>{qrError && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{qrError}</p>}</div>
          {attendanceQr ? <div className="flex flex-wrap items-center gap-3"><img src={attendanceQr} alt="Royal Saloon employee attendance QR code" className="h-32 w-32 rounded-lg border border-[#E1E7F0] bg-white p-1" /><a href={attendanceQr} download="royal-saloon-attendance-qr.png" className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B5ED7] px-4 text-xs font-bold text-white"><Download className="h-4 w-4" />Download QR code</a><button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#DDE6F1] bg-white px-4 text-xs font-bold text-[#14213D]"><Printer className="h-4 w-4" />Print QR code</button></div> : !qrError ? <p className="text-xs text-[#64748B]">Preparing QR code…</p> : null}
        </div>
        {attendanceQr && <div className="attendance-print-copy hidden text-center"><h1 className="text-2xl font-bold text-black">Royal Saloon Staff Attendance</h1><p className="mt-2 text-base text-black">Scan this code in the employee attendance screen to check in.</p><img src={attendanceQr} alt="Royal Saloon employee attendance QR code" className="mx-auto mt-6 h-[360px] w-[360px]" /><p className="mt-5 text-sm text-black">Shift starts at {openingTime} · Africa/Nairobi</p></div>}
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
        {loading ? <p className="px-5 py-10 text-center text-sm text-[#64748B]">Loading attendance…</p> : rows.length ? <div className="divide-y divide-[#E7ECF5]">{rows.map(({ employee, record }) => { const offset = arrivalOffsetMinutes(record, openingTime); return <article key={employee.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,0.8fr)] items-center gap-3 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-bold text-[#14213D]">{employee.name}</p><p className="truncate text-[10px] text-[#64748B]">{employee.username}</p></div><span className="text-xs text-[#475467]">{record ? localTime(record.clock_in) : 'Not clocked in'}</span><span className="text-xs text-[#475467]">{record?.clock_out ? localTime(record.clock_out) : record ? 'Still on shift' : '—'}</span><span className={'text-xs font-bold ' + (offset > 0 ? 'text-amber-700' : offset < 0 ? 'text-sky-700' : 'text-emerald-700')}>{record ? arrivalLabel(record, openingTime) : '—'}</span><span className="text-xs font-bold text-[#14213D]">{shiftHours(record)}</span></article>; })}</div> : <div className="px-5 py-10 text-center"><UsersRound className="mx-auto h-8 w-8 text-[#0D6EFD]" /><p className="mt-3 text-sm font-semibold text-[#14213D]">No active employees found.</p></div>}
      </section>
      <p className="flex items-center gap-2 text-xs text-[#64748B]"><CalendarDays className="h-4 w-4" /><Clock3 className="h-4 w-4" />Arrival status compares Nairobi local time with the shift start ({openingTime}).</p>
    </div>
  );
}
