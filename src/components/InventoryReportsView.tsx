import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, PackageSearch, RefreshCw } from 'lucide-react';
import type { InventoryReport } from '../types';
import { salonApi } from '../api/client';

function reportLabel(report: InventoryReport): string {
  if (report.report_type === 'low_stock') return 'Low stock';
  if (report.report_type === 'damaged') return 'Damaged';
  return 'Product usage';
}

export function InventoryReportsView() {
  const [reports, setReports] = useState<InventoryReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await salonApi.inventoryReports();
      setReports(result.reports);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load inventory reports.');
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

  const updateStatus = async (report: InventoryReport) => {
    setBusyId(report.id);
    setError('');
    try {
      await salonApi.updateInventoryReport(report.id, report.status === 'open' ? 'resolved' : 'open');
      await load();
      window.dispatchEvent(new Event('salon:workspace-updated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this inventory report.');
    } finally {
      setBusyId('');
    }
  };

  const openCount = reports.filter((report) => report.status === 'open').length;

  return (
    <section className="salon-card mt-4 overflow-hidden rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E1E7F0] px-5 py-4">
        <div><h2 className="flex items-center gap-2 text-lg font-bold text-[#14213D]"><PackageSearch className="h-5 w-5 text-[#0D6EFD]" />Staff inventory reports</h2><p className="mt-1 text-xs text-[#64748B]">{openCount} report{openCount === 1 ? '' : 's'} need review.</p></div>
        <button type="button" onClick={() => void load()} className="inline-flex h-9 items-center gap-2 rounded-lg border border-[#DDE6F1] px-3 text-xs font-bold text-[#344054]"><RefreshCw className="h-3.5 w-3.5" />Refresh</button>
      </div>
      {error && <p role="alert" className="bg-red-50 px-5 py-2 text-xs font-semibold text-red-700">{error}</p>}
      {loading ? <p className="px-5 py-8 text-center text-sm text-[#64748B]">Loading inventory reports…</p> : reports.length ? <div className="divide-y divide-[#E7ECF5]">
        {reports.map((report) => <article key={report.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
          <span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + (report.report_type === 'damaged' ? 'bg-red-100 text-red-700' : report.report_type === 'low_stock' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}><AlertTriangle className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-[#14213D]">{report.item_name}</h3><span className="rounded-full bg-[#F1F4F9] px-2 py-1 text-[9px] font-bold uppercase text-[#475467]">{reportLabel(report)}</span><span className="text-[10px] text-[#64748B]">{report.status}</span></div><p className="mt-1 text-xs text-[#475467]">{report.report_type === 'low_stock' ? `Current stock: ${report.quantity}` : `${report.quantity} unit${report.quantity === 1 ? '' : 's'}`}{report.note ? ` · ${report.note}` : ''}</p><p className="mt-1 text-[10px] text-[#667085]">Reported by {report.created_by_name} · {new Date(report.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })} · Stock now {report.stock_qty ?? '—'}</p></div>
          <button type="button" disabled={busyId === report.id} onClick={() => void updateStatus(report)} className={'inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold disabled:opacity-50 ' + (report.status === 'open' ? 'bg-emerald-600 text-white' : 'border border-[#DDE6F1] text-[#475467]')}><CheckCircle2 className="h-4 w-4" />{busyId === report.id ? 'Saving…' : report.status === 'open' ? 'Mark reviewed' : 'Reopen'}</button>
        </article>)}
      </div> : <p className="px-5 py-8 text-center text-sm text-[#64748B]">No staff inventory reports yet.</p>}
    </section>
  );
}
