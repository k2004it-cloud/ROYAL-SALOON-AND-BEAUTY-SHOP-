import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Banknote, CircleDollarSign, ReceiptText, WalletCards } from 'lucide-react';
import type { CommissionEmployeeSummary, CommissionPayout } from '../types';
import { formatKsh, salonApi } from '../api/client';

export function PayrollView() {
  const [employees, setEmployees] = useState<CommissionEmployeeSummary[]>([]);
  const [payouts, setPayouts] = useState<CommissionPayout[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<CommissionPayout['payment_method']>('M-Pesa');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await salonApi.commissionPayroll();
      setEmployees(result.employees);
      setPayouts(result.payouts);
      setEmployeeId((current) => current || result.employees.find((employee) => employee.balance_ksh > 0)?.id || '');
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load commission balances.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  const selectedEmployee = employees.find((employee) => employee.id === employeeId);
  const totals = useMemo(() => employees.reduce((result, employee) => ({
    earned: result.earned + employee.earned_ksh,
    paid: result.paid + employee.paid_ksh,
    balance: result.balance + employee.balance_ksh,
  }), { earned: 0, paid: 0, balance: 0 }), [employees]);

  const recordPayout = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const amountKsh = Number(amount);
      const result = await salonApi.createCommissionPayout({ employee_id: employeeId, amount_ksh: amountKsh, payment_method: paymentMethod, reference, notes });
      setNotice(`Recorded ${formatKsh(result.payout.amount_ksh)} paid to ${result.payout.employee_name}.`);
      setAmount('');
      setReference('');
      setNotes('');
      await load();
      window.dispatchEvent(new Event('salon:workspace-updated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record this payout.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#C5D8F4] bg-gradient-to-r from-[#0A1D3A] via-[#0B3B7A] to-[#0B5ED7] px-5 py-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">Admin workspace</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Commission Payroll</h1>
        <p className="mt-2 text-sm text-[#E6F0FF]">Record commission payments and track what is still owed.</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {[{ label: 'Commission earned', value: totals.earned, Icon: CircleDollarSign, color: 'text-[#0757D8]' }, { label: 'Paid to staff', value: totals.paid, Icon: Banknote, color: 'text-emerald-700' }, { label: 'Still owed', value: totals.balance, Icon: WalletCards, color: 'text-amber-700' }].map((item) => <article key={item.label} className="salon-card rounded-2xl p-5"><item.Icon className={'h-5 w-5 ' + item.color} /><p className="mt-3 text-xs font-bold uppercase text-[#64748B]">{item.label}</p><p className={'mt-1 text-2xl font-extrabold ' + item.color}>{formatKsh(item.value)}</p></article>)}
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.3fr)]">
        <form onSubmit={(event) => void recordPayout(event)} className="salon-card space-y-3 rounded-2xl p-5">
          <div><h2 className="text-lg font-bold text-[#14213D]">Record a payout</h2><p className="mt-1 text-xs text-[#64748B]">The payout is allocated to the employee’s oldest unpaid commissions.</p></div>
          <label className="block text-xs font-semibold text-[#344054]">Employee<select required value={employeeId} onChange={(event) => { setEmployeeId(event.target.value); setAmount(''); }} className="salon-input mt-1 w-full px-3 text-sm"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name} — {formatKsh(employee.balance_ksh)} due</option>)}</select></label>
          {selectedEmployee && <p className="rounded-lg bg-[#EFF6FF] px-3 py-2 text-xs font-semibold text-[#0757D8]">Unpaid commission: {formatKsh(selectedEmployee.balance_ksh)}</p>}
          <label className="block text-xs font-semibold text-[#344054]">Amount (KSh)<input type="number" required min="1" max={selectedEmployee?.balance_ksh ?? 0} step="1" value={amount} onChange={(event) => setAmount(event.target.value)} className="salon-input mt-1 w-full px-3 text-sm" /></label>
          <label className="block text-xs font-semibold text-[#344054]">Payment method<select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as CommissionPayout['payment_method'])} className="salon-input mt-1 w-full px-3 text-sm"><option>Cash</option><option>M-Pesa</option><option>Bank Transfer</option></select></label>
          <label className="block text-xs font-semibold text-[#344054]">Reference (optional)<input maxLength={100} value={reference} onChange={(event) => setReference(event.target.value)} className="salon-input mt-1 w-full px-3 text-sm" placeholder="Receipt or transaction code" /></label>
          <label className="block text-xs font-semibold text-[#344054]">Note (optional)<textarea rows={2} maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-1 w-full rounded-lg border border-[#DDE6F1] px-3 py-2 text-sm text-[#14213D]" /></label>
          {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
          {notice && <p role="status" className="text-xs font-semibold text-emerald-700">{notice}</p>}
          <button type="submit" disabled={saving || !selectedEmployee || selectedEmployee.balance_ksh <= 0} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0D6EFD] px-4 text-sm font-bold text-white disabled:opacity-50"><Banknote className="h-4 w-4" />{saving ? 'Saving…' : 'Record payment'}</button>
        </form>
        <section className="salon-card overflow-hidden rounded-2xl">
          <div className="flex items-center gap-2 border-b border-[#E1E7F0] px-5 py-4"><ReceiptText className="h-5 w-5 text-[#0D6EFD]" /><div><h2 className="text-lg font-bold text-[#14213D]">Commission balances</h2><p className="mt-1 text-xs text-[#64748B]">All paid ticket commissions, less recorded payouts.</p></div></div>
          {loading ? <p className="px-5 py-10 text-center text-sm text-[#64748B]">Loading payroll…</p> : employees.length ? <div className="divide-y divide-[#E7ECF5]">{employees.map((employee) => <article key={employee.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1.2fr_1fr_1fr_1fr] sm:items-center"><div><p className="text-sm font-bold text-[#14213D]">{employee.name}</p><p className="text-[10px] text-[#64748B]">{employee.stylist_name || 'Stylist profile not assigned'}</p></div><p className="text-xs text-[#475467]">Earned <strong>{formatKsh(employee.earned_ksh)}</strong></p><p className="text-xs text-emerald-700">Paid <strong>{formatKsh(employee.paid_ksh)}</strong></p><p className="text-xs font-bold text-amber-700">Due {formatKsh(employee.balance_ksh)}</p></article>)}</div> : <p className="px-5 py-10 text-center text-sm text-[#64748B]">No employee accounts yet.</p>}
        </section>
      </div>
      <section className="salon-card overflow-hidden rounded-2xl">
        <div className="border-b border-[#E1E7F0] px-5 py-4"><h2 className="text-lg font-bold text-[#14213D]">Payout history</h2><p className="mt-1 text-xs text-[#64748B]">Each entry is visible in the employee’s earnings page.</p></div>
        {payouts.length ? <div className="divide-y divide-[#E7ECF5]">{payouts.map((payout) => <article key={payout.id} className="grid gap-2 px-5 py-4 sm:grid-cols-[1fr_1fr_1fr_1.2fr]"><div><p className="text-sm font-bold text-[#14213D]">{payout.employee_name}</p><p className="text-[10px] text-[#64748B]">{new Date(payout.paid_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</p></div><p className="text-sm font-extrabold text-emerald-700">{formatKsh(payout.amount_ksh)} · {payout.payment_method}</p><p className="text-xs text-[#475467]">{payout.reference || 'No reference'}{payout.notes ? ` · ${payout.notes}` : ''}</p><p className="text-[10px] text-[#64748B]">Recorded by {payout.recorded_by_name}</p></article>)}</div> : <p className="px-5 py-8 text-center text-sm text-[#64748B]">No commission payouts recorded yet.</p>}
      </section>
    </div>
  );
}
