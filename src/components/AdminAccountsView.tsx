import { useCallback, useEffect, useState } from 'react';
import { KeyRound, LockKeyhole, Plus, ShieldCheck, UserRoundX } from 'lucide-react';
import type { StaffUser } from '../types';
import { salonApi } from '../api/client';
import { ProfileImagePicker } from './ProfileImagePicker';
import { StylistAvatar } from './StylistAvatar';

export function AdminAccountsView({ onNotify }: { onNotify: (message: string) => void }) {
  const [admins, setAdmins] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [temporaryCredential, setTemporaryCredential] = useState<{ username: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const loadAdmins = useCallback(async () => {
    setError('');
    try {
      const result = await salonApi.listAdminAccounts();
      setAdmins(result.admins);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load Admin accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadAdmins(); }, [loadAdmins]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await salonApi.createAdminAccount({ name, username, email, password, avatar_url: avatarUrl });
      setName(''); setUsername(''); setEmail(''); setPassword(''); setAvatarUrl(''); setFormOpen(false);
      await loadAdmins();
      onNotify('Admin account created');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create Admin account.');
    } finally {
      setBusy(false);
    }
  };

  const handleToggle = async (admin: StaffUser) => {
    if (!window.confirm(`${admin.active ? 'Disable' : 'Restore'} access for ${admin.name}?`)) return;
    setError('');
    try {
      await salonApi.updateAdminAccount(admin.id, !admin.active);
      await loadAdmins();
      onNotify(admin.active ? 'Admin access disabled' : 'Admin access restored');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update Admin access.');
    }
  };

  const handleResetPassword = async (admin: StaffUser) => {
    if (!window.confirm(`Issue a temporary password for ${admin.name}? Their current sessions will be signed out.`)) return;
    setError('');
    setTemporaryCredential(null);
    try {
      const result = await salonApi.resetAdminPassword(admin.id);
      setTemporaryCredential({ username: result.username, password: result.temporary_password });
      onNotify('Temporary Admin password created');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to reset Admin password.');
    }
  };

  const copyCredential = async () => {
    if (!temporaryCredential) return;
    try {
      await navigator.clipboard.writeText(`Username: ${temporaryCredential.username}\nTemporary password: ${temporaryCredential.password}`);
      onNotify('Temporary login copied');
    } catch {
      setError('Copy was unavailable. You can select and copy the temporary login shown below.');
    }
  };

  return (
    <section className="salon-card space-y-5 rounded-2xl p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#0B5ED7]"><ShieldCheck className="h-3.5 w-3.5" />Superadmin controls</p><h2 className="text-xl font-bold text-[#14213D]">Admin accounts</h2><p className="mt-1 text-xs text-[#64748B]">Create, disable, restore, or help an Admin regain account access.</p></div>
        <button type="button" onClick={() => { setError(''); setFormOpen((open) => !open); }} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0B5ED7] px-4 text-xs font-bold text-white"><Plus className="h-4 w-4" />Add Admin</button>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}

      {temporaryCredential && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4"><p className="text-sm font-bold text-amber-950">Temporary login for the Admin</p><p className="mt-1 text-xs text-amber-900">Share these credentials securely. The previous sessions have been signed out.</p><p className="mt-3 select-all font-mono text-sm text-[#14213D]">Username: {temporaryCredential.username}<br />Temporary password: {temporaryCredential.password}</p><button type="button" onClick={() => void copyCredential()} className="mt-3 rounded-lg border border-amber-400 px-3 py-2 text-xs font-bold text-amber-950">Copy login</button><button type="button" onClick={() => setTemporaryCredential(null)} className="ml-2 rounded-lg px-3 py-2 text-xs font-semibold text-amber-900">Hide</button></div>}

      {formOpen && <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border border-[#E1E7F0] bg-[#F8FAFD] p-4 sm:grid-cols-2">
        <label className="text-xs font-semibold text-[#344054]">Admin name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} className="salon-input mt-1 w-full px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-[#344054]">Username<input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={3} maxLength={30} pattern="[A-Za-z0-9._\-]{3,30}" className="salon-input mt-1 w-full px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-[#344054]">Work email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} className="salon-input mt-1 w-full px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-[#344054]">Initial password (10+ characters)<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={10} maxLength={128} autoComplete="new-password" className="salon-input mt-1 w-full px-3 text-sm" /></label>
        <div className="sm:col-span-2"><ProfileImagePicker name={name || 'Admin'} value={avatarUrl} onChange={setAvatarUrl} /></div>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setFormOpen(false)} className="h-10 rounded-lg border border-[#DDE6F1] px-4 text-xs font-semibold text-[#344054]">Cancel</button><button disabled={busy} className="h-10 rounded-lg bg-[#0B5ED7] px-4 text-xs font-bold text-white disabled:opacity-60">{busy ? 'Creating…' : 'Create Admin'}</button></div>
      </form>}

      {loading ? <p className="py-5 text-center text-sm text-[#64748B]">Loading Admin accounts…</p> : admins.length === 0 ? <p className="rounded-xl bg-[#F8FAFD] px-4 py-6 text-center text-sm text-[#64748B]">No additional Admin accounts have been created.</p> : <div className="grid gap-3 lg:grid-cols-2">{admins.map((admin) => <article key={admin.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E1E7F0] p-4"><div className="flex min-w-0 items-center gap-3"><StylistAvatar src={admin.avatar_url} name={admin.name} size="md" /><div className="min-w-0"><p className="truncate text-sm font-bold text-[#14213D]">{admin.name}</p><p className="truncate text-xs text-[#475467]">@{admin.username} · {admin.email}</p><span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${admin.active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{admin.active ? 'Active' : 'Disabled'}</span></div></div><div className="flex items-center gap-2"><button type="button" onClick={() => void handleResetPassword(admin)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE6F1] px-3 text-xs font-semibold text-[#344054]"><KeyRound className="h-3.5 w-3.5" />Reset password</button><button type="button" onClick={() => void handleToggle(admin)} aria-label={`${admin.active ? 'Disable' : 'Restore'} ${admin.name}`} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#DDE6F1] px-3 text-xs font-semibold text-[#344054]">{admin.active ? <><UserRoundX className="h-3.5 w-3.5" />Disable</> : <><LockKeyhole className="h-3.5 w-3.5" />Restore</>}</button></div></article>)}</div>}
    </section>
  );
}
