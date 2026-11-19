import { useMemo, useState } from 'react';
import { Plus, Search, X, ShoppingBag } from 'lucide-react';
import type { Client, Stylist } from '../types';
import { formatKsh } from '../api/client';
import { StylistAvatar } from './StylistAvatar';

interface ClientsViewProps {
  clients: Client[];
  stylists: Stylist[];
  onCreateClient: (payload: {
    name: string;
    phone: string;
    email?: string;
    preferred_stylist_id?: string;
    formula_notes?: string;
  }) => Promise<void>;
  onUpdateClient: (
    id: string,
    payload: Partial<{
      name: string;
      phone: string;
      email: string;
      preferred_stylist_id: string;
      formula_notes: string;
    }>
  ) => Promise<void>;
  onOpenPosForClient: (clientId: string) => void;
}

export function ClientsView({
  clients,
  stylists,
  onCreateClient,
  onUpdateClient,
  onOpenPosForClient,
}: ClientsViewProps) {
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [preferredStylistId, setPreferredStylistId] = useState('');
  const [formulaNotes, setFormulaNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const stylistMap = useMemo(
    () => new Map(stylists.map((s) => [s.id, s])),
    [stylists]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        c.formula_notes.toLowerCase().includes(q)
    );
  }, [clients, query]);

  const openNewModal = () => {
    setEditingClient(null);
    setName('');
    setPhone('');
    setEmail('');
    setPreferredStylistId(stylists[0]?.id ?? '');
    setFormulaNotes('');
    setFormError('');
    setModalOpen(true);
  };

  const openEditModal = (client: Client) => {
    setEditingClient(client);
    setName(client.name);
    setPhone(client.phone);
    setEmail(client.email);
    setPreferredStylistId(client.preferred_stylist_id || '');
    setFormulaNotes(client.formula_notes);
    setFormError('');
    setModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSaving(true);
    try {
      if (editingClient) {
        await onUpdateClient(editingClient.id, {
          name,
          phone,
          email,
          preferred_stylist_id: preferredStylistId,
          formula_notes: formulaNotes,
        });
      } else {
        await onCreateClient({
          name,
          phone,
          email,
          preferred_stylist_id: preferredStylistId,
          formula_notes: formulaNotes,
        });
      }
      setModalOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save client.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif-editorial text-3xl font-semibold tracking-tight text-[#151C27]">
            Clients & Formulas
          </h1>
          <p className="text-sm text-[#6B7280] mt-1">
            {clients.length} client profiles with color formulas, texture notes, and visit spend
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="h-4 w-4 text-[#6B7280] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search name, phone, formula..."
              className="salon-input w-full pl-10 pr-3 text-sm text-[#151C27]"
            />
          </div>
          <button
            type="button"
            onClick={openNewModal}
            className="h-11 px-5 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-sm font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add Client
          </button>
        </div>
      </div>

      {/* Client Cards Grid */}
      {filtered.length === 0 ? (
        <div className="salon-card rounded-2xl p-10 text-center">
          <p className="text-sm font-semibold text-[#151C27]">No client profiles match your search</p>
          <p className="text-xs text-[#6B7280] mt-1">
            Try another query or create a new boutique client profile.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((client) => {
            const pref = stylistMap.get(client.preferred_stylist_id);
            return (
              <div
                key={client.id}
                className="salon-card rounded-2xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-serif-editorial text-xl font-semibold text-[#151C27] truncate">
                        {client.name}
                      </h2>
                      <p className="text-xs text-[#6B7280] mt-0.5 tabular-ksh">
                        {client.phone}
                        {client.email ? ` · ${client.email}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => openEditModal(client)}
                      className="h-9 px-3 rounded-lg border border-[#E5E7EB] text-xs font-semibold text-[#151C27] hover:bg-[#F9FAFB] shrink-0"
                    >
                      Edit
                    </button>
                  </div>

                  {/* Formula Notes */}
                  <div className="rounded-xl bg-[#F9FAFB] border border-[#E5E7EB] p-3">
                    <p className="text-[11px] font-bold tracking-[0.03em] text-[#6B7280]">
                      Studio Formula & Notes
                    </p>
                    <p className="text-xs text-[#151C27] mt-1 leading-relaxed">
                      {client.formula_notes || 'No formula notes recorded yet.'}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-2 border-t border-[#E5E7EB]">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[#6B7280]">Visits: </span>
                      <span className="font-bold text-[#151C27] tabular-ksh">
                        {client.visit_count}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#6B7280]">Lifetime: </span>
                      <span className="font-bold text-[#151C27] tabular-ksh">
                        {formatKsh(client.total_spent_ksh)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    {pref ? (
                      <div className="flex items-center gap-2 min-w-0">
                        <StylistAvatar src={pref.avatar_url} name={pref.name} size="sm" />
                        <span className="text-xs font-medium text-[#4A4455] truncate">
                          {pref.name}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-[#6B7280]">Any Stylist</span>
                    )}

                    <button
                      type="button"
                      onClick={() => onOpenPosForClient(client.id)}
                      className="h-9 px-3 rounded-lg bg-[#EDE9FE] text-[#6D28D9] text-xs font-semibold hover:bg-[#DDD6FE] inline-flex items-center gap-1.5 shrink-0"
                    >
                      <ShoppingBag className="h-3.5 w-3.5" />
                      POS Ticket
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Client Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-[#120D1A]/50 flex items-center justify-center p-4">
          <div className="salon-sheet rounded-2xl w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-[#E5E7EB] pb-4">
              <h2 className="font-serif-editorial text-2xl font-semibold text-[#151C27]">
                {editingClient ? 'Edit Client Profile' : 'New Client Profile'}
              </h2>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close client modal"
                className="h-10 w-10 rounded-lg flex items-center justify-center text-[#6B7280] hover:bg-[#F3F4F6]"
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
              <div>
                <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="salon-input w-full px-3 text-sm text-[#151C27]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                    Phone Number
                  </label>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+254 7..."
                    required
                    className="salon-input w-full px-3 text-sm text-[#151C27] tabular-ksh"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                    Email
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="salon-input w-full px-3 text-sm text-[#151C27]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                  Preferred Stylist
                </label>
                <select
                  value={preferredStylistId}
                  onChange={(e) => setPreferredStylistId(e.target.value)}
                  className="salon-input w-full px-3 text-sm text-[#151C27]"
                >
                  <option value="">No Preference</option>
                  {stylists.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#4A4455] mb-1.5">
                  Color Formula & Care Notes
                </label>
                <textarea
                  rows={3}
                  value={formulaNotes}
                  onChange={(e) => setFormulaNotes(e.target.value)}
                  placeholder="Shade mix, heat limit, scalp sensitivity..."
                  className="w-full rounded-lg border border-[#E5E7EB] p-3 text-sm text-[#151C27] focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="h-11 px-4 rounded-lg border border-[#E5E7EB] bg-white text-sm font-semibold text-[#151C27]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-11 px-5 rounded-lg bg-[#6D28D9] hover:bg-[#5B21B6] text-white text-sm font-semibold disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
