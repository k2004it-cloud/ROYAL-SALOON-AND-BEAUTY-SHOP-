import { useMemo, useState } from 'react';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle2,
  X,
  Delete,
} from 'lucide-react';
import type {
  CartLine,
  CatalogItem,
  Client,
  PaymentMethod,
  Stylist,
  Ticket,
} from '../types';
import { formatKsh } from '../api/client';
import { StylistAvatar } from './StylistAvatar';

interface PosViewProps {
  catalog: CatalogItem[];
  clients: Client[];
  stylists: Stylist[];
  cart: CartLine[];
  selectedClientId: string;
  linkedAppointmentId: string;
  businessDate: string;
  onSelectClient: (clientId: string) => void;
  onAddToCart: (item: CatalogItem) => void;
  onUpdateLineQty: (uid: string, delta: number) => void;
  onUpdateLineStylist: (uid: string, stylistId: string) => void;
  onRemoveLine: (uid: string) => void;
  onClearCart: () => void;
  onCheckout: (payload: {
    client_id: string;
    client_name: string;
    appointment_id?: string;
    payment_method: PaymentMethod;
    tip_ksh: number;
    tip_stylist_id: string;
    discount_type: 'none' | 'percent' | 'fixed';
    discount_value: number;
    tendered_ksh: number;
    business_date: string;
    items: Array<{ catalog_item_id: string; quantity: number; stylist_id: string }>;
  }) => Promise<Ticket>;
}

const CATEGORIES = [
  'All',
  'Hair & Styling',
  'Color & Treatment',
  'Nails & Atelier',
  'Grooming',
  'Retail Products',
];

const QUICK_CASH_VALUES = [2000, 5000, 10000];

export function PosView({
  catalog,
  clients,
  stylists,
  cart,
  selectedClientId,
  linkedAppointmentId,
  businessDate,
  onSelectClient,
  onAddToCart,
  onUpdateLineQty,
  onUpdateLineStylist,
  onRemoveLine,
  onClearCart,
  onCheckout,
}: PosViewProps) {
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [discountType, setDiscountType] = useState<'none' | 'percent' | 'fixed'>('none');
  const [discountValue, setDiscountValue] = useState<number>(0);
  const [tipInput, setTipInput] = useState<string>('0');
  const [tipStylistId, setTipStylistId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('M-Pesa');
  const [tenderInput, setTenderInput] = useState<string>('');
  const [showNumpad, setShowNumpad] = useState<boolean>(false);
  const [settling, setSettling] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [receiptTicket, setReceiptTicket] = useState<Ticket | null>(null);

  const filteredCatalog = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      const catMatch = activeCategory === 'All' || item.category === activeCategory;
      const textMatch =
        !q ||
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        item.sku.toLowerCase().includes(q);
      return catMatch && textMatch;
    });
  }, [catalog, activeCategory, searchQuery]);

  const subtotalKsh = useMemo(
    () => cart.reduce((acc, line) => acc + line.unit_price_ksh * line.quantity, 0),
    [cart]
  );

  const discountKsh = useMemo(() => {
    if (discountType === 'percent') {
      return Math.round((subtotalKsh * Math.min(Math.max(discountValue, 0), 100)) / 100);
    }
    if (discountType === 'fixed') {
      return Math.min(Math.round(Math.max(discountValue, 0)), subtotalKsh);
    }
    return 0;
  }, [subtotalKsh, discountType, discountValue]);

  const totalKsh = Math.max(0, subtotalKsh - discountKsh);
  const tipKsh = Math.max(0, Math.round(Number(tipInput) || 0));
  const totalWithTipKsh = totalKsh + tipKsh;
  const vatIncludedKsh = Math.round((totalKsh * 16) / 116);
  const tenderedKsh =
    paymentMethod === 'Cash'
      ? Number(tenderInput || totalWithTipKsh)
      : totalWithTipKsh;
  const changeKsh = Math.max(0, tenderedKsh - totalWithTipKsh);

  const handleDigit = (digit: string) => {
    setTenderInput((prev) => {
      const next = prev === '0' ? digit : `${prev}${digit}`;
      return next.slice(0, 7);
    });
  };

  const handleSettle = async () => {
    if (cart.length === 0) return;
    setErrorMsg('');
    setSettling(true);
    try {
      const selectedClient = clients.find((c) => c.id === selectedClientId);
      const settled = await onCheckout({
        client_id: selectedClientId,
        client_name: selectedClient ? selectedClient.name : 'Walk-In Guest',
        appointment_id: linkedAppointmentId || undefined,
        payment_method: paymentMethod,
        tip_ksh: tipKsh,
        tip_stylist_id: tipStylistId || cart.find((line) => line.kind === 'service')?.stylist_id || '',
        discount_type: discountType,
        discount_value: discountValue,
        tendered_ksh: tenderedKsh,
        business_date: businessDate,
        items: cart.map((line) => ({
          catalog_item_id: line.catalog_item_id,
          quantity: line.quantity,
          stylist_id: line.stylist_id,
        })),
      });
      setReceiptTicket(settled);
      setDiscountType('none');
      setDiscountValue(0);
      setTipInput('0');
      setTipStylistId('');
      setTenderInput('');
      setShowNumpad(false);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Unable to settle ticket.');
    } finally {
      setSettling(false);
    }
  };

  return (
    <div className="flex flex-col xl:flex-row gap-6 items-start">
      {/* Left Touch-First Catalog Panel */}
      <div className="flex-1 min-w-0 w-full space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563EB]">Express Checkout</p>
            <h1 className="font-serif-editorial text-3xl font-semibold tracking-tight text-[#14213D]">
              Point of Sale
            </h1>
            <p className="text-sm text-[#667085] mt-1">
              Tap services or retail items to build the client ticket
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search service, retail, SKU..."
              className="salon-input w-full pl-10 pr-3 text-sm text-[#14213D]"
            />
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((category) => {
            const active = activeCategory === category;
            return (
              <button
                key={category}
                type="button"
                onClick={() => setActiveCategory(category)}
                className={`h-11 px-4 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 transition-colors border ${
                  active
                    ? 'bg-[#EDE9FE] text-[#6D28D9] border-[#DDD6FE]'
                    : 'bg-white text-[#344054] border-[#E1E7F0] hover:bg-[#F4F7FC]'
                }`}
              >
                {category}
              </button>
            );
          })}
        </div>

        {/* Touch Service & Product Grid */}
        {filteredCatalog.length === 0 ? (
          <div className="salon-card rounded-2xl p-10 text-center">
            <p className="text-sm font-semibold text-[#14213D]">No matching catalog items</p>
            <p className="text-xs text-[#667085] mt-1">
              Clear your search filter or switch categories to view services.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCatalog.map((item) => {
              const outOfStock = item.kind === 'product' && item.stock_qty <= 0;
              return (
                <button
                  key={item.id}
                  type="button"
                  disabled={outOfStock}
                  onClick={() => onAddToCart(item)}
                  className="salon-card rounded-2xl p-4 text-left hover:border-[#6D28D9] active:scale-[0.98] transition-all flex flex-col justify-between min-h-[124px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs text-[#667085]">
                      <span className="truncate">{item.category}</span>
                      <span className="tabular-ksh shrink-0">
                        {item.kind === 'service'
                          ? `${item.duration_min} min`
                          : `${item.stock_qty} in stock`}
                      </span>
                    </div>
                    <p className="text-[15px] font-semibold text-[#14213D] mt-1.5 leading-snug">
                      {item.name}
                    </p>
                    <p className="text-xs text-[#667085] mt-1 line-clamp-2">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 mt-3 border-t border-[#E1E7F0]/70">
                    <span className="tabular-ksh text-base font-bold text-[#14213D]">
                      {formatKsh(item.price_ksh)}
                    </span>
                    <span className="h-9 w-9 rounded-lg bg-[#EDE9FE] text-[#6D28D9] flex items-center justify-center">
                      <Plus className="h-4 w-4" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Contextual Running Ticket Drawer (380px on desktop) */}
      <aside className="w-full xl:w-[380px] shrink-0 salon-card rounded-2xl overflow-hidden xl:sticky xl:top-6">
        {/* Deep Plum Drawer Header */}
        <div className="bg-[#071426] text-white p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-serif-editorial text-xl font-semibold text-white">
                Running Ticket
              </h2>
              <p className="text-xs text-[#D5E4FF]/80 mt-0.5">
                {cart.reduce((s, l) => s + l.quantity, 0)} items ·{' '}
                {linkedAppointmentId ? 'Linked Appointment' : 'Walk-In / Studio'}
              </p>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={onClearCart}
                className="h-9 px-3 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-semibold text-white"
              >
                Clear
              </button>
            )}
          </div>

          <select
            value={selectedClientId}
            onChange={(e) => onSelectClient(e.target.value)}
            aria-label="Select client for ticket"
            className="w-full h-11 rounded-lg bg-[#071426] border border-white/15 px-3 text-sm font-medium text-white focus:outline-none focus:border-[#7C3AED]"
          >
            <option value="">Walk-In Guest</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} — {c.phone}
              </option>
            ))}
          </select>
          {linkedAppointmentId && (
            <p className="text-[11px] font-medium text-[#D5E4FF]/80">
              Appointment service and stylist are preloaded. Add retail items or a tip below.
            </p>
          )}
        </div>

        {/* Scrollable Itemized Lines */}
        <div className="p-4 max-h-[300px] overflow-y-auto divide-y divide-[#E1E7F0]">
          {cart.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-[#14213D]">Ticket is empty</p>
              <p className="text-xs text-[#667085] mt-1">
                Select services or retail items on the left to begin checkout.
              </p>
            </div>
          ) : (
            cart.map((line) => (
              <div key={line.uid} className="py-3 first:pt-0 last:pb-0 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#14213D] truncate">
                      {line.name}
                    </p>
                    <p className="text-xs text-[#667085] tabular-ksh">
                      {formatKsh(line.unit_price_ksh)} each
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="tabular-ksh text-sm font-bold text-[#14213D]">
                      {formatKsh(line.unit_price_ksh * line.quantity)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveLine(line.uid)}
                      aria-label={`Remove ${line.name}`}
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-[#667085] hover:text-[#EF4444] hover:bg-[#FEF2F2]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <select
                    value={line.stylist_id}
                    onChange={(e) => onUpdateLineStylist(line.uid, e.target.value)}
                    aria-label={`Stylist for ${line.name}`}
                    className="h-9 flex-1 rounded-lg border border-[#E1E7F0] bg-[#F4F7FC] px-2 text-xs font-medium text-[#14213D]"
                  >
                    <option value="">Studio / Unattributed</option>
                    {stylists.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>

                  <div className="inline-flex items-center border border-[#E1E7F0] rounded-lg bg-white">
                    <button
                      type="button"
                      onClick={() => onUpdateLineQty(line.uid, -1)}
                      aria-label="Decrease quantity"
                      className="h-9 w-9 flex items-center justify-center text-[#14213D] hover:bg-[#F4F7FC]"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <span className="w-7 text-center text-xs font-bold tabular-ksh">
                      {line.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() => onUpdateLineQty(line.uid, 1)}
                      aria-label="Increase quantity"
                      className="h-9 w-9 flex items-center justify-center text-[#14213D] hover:bg-[#F4F7FC]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Discount, Tender & Checkout Summary */}
        <div className="p-4 border-t border-[#E1E7F0] bg-[#F4F7FC] space-y-4">
          <div className="space-y-2 rounded-xl border border-[#E1E7F0] bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#344054]">Optional stylist tip</span>
              <span className="tabular-ksh text-xs font-bold text-[#14213D]">{formatKsh(tipKsh)}</span>
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {[0, 5, 10].map((percent) => (
                <button
                  key={percent}
                  type="button"
                  onClick={() => setTipInput(String(Math.round((subtotalKsh * percent) / 100)))}
                  className="h-9 rounded-lg border border-[#E1E7F0] text-[11px] font-bold text-[#344054] hover:bg-[#F4F7FC]"
                >
                  {percent === 0 ? 'No tip' : `${percent}%`}
                </button>
              ))}
              <input
                type="number"
                min={0}
                step={50}
                value={tipInput}
                onChange={(event) => setTipInput(event.target.value)}
                aria-label="Custom tip amount in KSh"
                className="h-9 min-w-0 rounded-lg border border-[#E1E7F0] px-2 text-xs font-bold tabular-ksh"
              />
            </div>
            {tipKsh > 0 && (
              <select
                value={tipStylistId}
                onChange={(event) => setTipStylistId(event.target.value)}
                aria-label="Stylist receiving tip"
                className="salon-input w-full px-3 text-xs"
              >
                <option value="">Attribute to service stylist</option>
                {stylists.map((stylist) => (
                  <option key={stylist.id} value={stylist.id}>{stylist.name}</option>
                ))}
              </select>
            )}
          </div>
          {/* Quick Discount Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-[#344054]">
              <span>Discount</span>
              <div className="flex gap-1">
                {[
                  { label: 'None', type: 'none' as const, val: 0 },
                  { label: '10% VIP', type: 'percent' as const, val: 10 },
                  { label: '15% Promo', type: 'percent' as const, val: 15 },
                ].map((opt) => {
                  const active =
                    discountType === opt.type && discountValue === opt.val;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => {
                        setDiscountType(opt.type);
                        setDiscountValue(opt.val);
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors ${
                        active
                          ? 'bg-[#EDE9FE] text-[#6D28D9]'
                          : 'bg-white border border-[#E1E7F0] text-[#344054]'
                      }`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Payment Method Selector */}
          <div className="grid grid-cols-3 gap-2">
            {(['M-Pesa', 'Card', 'Cash'] as PaymentMethod[]).map((method) => {
              const active = paymentMethod === method;
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => {
                    setPaymentMethod(method);
                    if (method === 'Cash') setShowNumpad(true);
                    else setShowNumpad(false);
                  }}
                  className={`h-11 rounded-lg text-xs font-semibold border transition-colors ${
                    active
                      ? 'bg-[#EDE9FE] border-[#6D28D9] text-[#6D28D9]'
                      : 'bg-white border-[#E1E7F0] text-[#14213D] hover:bg-white/80'
                  }`}
                >
                  {method}
                </button>
              );
            })}
          </div>

          {/* Cash Touch Tiles & NumPad */}
          {paymentMethod === 'Cash' && (
            <div className="space-y-2.5 bg-white p-3 rounded-xl border border-[#E1E7F0]">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-[#344054]">Cash Tendered</span>
                <button
                  type="button"
                  onClick={() => setShowNumpad((v) => !v)}
                  className="text-[#6D28D9] font-semibold"
                >
                  {showNumpad ? 'Hide Keypad' : 'Show Keypad'}
                </button>
              </div>

              <div className="flex items-center h-11 rounded-lg border border-[#E1E7F0] px-3 bg-[#F4F7FC]">
                <span className="text-xs font-semibold text-[#667085] mr-2">KSh</span>
                <input
                  type="number"
                  value={tenderInput}
                  onChange={(e) => setTenderInput(e.target.value)}
                  placeholder={String(totalWithTipKsh)}
                  className="w-full bg-transparent text-sm font-bold text-[#14213D] tabular-ksh focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-4 gap-1.5">
                <button
                  type="button"
                  onClick={() => setTenderInput(String(totalWithTipKsh))}
                  className="h-10 rounded-lg bg-[#EDE9FE] text-[#6D28D9] text-[11px] font-bold"
                >
                  Exact
                </button>
                {QUICK_CASH_VALUES.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTenderInput(String(amt))}
                    className="h-10 rounded-lg bg-[#F4F7FC] border border-[#E1E7F0] text-[#14213D] text-[11px] font-bold tabular-ksh hover:bg-[#F1F4F9]"
                  >
                    {amt.toLocaleString('en-KE')}
                  </button>
                ))}
              </div>

              {showNumpad && (
                <div className="grid grid-cols-3 gap-1.5 pt-1">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => handleDigit(key)}
                      className="h-12 rounded-lg bg-[#F4F7FC] border border-[#E1E7F0] text-sm font-bold text-[#14213D] active:scale-95 tabular-ksh hover:bg-[#EDE9FE]/50"
                    >
                      {key}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setTenderInput((prev) => prev.slice(0, -1))}
                    aria-label="Backspace"
                    className="h-12 rounded-lg bg-[#F4F7FC] border border-[#E1E7F0] flex items-center justify-center text-[#14213D] active:scale-95"
                  >
                    <Delete className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-[#667085]">Change Due</span>
                <span className="tabular-ksh font-bold text-[#047857]">
                  {formatKsh(changeKsh)}
                </span>
              </div>
            </div>
          )}

          {/* Totals */}
          <div className="space-y-1.5 text-xs pt-1">
            <div className="flex justify-between text-[#667085]">
              <span>Subtotal</span>
              <span className="tabular-ksh font-semibold text-[#14213D]">
                {formatKsh(subtotalKsh)}
              </span>
            </div>
            {tipKsh > 0 && (
              <div className="flex justify-between text-[#6D28D9]">
                <span>Stylist tip</span>
                <span className="tabular-ksh font-semibold">{formatKsh(tipKsh)}</span>
              </div>
            )}
            {discountKsh > 0 && (
              <div className="flex justify-between text-[#047857]">
                <span>Discount Applied</span>
                <span className="tabular-ksh font-semibold">
                  - {formatKsh(discountKsh)}
                </span>
              </div>
            )}
            <div className="flex justify-between text-[#667085]">
              <span>16% VAT (Included)</span>
              <span className="tabular-ksh">{formatKsh(vatIncludedKsh)}</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-[#E1E7F0]">
              <span className="font-serif-editorial text-lg font-semibold text-[#14213D]">
                Total Due
              </span>
              <span className="tabular-ksh text-xl font-bold text-[#14213D]">
                {formatKsh(totalWithTipKsh)}
              </span>
            </div>
          </div>

          {errorMsg && (
            <p className="text-xs font-semibold text-[#B91C1C] bg-[#FEF2F2] border border-[#FECACA] rounded-lg p-2.5">
              {errorMsg}
            </p>
          )}

          <button
            type="button"
            disabled={cart.length === 0 || settling}
            onClick={handleSettle}
            className="w-full h-12 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] active:scale-[0.98] text-white text-sm font-semibold transition-all disabled:opacity-50"
          >
            {settling ? 'Processing Settlement...' : `Settle Ticket · ${formatKsh(totalWithTipKsh)}`}
          </button>
        </div>
      </aside>

      {/* Boutique Receipt Modal */}
      {receiptTicket && (
        <div className="fixed inset-0 z-50 bg-[#071426]/60 flex items-center justify-center p-4">
          <div className="salon-sheet rounded-2xl w-full max-w-md p-6 space-y-5 bg-white">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="h-6 w-6 text-[#10B981]" />
                <div>
                  <h3 className="font-serif-editorial text-xl font-semibold text-[#14213D]">
                    Payment Settled
                  </h3>
                  <p className="text-xs text-[#667085] tabular-ksh">
                    {receiptTicket.ticket_number} · {receiptTicket.payment_method}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReceiptTicket(null)}
                aria-label="Close receipt"
                className="h-9 w-9 rounded-lg flex items-center justify-center text-[#667085] hover:bg-[#F1F4F9] no-print"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-y border-dashed border-[#E1E7F0] py-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-[#667085]">Client</span>
                <span className="font-semibold text-[#14213D]">
                  {receiptTicket.client_name}
                </span>
              </div>
              <div className="space-y-1.5 pt-2">
                {receiptTicket.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2">
                    <span className="text-[#14213D]">
                      {it.quantity}x {it.item_name}
                      {it.stylist_name ? ` (${it.stylist_name.split(' ')[0]})` : ''}
                    </span>
                    <span className="tabular-ksh font-semibold text-[#14213D]">
                      {formatKsh(it.line_total_ksh)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5 text-xs">
              {receiptTicket.discount_ksh > 0 && (
                <div className="flex justify-between text-[#047857]">
                  <span>Discount</span>
                  <span className="tabular-ksh">- {formatKsh(receiptTicket.discount_ksh)}</span>
                </div>
              )}
              <div className="flex justify-between text-[#667085]">
                <span>VAT (16% Included)</span>
                <span className="tabular-ksh">{formatKsh(receiptTicket.tax_ksh)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-[#14213D] pt-1">
                <span>Total Paid</span>
                <span className="tabular-ksh">{formatKsh(receiptTicket.total_ksh)}</span>
              </div>
              {receiptTicket.change_ksh > 0 && (
                <div className="flex justify-between text-[#047857] font-semibold">
                  <span>Change Returned</span>
                  <span className="tabular-ksh">{formatKsh(receiptTicket.change_ksh)}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2 no-print">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex-1 h-11 rounded-lg border border-[#E1E7F0] bg-white text-sm font-semibold text-[#14213D] hover:bg-[#F4F7FC] inline-flex items-center justify-center gap-2"
              >
                <Printer className="h-4 w-4" />
                Print Receipt
              </button>
              <button
                type="button"
                onClick={() => setReceiptTicket(null)}
                className="flex-1 h-11 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-sm font-semibold"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
