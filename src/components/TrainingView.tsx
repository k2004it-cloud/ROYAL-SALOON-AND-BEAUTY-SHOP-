import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, CircleDollarSign, GraduationCap, RefreshCw, Save, TrendingUp, Users, WalletCards } from 'lucide-react';
import type { StaffUser, TrainingOverview } from '../types';
import { formatKsh, salonApi, todayIsoDate } from '../api/client';
import { isAdminRole } from '../types';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function TrainingView({ user }: { user: StaffUser }) {
  const isAdmin = isAdminRole(user.role);
  const [overview, setOverview] = useState<TrainingOverview | null>(null);
  const [selectedDay, setSelectedDay] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadOverview = useCallback(async (date?: string) => {
    setLoading(true);
    setError('');
    try {
      const result = await salonApi.trainingOverview(date);
      setOverview(result);
      setSelectedDay(result.day_of_week === null ? '' : String(result.day_of_week));
      if (result.training_date) setSelectedDate(result.training_date);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load training day details.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadOverview(); }, [loadOverview]);

  const handleSaveDay = async () => {
    if (selectedDay === '') return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await salonApi.updateTrainingDay(Number(selectedDay));
      setSelectedDate('');
      await loadOverview();
      setNotice('Weekly training day saved.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save the weekly training day.');
    } finally {
      setSaving(false);
    }
  };

  const handleDateLoad = () => {
    if (selectedDate) void loadOverview(selectedDate);
  };

  const metrics = overview?.metrics;
  const stats = [
    { label: 'Total sales', value: formatKsh(metrics?.total_sales_ksh ?? 0), Icon: TrendingUp, tint: 'bg-blue-50 text-blue-700' },
    { label: 'Clients served', value: String(metrics?.total_clients ?? 0), Icon: Users, tint: 'bg-violet-50 text-violet-700' },
    { label: 'Total commission', value: formatKsh(metrics?.total_commission_ksh ?? 0), Icon: WalletCards, tint: 'bg-amber-50 text-amber-700' },
    { label: 'Profit', value: formatKsh(metrics?.profit_ksh ?? 0), Icon: CircleDollarSign, tint: 'bg-emerald-50 text-emerald-700' },
  ];

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#14213D] via-[#19386A] to-[#0B5ED7] p-6 text-white shadow-lg sm:p-8">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15"><GraduationCap className="h-6 w-6" /></span>
          <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-blue-100">Team learning</p><h1 className="mt-1 text-2xl font-extrabold">Weekly Training Day</h1><p className="mt-2 max-w-2xl text-sm text-blue-100">Training day sales, clients and commission are summarized here. Employee commission is linked to each employee account.</p></div>
        </div>
      </section>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">{notice}</p>}

      <section className="salon-card rounded-2xl p-5 sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#14213D]">Training schedule</h2>
            <p className="mt-1 text-xs text-[#64748B]">{overview?.day_of_week === null || overview?.day_of_week === undefined ? 'The Admin has not chosen a weekly training day yet.' : `Training is every ${WEEKDAYS[overview.day_of_week]}.`}</p>
          </div>
          {isAdmin && <div className="flex flex-wrap items-end gap-2">
            <label className="text-xs font-semibold text-[#344054]">Weekly training day
              <select value={selectedDay} onChange={(event) => setSelectedDay(event.target.value)} className="salon-input mt-1 block h-10 min-w-40 px-3 text-sm">
                <option value="">Choose a day</option>
                {WEEKDAYS.map((day, index) => <option key={day} value={index}>{day}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void handleSaveDay()} disabled={saving || selectedDay === ''} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B5ED7] px-4 text-xs font-bold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving…' : 'Save day'}</button>
          </div>}
        </div>
      </section>

      {overview?.day_of_week !== null && overview?.day_of_week !== undefined && <>
        <section className="salon-card flex flex-wrap items-end justify-between gap-4 rounded-2xl p-5">
          <div><h2 className="text-lg font-bold text-[#14213D]">Training day report</h2><p className="mt-1 text-xs text-[#64748B]">Select a past {WEEKDAYS[overview.day_of_week]} to review its results.</p></div>
          <div className="flex items-end gap-2">
            <label className="text-xs font-semibold text-[#344054]">Training date<input type="date" value={selectedDate} max={todayIsoDate()} onChange={(event) => setSelectedDate(event.target.value)} className="salon-input mt-1 block h-10 px-3 text-sm" /></label>
            <button type="button" onClick={handleDateLoad} disabled={loading || !selectedDate} className="h-10 rounded-lg border border-[#C9D5E5] px-4 text-xs font-bold text-[#14213D] disabled:opacity-50">View</button>
            <button type="button" onClick={() => void loadOverview()} disabled={loading} aria-label="Refresh training report" className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[#C9D5E5] text-[#14213D] disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          </div>
        </section>

        <p className="flex items-center gap-2 text-xs font-semibold text-[#475467]"><CalendarDays className="h-4 w-4 text-[#0B5ED7]" />Report for {overview.training_date ? new Date(`${overview.training_date}T12:00:00`).toLocaleDateString('en-KE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : 'the selected training day'}</p>

        {isAdmin && <>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ label, value, Icon, tint }) => <article key={label} className="salon-card rounded-2xl p-5"><div className="flex items-center justify-between"><p className="text-xs font-semibold text-[#64748B]">{label}</p><span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}><Icon className="h-4 w-4" /></span></div><p className="mt-4 text-2xl font-extrabold text-[#14213D]">{loading ? '…' : value}</p></article>)}
          </section>

          <section className="salon-card overflow-hidden rounded-2xl">
            <div className="border-b border-[#E1E7F0] px-5 py-4"><h2 className="font-bold text-[#14213D]">Commission by employee</h2><p className="mt-1 text-xs text-[#64748B]">Each amount is attributed to the employee account linked to their stylist profile.</p></div>
            {overview.employee_commissions.length ? <div className="divide-y divide-[#E1E7F0]">{overview.employee_commissions.map((employee) => <div key={employee.user_id} className="flex items-center justify-between gap-3 px-5 py-3"><span className="text-sm font-semibold text-[#344054]">{employee.name}</span><span className="text-sm font-bold text-emerald-700">{formatKsh(employee.commission_ksh)}</span></div>)}</div> : <p className="px-5 py-6 text-sm text-[#64748B]">No employee commissions for this training day.</p>}
            <p className="border-t border-[#E1E7F0] px-5 py-3 text-[11px] text-[#64748B]">Profit is calculated as sales less employee commission and expenses recorded for this date.</p>
          </section>
        </>}

        {!isAdmin && <section className="salon-card rounded-2xl p-6"><p className="text-xs font-semibold text-[#64748B]">Your commission for this training day</p><p className="mt-2 text-3xl font-extrabold text-emerald-700">{loading ? '…' : formatKsh(overview.my_commission_ksh)}</p><p className="mt-2 text-xs text-[#64748B]">This amount is linked to your employee account and services recorded under your stylist profile.</p></section>}
      </>}
    </div>
  );
}
