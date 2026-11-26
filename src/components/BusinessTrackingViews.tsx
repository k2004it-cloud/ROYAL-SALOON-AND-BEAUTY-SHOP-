import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Gift, Plus, ReceiptText, Save, X } from 'lucide-react';
import type { Client, SalonExpense } from '../types';
import { formatKsh, salonApi, todayIsoDate } from '../api/client';

export function LoyaltyView({ clients }: { clients: Client[] }) {
  const ordered = [...clients].sort((a, b) => (b.loyalty_points || 0) - (a.loyalty_points || 0) || a.name.localeCompare(b.name));
  const eligible = ordered.filter((client) => (client.loyalty_points || 0) >= 15).length;
  return <div className="space-y-6">
    <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563EB]">Customer rewards</p><h1 className="font-serif-editorial text-3xl font-semibold text-[#14213D]">Loyalty points</h1><p className="mt-1 text-sm text-[#667085]">Clients earn 1 point for each paid visit with a service. At 15 points, their next service is automatically half price.</p></div>
    <div className="grid gap-4 sm:grid-cols-2"><div className="salon-card flex items-center gap-4 rounded-2xl p-5"><span className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#EDE9FE] text-[#6D28D9]"><Gift className="h-6 w-6" /></span><div><p className="text-xs font-semibold text-[#667085]">Clients with a reward ready</p><p className="mt-1 text-2xl font-bold text-[#14213D]">{eligible}</p></div></div><div className="salon-card rounded-2xl p-5"><p className="text-xs font-semibold text-[#667085]">How it works</p><p className="mt-2 text-sm font-semibold text-[#14213D]">15 points → 50% off one service</p><p className="mt-1 text-xs text-[#667085]">The reward is applied at checkout and the points restart with that visit.</p></div></div>
    <div className="salon-card overflow-hidden rounded-2xl"><div className="border-b border-[#E1E7F0] px-5 py-4"><h2 className="font-serif-editorial text-xl font-semibold text-[#14213D]">Customer progress</h2></div>{ordered.length ? <div className="divide-y divide-[#E1E7F0]">{ordered.map((client) => { const points = client.loyalty_points || 0; const ready = points >= 15; return <div key={client.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-semibold text-[#14213D]">{client.name}</p><p className="text-xs text-[#667085]">{client.phone || 'No phone number'}</p></div><div className="flex min-w-52 items-center gap-3"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#F1F4F9]"><div className={`h-full rounded-full ${ready ? 'bg-[#10B981]' : 'bg-[#6D28D9]'}`} style={{ width: `${Math.min(100, points / 15 * 100)}%` }} /></div><span className="text-xs font-bold text-[#14213D]">{points}/15</span></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold ${ready ? 'bg-emerald-50 text-emerald-700' : 'bg-[#F4F7FC] text-[#667085]'}`}>{ready ? '50% service reward ready' : `${Math.max(0, 15 - points)} points to reward`}</span></div>; })}</div> : <p className="p-8 text-center text-sm text-[#667085]">No customers to show yet.</p>}</div>
  </div>;
}

const EXPENSE_CATEGORIES = ['Electricity', 'Water', 'Wax', 'Spray', 'Mousse', 'Other'];
const blankForm = () => ({ category: 'Electricity', description: '', amount_ksh: '', expense_date: todayIsoDate() });

export function ExpensesView() {
  const [expenses, setExpenses] = useState<SalonExpense[]>([]);
  const [form, setForm] = useState(blankForm);
  const [customCategory, setCustomCategory] = useState('');
  const categoryChoice = EXPENSE_CATEGORIES.includes(form.category) ? form.category : 'Other';
  const [editingId, setEditingId] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = async () => { try { setExpenses((await salonApi.listExpenses()).expenses); } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load expenses.'); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  const total = useMemo(() => expenses.reduce((sum, expense) => sum + expense.amount_ksh, 0), [expenses]);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const payload = { ...form, category: categoryChoice === 'Other' ? customCategory.trim() : categoryChoice, amount_ksh: Number(form.amount_ksh) };
      const result = editingId ? await salonApi.updateExpense(editingId, payload) : await salonApi.createExpense(payload);
      setExpenses((current) => [result.expense, ...current.filter((item) => item.id !== result.expense.id)].sort((a, b) => b.expense_date.localeCompare(a.expense_date)));
      setForm(blankForm()); setCustomCategory(''); setEditingId('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to save expense.'); }
    finally { setBusy(false); }
  };
  const edit = (expense: SalonExpense) => { const isPreset = EXPENSE_CATEGORIES.includes(expense.category); setEditingId(expense.id); setForm({ category: isPreset ? expense.category : 'Other', description: expense.description, amount_ksh: String(expense.amount_ksh), expense_date: expense.expense_date }); setCustomCategory(isPreset && expense.category !== 'Other' ? '' : expense.category); setError(''); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return <div className="space-y-6">
    <div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563EB]">Business costs</p><h1 className="font-serif-editorial text-3xl font-semibold text-[#14213D]">Expenses</h1><p className="mt-1 text-sm text-[#667085]">Record and edit salon expenses. Entries are shared with the admin and employee workspace.</p></div>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <form onSubmit={submit} className="salon-card space-y-4 rounded-2xl p-5"><div className="flex items-center justify-between"><h2 className="font-serif-editorial text-xl font-semibold text-[#14213D]">{editingId ? 'Edit expense' : 'Add expense'}</h2>{editingId && <button type="button" onClick={() => { setEditingId(''); setForm(blankForm()); setCustomCategory(''); }} aria-label="Cancel edit" className="rounded-lg p-2 text-[#667085] hover:bg-[#F4F7FC]"><X className="h-4 w-4" /></button>}</div>
        <label className="block space-y-1.5 text-xs font-semibold text-[#344054]">Expense type<select value={categoryChoice} onChange={(event) => setForm({ ...form, category: event.target.value })} className="salon-input w-full text-sm">{EXPENSE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}</select></label>
        {categoryChoice === 'Other' && <label className="block space-y-1.5 text-xs font-semibold text-[#344054]">Custom expense type<input value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} required maxLength={80} className="salon-input w-full text-sm" placeholder="Enter expense type" /></label>}
        <label className="block space-y-1.5 text-xs font-semibold text-[#344054]">Description (optional)<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} maxLength={240} className="salon-input w-full text-sm" placeholder="e.g. November bill or product restock" /></label>
        <div className="grid grid-cols-2 gap-3"><label className="block space-y-1.5 text-xs font-semibold text-[#344054]">Amount (KSh)<input type="number" min="1" step="1" required value={form.amount_ksh} onChange={(event) => setForm({ ...form, amount_ksh: event.target.value })} className="salon-input w-full text-sm" placeholder="0" /></label><label className="block space-y-1.5 text-xs font-semibold text-[#344054]">Date<input type="date" required value={form.expense_date} onChange={(event) => setForm({ ...form, expense_date: event.target.value })} className="salon-input w-full text-sm" /></label></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-700">{error}</p>}<button disabled={busy} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#6D28D9] text-sm font-semibold text-white disabled:opacity-60">{editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}{busy ? 'Saving...' : editingId ? 'Save changes' : 'Add expense'}</button>
      </form>
      <div className="salon-card overflow-hidden rounded-2xl"><div className="flex items-center justify-between border-b border-[#E1E7F0] px-5 py-4"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#EDE9FE] text-[#6D28D9]"><ReceiptText className="h-5 w-5" /></span><div><h2 className="font-serif-editorial text-xl font-semibold text-[#14213D]">Expense register</h2><p className="text-xs text-[#667085]">{expenses.length} entries · {formatKsh(total)} recorded</p></div></div></div>
        {loading ? <p className="p-8 text-center text-sm text-[#667085]">Loading expenses…</p> : expenses.length ? <div className="divide-y divide-[#E1E7F0]">{expenses.map((expense) => <div key={expense.id} className="flex items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[#14213D]">{expense.category}{expense.description ? ` · ${expense.description}` : ''}</p><p className="mt-1 text-xs text-[#667085]">{expense.expense_date} · entered by {expense.created_by_name}</p></div><div className="flex shrink-0 items-center gap-3"><span className="text-sm font-bold text-[#14213D]">{formatKsh(expense.amount_ksh)}</span><button type="button" onClick={() => edit(expense)} className="rounded-lg border border-[#E1E7F0] px-3 py-2 text-xs font-semibold text-[#344054] hover:bg-[#F4F7FC]">Edit</button></div></div>)}</div> : <p className="p-8 text-center text-sm text-[#667085]">No expenses entered yet.</p>}</div>
    </div>
  </div>;
}
