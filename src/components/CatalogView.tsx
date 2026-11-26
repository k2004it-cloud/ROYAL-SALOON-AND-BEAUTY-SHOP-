import { useMemo, useState } from 'react';
import { Plus, Minus, X, AlertTriangle } from 'lucide-react';
import type { CatalogItem } from '../types';
import { formatKsh } from '../api/client';
import { StatusBadge } from './StatusBadge';

interface CatalogViewProps {
  initialTab?: 'service' | 'product';
  catalog: CatalogItem[];
  onCreateItem: (payload: {
    kind: 'service' | 'product';
    category: string;
    name: string;
    description: string;
    price_ksh: number;
    commission_rate?: number;
    duration_min: number;
    stock_qty: number;
  }) => Promise<void>;
  onUpdateCommissionRate: (id: string, commissionRate: number) => Promise<void>;
  onAdjustStock: (id: string, stockDelta: number) => Promise<void>;
}

const SERVICE_CATEGORIES = [
  'Hair & Styling',
  'Color & Treatment',
  'Nails & Atelier',
  'Grooming',
];

export function CatalogView({
  initialTab = 'service',
  catalog,
  onCreateItem,
  onUpdateCommissionRate,
  onAdjustStock,
}: CatalogViewProps) {
  const [tab, setTab] = useState<'service' | 'product'>(initialTab);
  const [modalOpen, setModalOpen] = useState(false);

  const [kind, setKind] = useState<'service' | 'product'>('service');
  const [category, setCategory] = useState('Hair & Styling');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceKsh, setPriceKsh] = useState('3500');
  const [durationMin, setDurationMin] = useState('60');
  const [commissionRate, setCommissionRate] = useState('35');
  const [commissionDrafts, setCommissionDrafts] = useState<Record<string, string>>({});
  const [savingCommissionFor, setSavingCommissionFor] = useState('');
  const [commissionError, setCommissionError] = useState('');
  const [stockQty, setStockQty] = useState('12');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const items = useMemo(
    () => catalog.filter((item) => item.kind === tab),
    [catalog, tab]
  );

  const lowStockItems = useMemo(
    () => catalog.filter((item) => item.kind === 'product' && item.stock_qty <= 5),
    [catalog]
  );

  const openModal = (defaultKind: 'service' | 'product') => {
    setKind(defaultKind);
    setCategory(defaultKind === 'service' ? 'Hair & Styling' : 'Retail Products');
    setName('');
    setDescription('');
    setPriceKsh('3500');
    setDurationMin('60');
    setCommissionRate('35');
    setStockQty('12');
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      await onCreateItem({
        kind,
        category: kind === 'product' ? 'Retail Products' : category,
        name,
        description,
        price_ksh: Number(priceKsh),
        commission_rate: kind === 'service' ? Number(commissionRate) : undefined,
        duration_min: kind === 'service' ? Number(durationMin) : 0,
        stock_qty: kind === 'product' ? Number(stockQty) : 0,
      });
      setTab(kind);
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to add item.');
    } finally {
      setSaving(false);
    }
  };

  const saveCommissionRate = async (item: CatalogItem) => {
    const rate = Number(commissionDrafts[item.id] ?? item.commission_rate * 100);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      setCommissionError('Service commission must be between 0 and 100%.');
      return;
    }
    setCommissionError('');
    setSavingCommissionFor(item.id);
    try {
      await onUpdateCommissionRate(item.id, rate);
      setCommissionDrafts((current) => ({ ...current, [item.id]: String(rate) }));
    } catch (error) {
      setCommissionError(error instanceof Error ? error.message : 'Unable to update service commission.');
    } finally {
      setSavingCommissionFor('');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563EB]">
            {tab === 'service' ? 'Atelier Menu' : 'Stock Management'}
          </p>
          <h1 className="font-serif-editorial text-3xl font-semibold tracking-tight text-[#14213D]">
            {tab === 'service' ? 'Services & Products' : 'Inventory'}
          </h1>
          <p className="text-sm text-[#667085] mt-1">
            {tab === 'service'
              ? 'Manage salon service rates, durations, and available products'
              : 'Review product quantities, low-stock alerts, and stock adjustments'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => openModal(tab)}
          className="h-11 px-5 rounded-lg bg-gradient-to-r from-[#0D6EFD] to-[#0B5ED7] text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 shadow-[0_10px_22px_-12px_rgba(13,110,253,0.28)]"
        >
          <Plus className="h-4 w-4" />
          {tab === 'service' ? 'Add Service' : 'Add Retail Product'}
        </button>
      </div>

      {/* Low Stock Advisory Banner */}
      {lowStockItems.length > 0 && (
        <div className="rounded-xl bg-[#FFFBEB] border border-[#FDE68A] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 text-xs font-semibold text-[#B45309]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>
              {lowStockItems.length} retail product{lowStockItems.length > 1 ? 's' : ''} below
              reorder threshold ({lowStockItems.map((i) => i.name).join(', ')})
            </span>
          </div>
          {tab !== 'product' && (
            <button
              type="button"
              onClick={() => setTab('product')}
              className="text-xs font-bold text-[#B45309] underline"
            >
              Review Stock
            </button>
          )}
        </div>
      )}

      {/* Segmented Switch */}
      <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white border border-[#E1E7F0]">
        <button
          type="button"
          onClick={() => setTab('service')}
          className={`h-10 px-4 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'service'
              ? 'bg-[#EDE9FE] text-[#6D28D9]'
              : 'text-[#344054] hover:bg-[#F4F7FC]'
          }`}
        >
          Service Menu ({catalog.filter((i) => i.kind === 'service').length})
        </button>
        <button
          type="button"
          onClick={() => setTab('product')}
          className={`h-10 px-4 rounded-lg text-xs font-semibold transition-colors ${
            tab === 'product'
              ? 'bg-[#EDE9FE] text-[#6D28D9]'
              : 'text-[#344054] hover:bg-[#F4F7FC]'
          }`}
        >
          Retail Stock ({catalog.filter((i) => i.kind === 'product').length})
        </button>
      </div>

      {commissionError && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{commissionError}</p>}

      {/* Table */}
      <div className="salon-card rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#F4F7FC] border-b border-[#E1E7F0] text-xs font-semibold text-[#667085]">
                <th className="py-3.5 px-5">SKU</th>
                <th className="py-3.5 px-5">Name & Notes</th>
                <th className="py-3.5 px-5">Category</th>
                <th className="py-3.5 px-5 text-right">
                  {tab === 'service' ? 'Duration' : 'On Hand'}
                </th>
                <th className="py-3.5 px-5 text-right">Unit Price</th>
                {tab === 'service' && <th className="py-3.5 px-5 text-right">Commission</th>}
                {tab === 'product' && <th className="py-3.5 px-5 text-right">Adjust Stock</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E1E7F0] text-sm">
              {items.map((item) => {
                const isLow = item.kind === 'product' && item.stock_qty <= 5;
                return (
                  <tr key={item.id} className="hover:bg-[#F4F7FC] transition-colors">
                    <td className="py-3.5 px-5 text-xs font-semibold text-[#667085] tabular-ksh whitespace-nowrap">
                      {item.sku}
                    </td>
                    <td className="py-3.5 px-5">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-semibold text-[#14213D]">{item.name}</span>
                        {isLow && <StatusBadge status="Low Stock" />}
                      </div>
                      {item.description && (
                        <p className="text-xs text-[#667085] mt-0.5">{item.description}</p>
                      )}
                    </td>
                    <td className="py-3.5 px-5 text-xs font-medium text-[#344054] whitespace-nowrap">
                      {item.category}
                    </td>
                    <td className="py-3.5 px-5 text-right tabular-ksh font-semibold text-[#14213D] whitespace-nowrap">
                      {tab === 'service'
                        ? `${item.duration_min} mins`
                        : `${item.stock_qty} units`}
                    </td>
                    <td className="py-3.5 px-5 text-right tabular-ksh font-bold text-[#14213D] whitespace-nowrap">
                      {formatKsh(item.price_ksh)}
                    </td>
                    {tab === 'service' && <td className="py-3 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center justify-end gap-2">
                        <input aria-label={`Commission rate for ${item.name}`} type="number" min="0" max="100" step="0.1" value={commissionDrafts[item.id] ?? String(Number((item.commission_rate * 100).toFixed(2)))} onChange={(event) => setCommissionDrafts((current) => ({ ...current, [item.id]: event.target.value }))} className="salon-input h-9 w-24 px-2 text-right text-xs" />
                        <span className="text-xs text-[#64748B]">%</span>
                        <button type="button" onClick={() => void saveCommissionRate(item)} disabled={savingCommissionFor === item.id} className="h-9 rounded-lg border border-[#DDE6F1] px-3 text-[10px] font-bold text-[#0B5ED7] disabled:opacity-50">{savingCommissionFor === item.id ? 'Saving…' : 'Save'}</button>
                      </div>
                    </td>}
                    {tab === 'product' && (
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => onAdjustStock(item.id, -1)}
                            disabled={item.stock_qty <= 0}
                            aria-label={`Decrease stock for ${item.name}`}
                            className="h-9 w-9 rounded-lg border border-[#E1E7F0] bg-white hover:bg-[#F4F7FC] flex items-center justify-center text-[#14213D] disabled:opacity-40"
                          >
                            <Minus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => onAdjustStock(item.id, 5)}
                            className="h-9 px-3 rounded-lg bg-[#EDE9FE] hover:bg-[#DDD6FE] text-[#6D28D9] text-xs font-bold tabular-ksh"
                          >
                            +5 Restock
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Catalog Item Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#071426]/50 flex items-center justify-center p-4">
          <div className="salon-sheet rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E1E7F0] pb-4">
              <h2 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">
                {kind === 'service' ? 'Add Salon Service' : 'Add Retail Product'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close modal"
                className="h-10 w-10 rounded-lg flex items-center justify-center text-[#667085] hover:bg-[#F1F4F9]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {formError && (
              <p className="text-xs font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-3">
                {formError}
              </p>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setKind('service')}
                  className={`h-11 rounded-lg text-xs font-semibold border ${
                    kind === 'service'
                      ? 'bg-[#EDE9FE] border-[#6D28D9] text-[#6D28D9]'
                      : 'bg-white border-[#E1E7F0] text-[#14213D]'
                  }`}
                >
                  Service
                </button>
                <button
                  type="button"
                  onClick={() => setKind('product')}
                  className={`h-11 rounded-lg text-xs font-semibold border ${
                    kind === 'product'
                      ? 'bg-[#EDE9FE] border-[#6D28D9] text-[#6D28D9]'
                      : 'bg-white border-[#E1E7F0] text-[#14213D]'
                  }`}
                >
                  Retail Product
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                  Item Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="salon-input w-full px-3 text-sm text-[#14213D]"
                />
              </div>

              {kind === 'service' && (
                <div>
                  <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                    Service Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="salon-input w-full px-3 text-sm text-[#14213D]"
                  >
                    {SERVICE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {kind === 'service' && <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1.5">Employee commission (%)</label>
                <input type="number" min="0" max="100" step="0.1" value={commissionRate} onChange={(event) => setCommissionRate(event.target.value)} required className="salon-input w-full px-3 text-sm text-[#14213D]" />
                <p className="mt-1 text-[10px] text-[#64748B]">Commission is calculated automatically for the employee assigned to each paid service.</p>
              </div>}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                    Price (KSh)
                  </label>
                  <div className="flex items-center salon-input px-3">
                    <span className="text-xs font-semibold text-[#667085] mr-2">KSh</span>
                    <input
                      type="number"
                      min={1}
                      value={priceKsh}
                      onChange={(e) => setPriceKsh(e.target.value)}
                      required
                      className="w-full bg-transparent text-sm font-bold text-[#14213D] tabular-ksh focus:outline-none"
                    />
                  </div>
                </div>

                {kind === 'service' ? (
                  <div>
                    <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                      Duration (minutes)
                    </label>
                    <input
                      type="number"
                      min={15}
                      step={15}
                      value={durationMin}
                      onChange={(e) => setDurationMin(e.target.value)}
                      required
                      className="salon-input w-full px-3 text-sm text-[#14213D] tabular-ksh"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                      Initial Stock
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={stockQty}
                      onChange={(e) => setStockQty(e.target.value)}
                      required
                      className="salon-input w-full px-3 text-sm text-[#14213D] tabular-ksh"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#344054] mb-1.5">
                  Description
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Short service protocol or bottle size"
                  className="salon-input w-full px-3 text-sm text-[#14213D]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-11 px-4 rounded-lg border border-[#E1E7F0] bg-white text-sm font-semibold text-[#14213D]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 px-5 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
