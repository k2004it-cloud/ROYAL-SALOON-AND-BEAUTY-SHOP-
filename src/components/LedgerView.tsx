import { useState } from 'react';
import { Download, Eye, Ban, X } from 'lucide-react';
import type { DailyAnalytics, PaymentMethod, Ticket } from '../types';
import { formatKsh, salonApi } from '../api/client';
import { StatusBadge } from './StatusBadge';
import { StylistAvatar } from './StylistAvatar';

interface LedgerViewProps {
  date: string;
  analytics: DailyAnalytics;
  tickets: Ticket[];
  onVoidTicket: (ticketId: string) => Promise<void>;
}

export function LedgerView({
  date,
  analytics,
  tickets,
  onVoidTicket,
}: LedgerViewProps) {
  const [inspectTicket, setInspectTicket] = useState<Ticket | null>(null);
  const [confirmVoidId, setConfirmVoidId] = useState<string>('');
  const [voiding, setVoiding] = useState(false);

  const paymentMethods: PaymentMethod[] = ['M-Pesa', 'Card', 'Cash'];
  const maxMethodRevenue = Math.max(
    1,
    ...paymentMethods.map((m) => analytics.payment_breakdown[m] || 0)
  );

  const handleConfirmVoid = async (ticketId: string) => {
    setVoiding(true);
    try {
      await onVoidTicket(ticketId);
      setConfirmVoidId('');
      setInspectTicket(null);
    } finally {
      setVoiding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif-editorial text-3xl font-semibold tracking-tight text-[#151C27]">
            Financial Ledger
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            Daily sales settlement, tender reconciliation, and stylist commissions for {date}
          </p>
        </div>

        <a
          href={salonApi.exportLedgerUrl(date)}
          download
          className="h-11 px-5 rounded-lg bg-[#1E152A] hover:bg-[#120D1A] text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Download className="h-4 w-4" />
          Download CSV
        </a>
      </div>

      {/* 4-Column KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="salon-card rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Gross Settled Revenue</p>
          <p className="tabular-ksh text-2xl font-bold text-[#151C27] mt-2">
            {formatKsh(analytics.gross_revenue_ksh)}
          </p>
        </div>
        <div className="salon-card rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Settled Tickets</p>
          <p className="tabular-ksh text-2xl font-bold text-[#151C27] mt-2">
            {analytics.settled_tickets}
          </p>
        </div>
        <div className="salon-card rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Average Ticket</p>
          <p className="tabular-ksh text-2xl font-bold text-[#151C27] mt-2">
            {formatKsh(analytics.avg_ticket_ksh)}
          </p>
        </div>
        <div className="salon-card rounded-2xl p-5">
          <p className="text-xs font-semibold text-[#6B7280]">Stylist Commissions</p>
          <p className="tabular-ksh text-2xl font-bold text-[#6D28D9] mt-2">
            {formatKsh(analytics.total_commissions_ksh)}
          </p>
        </div>
      </div>

      {/* Tender Mix & Stylist Commission Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 salon-card rounded-2xl p-5 space-y-4">
          <h2 className="font-serif-editorial text-xl font-semibold text-[#151C27]">
            Tender Reconciliation
          </h2>
          <div className="space-y-4">
            {paymentMethods.map((method) => {
              const amount = analytics.payment_breakdown[method] || 0;
              const pct = Math.round((amount / maxMethodRevenue) * 100);
              return (
                <div key={method} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#151C27]">{method}</span>
                    <span className="tabular-ksh font-bold text-[#151C27]">
                      {formatKsh(amount)}
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-[#F3F4F6] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#6D28D9] transition-all duration-300"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="lg:col-span-7 salon-card rounded-2xl p-5 space-y-4">
          <h2 className="font-serif-editorial text-xl font-semibold text-[#151C27]">
            Stylist Commission Breakdown
          </h2>
          <div className="divide-y divide-[#E5E7EB]">
            {analytics.stylist_leaderboard.map((row) => (
              <div
                key={row.stylist_id}
                className="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <StylistAvatar src={row.avatar_url} name={row.name} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#151C27] truncate">
                      {row.name}
                    </p>
                    <p className="text-xs text-[#6B7280] tabular-ksh">
                      {row.services_count} items · {Math.round(row.commission_rate * 100)}% service rate
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="tabular-ksh text-sm font-bold text-[#151C27]">
                    {formatKsh(row.revenue_ksh)}
                  </p>
                  <p className="tabular-ksh text-xs font-semibold text-[#6D28D9]">
                    Comm: {formatKsh(row.commission_ksh)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      <div className="salon-card rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <h2 className="font-serif-editorial text-xl font-semibold text-[#151C27]">
            Ticket Register
          </h2>
          <span className="text-xs font-semibold text-[#6B7280] tabular-ksh">
            {tickets.length} transactions
          </span>
        </div>

        {tickets.length === 0 ? (
          <div className="p-10 text-center">
            <p className="text-sm font-semibold text-[#151C27]">No tickets settled for this date</p>
            <p className="text-xs text-[#6B7280] mt-1">
              Settle a client ticket in Point of Sale to populate the register.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#F9FAFB] border-b border-[#E5E7EB] text-xs font-semibold text-[#6B7280]">
                  <th className="py-3 px-5">Ticket #</th>
                  <th className="py-3 px-5">Client</th>
                  <th className="py-3 px-5">Tender</th>
                  <th className="py-3 px-5">Status</th>
                  <th className="py-3 px-5 text-right">Total</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5E7EB] text-sm">
                {tickets.map((tkt) => (
                  <tr key={tkt.id} className="hover:bg-[#F9FAFB] transition-colors">
                    <td className="py-3.5 px-5 font-semibold text-[#151C27] tabular-ksh whitespace-nowrap">
                      {tkt.ticket_number}
                    </td>
                    <td className="py-3.5 px-5">
                      <p className="font-semibold text-[#151C27]">{tkt.client_name}</p>
                      <p className="text-xs text-[#6B7280]">
                        {tkt.items.map((i) => `${i.quantity}x ${i.item_name}`).join(', ')}
                      </p>
                    </td>
                    <td className="py-3.5 px-5 text-xs font-semibold text-[#4A4455] whitespace-nowrap">
                      {tkt.payment_method}
                    </td>
                    <td className="py-3.5 px-5 whitespace-nowrap">
                      <StatusBadge status={tkt.status} />
                    </td>
                    <td className="py-3.5 px-5 text-right tabular-ksh font-bold text-[#151C27] whitespace-nowrap">
                      {formatKsh(tkt.total_ksh)}
                    </td>
                    <td className="py-3.5 px-5 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setInspectTicket(tkt)}
                        className="h-9 px-3 rounded-lg border border-[#E5E7EB] bg-white hover:bg-[#F9FAFB] text-xs font-semibold text-[#151C27] inline-flex items-center gap-1.5"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ticket Inspection & Void Modal */}
      {inspectTicket && (
        <div className="fixed inset-0 z-50 bg-[#120D1A]/50 flex items-center justify-center p-4">
          <div className="salon-sheet rounded-2xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-start justify-between border-b border-[#E5E7EB] pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h3 className="font-serif-editorial text-xl font-semibold text-[#151C27]">
                    {inspectTicket.ticket_number}
                  </h3>
                  <StatusBadge status={inspectTicket.status} />
                </div>
                <p className="text-xs text-[#6B7280] mt-1">
                  {inspectTicket.client_name} · {inspectTicket.payment_method}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setInspectTicket(null);
                  setConfirmVoidId('');
                }}
                aria-label="Close ticket detail"
                className="h-9 w-9 rounded-lg flex items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-2 text-xs">
              {inspectTicket.items.map((it) => (
                <div key={it.id} className="flex justify-between gap-2 py-1 border-b border-[#E5E7EB]/60">
                  <div>
                    <p className="font-semibold text-[#151C27]">
                      {it.quantity}x {it.item_name}
                    </p>
                    <p className="text-[#6B7280]">
                      {it.stylist_name || 'Studio'} · Comm: {formatKsh(it.commission_ksh)}
                    </p>
                  </div>
                  <span className="tabular-ksh font-bold text-[#151C27]">
                    {formatKsh(it.line_total_ksh)}
                  </span>
                </div>
              ))}
            </div>

            <div className="space-y-1 text-xs pt-1">
              <div className="flex justify-between text-[#6B7280]">
                <span>Subtotal</span>
                <span className="tabular-ksh">{formatKsh(inspectTicket.subtotal_ksh)}</span>
              </div>
              {inspectTicket.discount_ksh > 0 && (
                <div className="flex justify-between text-[#047857]">
                  <span>Discount</span>
                  <span className="tabular-ksh">- {formatKsh(inspectTicket.discount_ksh)}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[#151C27] pt-2 border-t border-[#E5E7EB]">
                <span>Total</span>
                <span className="tabular-ksh">{formatKsh(inspectTicket.total_ksh)}</span>
              </div>
            </div>

            {inspectTicket.status === 'Paid' && (
              <div className="pt-2 border-t border-[#E5E7EB]">
                {confirmVoidId === inspectTicket.id ? (
                  <div className="space-y-2.5">
                    <p className="text-xs font-semibold text-[#B91C1C]">
                      Voiding restores retail stock and reverses client spend. Confirm?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmVoidId('')}
                        className="flex-1 h-10 rounded-lg border border-[#E5E7EB] text-xs font-semibold text-[#151C27]"
                      >
                        Keep Ticket
                      </button>
                      <button
                        type="button"
                        disabled={voiding}
                        onClick={() => handleConfirmVoid(inspectTicket.id)}
                        className="flex-1 h-10 rounded-lg bg-[#EF4444] text-white text-xs font-semibold disabled:opacity-60"
                      >
                        {voiding ? 'Voiding...' : 'Confirm Void'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmVoidId(inspectTicket.id)}
                    className="w-full h-10 rounded-lg border border-[#EF4444] text-[#EF4444] text-xs font-semibold hover:bg-[#FEF2F2] inline-flex items-center justify-center gap-1.5"
                  >
                    <Ban className="h-3.5 w-3.5" />
                    Void Ticket
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
