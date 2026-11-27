import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarClock, Clock3, QrCode, LogOut } from 'lucide-react';
import type { AttendanceRecord } from '../types';
import { offsetIsoDate, salonApi } from '../api/client';
import { AttendanceQrScanner } from './AttendanceQrScanner';

function localTime(value: string): string {
  return value ? new Date(value).toLocaleTimeString('en-KE', { timeZone: 'Africa/Nairobi', hour: '2-digit', minute: '2-digit' }) : '—';
}

function todayInNairobi(): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Nairobi', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function workedHours(record: AttendanceRecord, now: number): string {
  const started = new Date(record.clock_in).getTime();
  const ended = record.clock_out ? new Date(record.clock_out).getTime() : now;
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return '0.00 h';
  return ((ended - started) / 3600000).toFixed(2) + ' h';
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

export function EmployeeAttendanceView({ openingTime = '09:00' }: { openingTime?: string }) {
  const today = todayInNairobi();
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await salonApi.employeeAttendance(offsetIsoDate(today, -29), today);
      setRecords(result.records);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load your attendance.');
    }
  }, [today]);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    window.addEventListener('focus', refresh);
    window.addEventListener('salon:workspace-updated', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('salon:workspace-updated', refresh);
    };
  }, [load]);

  const todayRecord = records.find((record) => record.work_date === today);
  const isClockedIn = Boolean(todayRecord && !todayRecord.clock_out);
  const completedDays = useMemo(() => records.filter((record) => record.clock_out), [records]);
  const totalHours = completedDays.reduce((total, record) => total + (new Date(record.clock_out).getTime() - new Date(record.clock_in).getTime()) / 3600000, 0);
  const todayOffset = arrivalOffsetMinutes(todayRecord, openingTime);

  const recordTime = useCallback(async (action: 'in' | 'out', attendanceCode?: string) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (action === 'in') {
        if (!attendanceCode) throw new Error('Scan the physical attendance QR code to check in.');
        await salonApi.clockIn(attendanceCode);
        setNotice('Your check-in is recorded. You can check out at the end of your shift.');
      } else {
        await salonApi.clockOut();
        setNotice('Your clock-out time is saved. Attendance is complete for today.');
      }
      await load();
      window.dispatchEvent(new Event('salon:workspace-updated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save attendance.');
    } finally {
      setBusy(false);
    }
  }, [load]);

  const handleQrScan = useCallback((code: string) => {
    setScanOpen(false);
    void recordTime('in', code);
  }, [recordTime]);

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#C5D8F4] bg-gradient-to-r from-[#0A1D3A] via-[#0B3B7A] to-[#0B5ED7] px-5 py-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">Employee workspace</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Timesheet & Attendance</h1>
        <p className="mt-2 text-sm text-[#E6F0FF]">Scan the salon QR code to check in. Shift starts at {openingTime} East Africa Time.</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        <article className="salon-card rounded-2xl p-5"><p className="text-xs font-bold uppercase text-[#64748B]">Today</p><p className="mt-2 text-lg font-extrabold text-[#14213D]">{todayRecord ? (isClockedIn ? 'Clocked in' : 'Shift complete') : 'Not clocked in'}</p><p className={'mt-1 text-xs font-semibold ' + (todayOffset > 0 ? 'text-amber-700' : todayOffset < 0 ? 'text-sky-700' : 'text-emerald-700')}>{todayRecord ? arrivalLabel(todayRecord, openingTime) : `Shift starts at ${openingTime}`}</p></article>
        <article className="salon-card rounded-2xl p-5"><p className="text-xs font-bold uppercase text-[#64748B]">Start time</p><p className="mt-2 text-lg font-extrabold text-[#14213D]">{localTime(todayRecord?.clock_in ?? '')}</p></article>
        <article className="salon-card rounded-2xl p-5"><p className="text-xs font-bold uppercase text-[#64748B]">Completed hours (30 days)</p><p className="mt-2 text-lg font-extrabold text-[#14213D]">{totalHours.toFixed(2)} h</p></article>
      </section>

      <section className="salon-card flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
        <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0D6EFD]"><Clock3 className="h-5 w-5" /></span><div><h2 className="text-sm font-bold text-[#14213D]">{isClockedIn ? 'Your shift is in progress' : 'Attendance for today'}</h2><p className="mt-1 text-xs text-[#64748B]">{todayRecord ? `Checked in at ${localTime(todayRecord.clock_in)} · ${workedHours(todayRecord, now)} elapsed` : `Check-in is available by QR scan. On time at ${openingTime}.`}</p></div></div>
        {!todayRecord ? <button type="button" disabled={busy} onClick={() => { setError(''); setScanOpen(true); }} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0D6EFD] px-5 text-sm font-bold text-white disabled:opacity-60"><QrCode className="h-4 w-4" />Scan to check in</button> : isClockedIn ? <button type="button" disabled={busy} onClick={() => void recordTime('out')} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#071A34] px-5 text-sm font-bold text-white disabled:opacity-60"><LogOut className="h-4 w-4" />{busy ? 'Saving…' : 'Clock out'}</button> : <span className="rounded-lg bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">Finished at {localTime(todayRecord.clock_out)}</span>}
      </section>
      {scanOpen && <AttendanceQrScanner onScan={handleQrScan} onClose={() => setScanOpen(false)} />}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</p>}
      <section className="salon-card overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-[#E1E7F0] px-5 py-4"><CalendarClock className="h-5 w-5 text-[#0D6EFD]" /><div><h2 className="text-lg font-bold text-[#14213D]">Last 30 days</h2><p className="mt-1 text-xs text-[#64748B]">Arrival status compares East Africa Time with the scheduled start ({openingTime}).</p></div></div>
        {records.length ? <div className="divide-y divide-[#E7ECF5]">{records.map((record) => { const offset = arrivalOffsetMinutes(record, openingTime); return <article key={record.id} className="grid gap-2 px-5 py-4 sm:grid-cols-5 sm:items-center"><span className="text-sm font-bold text-[#14213D]">{new Date(record.work_date + 'T12:00:00').toLocaleDateString('en-KE', { weekday: 'short', month: 'short', day: 'numeric' })}</span><span className="text-xs text-[#475467]">In: {localTime(record.clock_in)}</span><span className="text-xs text-[#475467]">Out: {record.clock_out ? localTime(record.clock_out) : 'In progress'}</span><span className={'text-xs font-bold ' + (offset > 0 ? 'text-amber-700' : offset < 0 ? 'text-sky-700' : 'text-emerald-700')}>{arrivalLabel(record, openingTime)}</span><span className="text-xs font-bold text-[#0B5ED7]">{workedHours(record, now)}</span></article>; })}</div> : <p className="px-5 py-8 text-center text-sm text-[#64748B]">No attendance records yet.</p>}
      </section>
    </div>
  );
}
