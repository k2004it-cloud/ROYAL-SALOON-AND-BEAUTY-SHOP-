import { useEffect, useState } from 'react';
import { Activity, Database, LifeBuoy, PackageSearch, RefreshCw, Settings, ShieldCheck, UsersRound } from 'lucide-react';
import type { WorkspaceTab } from '../types';
import { salonApi } from '../api/client';

type Diagnostics = Awaited<ReturnType<typeof salonApi.superadminDiagnostics>>;

export function SuperadminView({ onNavigate }: { onNavigate: (tab: WorkspaceTab) => void }) {
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = async () => {
    setLoading(true); setError('');
    try { setDiagnostics(await salonApi.superadminDiagnostics()); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to run system checks.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void refresh(); }, []);
  const checks = diagnostics ? [
    { title: 'Application API', value: diagnostics.api_status === 'online' ? 'Online' : 'Check needed', detail: 'Authenticated diagnostic request succeeded.', Icon: Activity, good: diagnostics.api_status === 'online' },
    { title: 'Database', value: diagnostics.database_engine.toUpperCase(), detail: 'Database connection is responding.', Icon: Database, good: true },
    { title: 'Staff accounts', value: String(diagnostics.active_accounts), detail: 'Active accounts in this salon.', Icon: UsersRound, good: true },
    { title: 'Staff profile links', value: String(diagnostics.employees_without_stylist), detail: 'Active employees missing a stylist profile.', Icon: ShieldCheck, good: diagnostics.employees_without_stylist === 0 },
    { title: 'Low stock', value: String(diagnostics.low_stock_items), detail: 'Products at two items or fewer.', Icon: PackageSearch, good: diagnostics.low_stock_items === 0 },
    { title: 'Open support', value: String(diagnostics.open_support_requests), detail: 'Requests that still need attention.', Icon: LifeBuoy, good: diagnostics.open_support_requests === 0 },
  ] : [];
  const fixes: Array<{ label: string; detail: string; tab: WorkspaceTab; Icon: typeof Settings }> = [
    { label: 'Manage staff accounts', detail: 'Update staff access and stylist assignments.', tab: 'employees', Icon: UsersRound },
    { label: 'Review support requests', detail: 'Respond to staff questions and access problems.', tab: 'support', Icon: LifeBuoy },
    { label: 'Check system logs', detail: 'Review recent account and business changes.', tab: 'system-logs', Icon: Activity },
    { label: 'Open backup tools', detail: 'Review available database backup actions.', tab: 'backups', Icon: Database },
    { label: 'Business settings', detail: 'Correct contact details and opening hours.', tab: 'settings', Icon: Settings },
  ];
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563EB]">Owner tools · single salon</p><h1 className="font-serif-editorial text-3xl font-semibold text-[#14213D]">Superadmin</h1><p className="mt-1 text-sm text-[#667085]">Check salon system health and jump to common troubleshooting tools.</p></div><button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#DDE6F1] bg-white px-4 text-xs font-bold text-[#344054] hover:bg-[#F4F7FC] disabled:opacity-60"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />Refresh checks</button></div>
    {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{loading && !diagnostics ? <div className="salon-card rounded-2xl p-6 text-sm text-[#667085]">Running salon checks…</div> : checks.map(({ title, value, detail, Icon, good }) => <article key={title} className="salon-card flex items-start gap-4 rounded-2xl p-5"><span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}><Icon className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-semibold text-[#667085]">{title}</p><p className="mt-1 text-xl font-bold text-[#14213D]">{value}</p><p className="mt-1 text-xs text-[#667085]">{detail}</p></div></article>)}</section>
    {diagnostics && <p className="text-right text-[11px] text-[#667085]">Last checked {new Date(diagnostics.checked_at).toLocaleString('en-KE')}</p>}
    <section className="salon-card overflow-hidden rounded-2xl"><div className="border-b border-[#E1E7F0] px-5 py-4"><h2 className="font-serif-editorial text-xl font-semibold text-[#14213D]">Troubleshooting shortcuts</h2><p className="mt-1 text-xs text-[#667085]">Open the relevant salon page to review or correct an issue.</p></div><div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">{fixes.map(({ label, detail, tab, Icon }) => <button key={tab} type="button" onClick={() => onNavigate(tab)} className="rounded-xl border border-[#E1E7F0] bg-white p-4 text-left transition-colors hover:border-[#8FA8F5] hover:bg-[#F8FAFF]"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#E8F1FF] text-[#0B5ED7]"><Icon className="h-4 w-4" /></span><span className="mt-3 block text-sm font-bold text-[#14213D]">{label}</span><span className="mt-1 block text-xs leading-5 text-[#667085]">{detail}</span></button>)}</div></section>
  </div>;
}
