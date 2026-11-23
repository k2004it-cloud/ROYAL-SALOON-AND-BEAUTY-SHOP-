import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  Activity,
  CheckCircle2,
  CircleHelp,
  Database,
  Download,
  FileText,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  Search,
  Send,
  Settings,
  ShieldCheck,
} from 'lucide-react';
import type {
  AuditLogEntry,
  BusinessSettings,
  StaffUser,
  SupportRequest,
  SupportRequestStatus,
  WorkspaceTab,
} from '../types';
import { salonApi } from '../api/client';

type SystemPageTab = Extract<WorkspaceTab, 'settings' | 'system-logs' | 'backups' | 'support'>;

interface SystemPagesProps {
  tab: SystemPageTab;
  user: StaffUser;
  date: string;
  demoMode: boolean;
  businessSettings: BusinessSettings;
  onBusinessSettingsSaved: (settings: BusinessSettings) => void;
}

function PageHeading({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return (
    <header>
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[#2563EB]">{eyebrow}</p>
      <h1 className="font-sans text-2xl font-bold tracking-tight text-[#14213D] sm:text-3xl">{title}</h1>
      <p className="mt-1 text-sm text-[#667085]">{description}</p>
    </header>
  );
}

function SettingsPage({
  user,
  date,
  demoMode,
  businessSettings,
  onBusinessSettingsSaved,
}: Pick<SystemPagesProps, 'user' | 'date' | 'demoMode' | 'businessSettings' | 'onBusinessSettingsSaved'>) {
  const [settings, setSettings] = useState(businessSettings);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveNotice, setSaveNotice] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  const [passwordNotice, setPasswordNotice] = useState('');

  useEffect(() => setSettings(businessSettings), [businessSettings]);

  const updateSettings = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setSaveError('');
    setSaveNotice('');
    try {
      const { settings: updated } = await salonApi.updateBusinessSettings({
        business_name: settings.business_name,
        phone: settings.phone,
        email: settings.email,
        address: settings.address,
        opening_time: settings.opening_time,
        closing_time: settings.closing_time,
      });
      setSettings(updated);
      onBusinessSettingsSaved(updated);
      setSaveNotice('Business profile saved.');
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save business settings.');
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordError('');
    setPasswordNotice('');
    if (newPassword !== confirmPassword) {
      setPasswordError('New password and confirmation do not match.');
      return;
    }
    setPasswordBusy(true);
    try {
      await salonApi.changePassword({ current_password: currentPassword, new_password: newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordNotice('Password changed. Other active sessions have been signed out.');
    } catch (error: unknown) {
      setPasswordError(error instanceof Error ? error.message : 'Unable to change password.');
    } finally {
      setPasswordBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeading eyebrow="Workspace" title="Settings" description="Manage the salon profile and secure your administrator account." />
      {demoMode && (
        <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900">
          Demo environment: changes are stored locally in the demo database and are not production configuration.
        </p>
      )}
      <form onSubmit={updateSettings} className="salon-card space-y-5 rounded-2xl p-5 sm:p-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0B5ED7]"><Settings className="h-5 w-5" /></span>
            <div><h2 className="text-sm font-bold text-[#14213D]">Business profile</h2><p className="mt-0.5 text-xs text-[#667085]">Business contact details and booking hours.</p></div>
          </div>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="space-y-1.5 text-xs font-semibold text-[#475467]">
              Business name
              <input required maxLength={120} value={settings.business_name} onChange={(event) => setSettings({ ...settings, business_name: event.target.value })} className="salon-input w-full px-3 text-sm font-normal text-[#14213D]" />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#475467]">
              Phone
              <span className="relative block"><Phone className="absolute left-3 top-3 h-4 w-4 text-[#98A2B3]" /><input maxLength={40} value={settings.phone} onChange={(event) => setSettings({ ...settings, phone: event.target.value })} className="salon-input w-full pl-9 pr-3 text-sm font-normal text-[#14213D]" /></span>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#475467]">
              Business email
              <span className="relative block"><Mail className="absolute left-3 top-3 h-4 w-4 text-[#98A2B3]" /><input type="email" maxLength={254} value={settings.email} onChange={(event) => setSettings({ ...settings, email: event.target.value })} className="salon-input w-full pl-9 pr-3 text-sm font-normal text-[#14213D]" /></span>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#475467]">
              Address
              <span className="relative block"><MapPin className="absolute left-3 top-3 h-4 w-4 text-[#98A2B3]" /><input maxLength={300} value={settings.address} onChange={(event) => setSettings({ ...settings, address: event.target.value })} className="salon-input w-full pl-9 pr-3 text-sm font-normal text-[#14213D]" /></span>
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#475467]">
              Opens
              <input required type="time" step={1800} value={settings.opening_time} onChange={(event) => setSettings({ ...settings, opening_time: event.target.value })} className="salon-input w-full px-3 text-sm font-normal text-[#14213D]" />
            </label>
            <label className="space-y-1.5 text-xs font-semibold text-[#475467]">
              Closes
              <input required type="time" step={1800} value={settings.closing_time} onChange={(event) => setSettings({ ...settings, closing_time: event.target.value })} className="salon-input w-full px-3 text-sm font-normal text-[#14213D]" />
            </label>
          </div>
        </div>
        {saveError && <p role="alert" className="text-xs font-semibold text-red-700">{saveError}</p>}
        {saveNotice && <p role="status" className="flex items-center gap-2 text-xs font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" />{saveNotice}</p>}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E1E7F0] pt-4">
          <p className="text-[11px] text-[#667085]">Signed in as {user.name} (@{user.username}) · {user.role === 'admin' ? 'Administrator' : 'Employee'} · Business date {date}</p>
          <button type="submit" disabled={saving} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0D6EFD] px-4 text-xs font-bold text-white hover:bg-[#0B5ED7] disabled:opacity-60">
            {saving ? 'Saving…' : 'Save business profile'}
          </button>
        </div>
      </form>

      <form onSubmit={updatePassword} className="salon-card space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0B5ED7]"><LockKeyhole className="h-5 w-5" /></span>
          <div><h2 className="text-sm font-bold text-[#14213D]">Change password</h2><p className="mt-0.5 text-xs text-[#667085]">Use at least 10 characters. Your current session stays active.</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-xs font-semibold text-[#475467]">Current password<input required type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="salon-input w-full px-3 text-sm font-normal text-[#14213D]" /></label>
          <label className="space-y-1.5 text-xs font-semibold text-[#475467]">New password<input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="salon-input w-full px-3 text-sm font-normal text-[#14213D]" /></label>
          <label className="space-y-1.5 text-xs font-semibold text-[#475467]">Confirm new password<input required minLength={10} maxLength={128} type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="salon-input w-full px-3 text-sm font-normal text-[#14213D]" /></label>
        </div>
        {passwordError && <p role="alert" className="text-xs font-semibold text-red-700">{passwordError}</p>}
        {passwordNotice && <p role="status" className="flex items-center gap-2 text-xs font-semibold text-green-700"><CheckCircle2 className="h-4 w-4" />{passwordNotice}</p>}
        <button type="submit" disabled={passwordBusy} className="inline-flex h-10 items-center justify-center rounded-lg border border-[#C5D8F4] bg-white px-4 text-xs font-bold text-[#0B5ED7] hover:bg-[#EAF2FF] disabled:opacity-60">
          {passwordBusy ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </div>
  );
}

function SystemLogPage({ date }: Pick<SystemPagesProps, 'date'>) {
  const [filterDate, setFilterDate] = useState(date);
  const [search, setSearch] = useState('');
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => setFilterDate(date), [date]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void salonApi.listAuditLogs(filterDate)
      .then(({ entries: result }) => { if (active) setEntries(result); })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : 'Unable to load audit events.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [filterDate, reloadKey]);

  useEffect(() => {
    const refresh = () => setReloadKey((value) => value + 1);
    window.addEventListener('salon:workspace-updated', refresh);
    return () => window.removeEventListener('salon:workspace-updated', refresh);
  }, []);

  const filteredEntries = useMemo(() => {
    const query = search.trim().toLowerCase();
    return query
      ? entries.filter((entry) => `${entry.actor_name} ${entry.action} ${entry.entity_type} ${entry.summary}`.toLowerCase().includes(query))
      : entries;
  }, [entries, search]);

  return (
    <div className="space-y-5">
      <PageHeading eyebrow="Audit trail" title="System logs" description="Review account access and important changes made in the salon workspace." />
      <p className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-xs text-[#1E40AF]">
        The audit trail records account access, profile changes, appointments, clients, employees, catalog, payments, commission payouts, attendance, staff tasks, and support updates. Passwords and form contents are never stored in these events; low-level server diagnostics are not included.
      </p>
      <section className="salon-card space-y-4 rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-xs font-semibold text-[#475467]">Date<input type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} className="salon-input ml-2 px-2 text-xs" /></label>
          <label className="relative min-w-[220px] flex-1"><Search className="absolute left-3 top-3 h-4 w-4 text-[#98A2B3]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search actor or event" className="salon-input w-full pl-9 pr-3 text-sm" /></label>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="h-10 rounded-lg border border-[#DDE6F1] bg-white px-3 text-xs font-bold text-[#475467] hover:bg-[#F4F7FC]">Refresh</button>
        </div>
        {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
        {loading ? (
          <p className="py-8 text-center text-xs text-[#667085]">Loading audit events…</p>
        ) : filteredEntries.length ? (
          <div className="divide-y divide-[#EEF1F6]">
            {filteredEntries.map((entry) => (
              <article key={entry.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0B5ED7]"><Activity className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-[#14213D]">{entry.summary}</p>
                  <p className="mt-1 text-[11px] text-[#667085]">{entry.actor_name} · {entry.actor_role} · {entry.action.replaceAll('_', ' ')} · {entry.entity_type}</p>
                </div>
                <time className="shrink-0 text-[10px] text-[#667085]">{new Date(entry.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</time>
              </article>
            ))}
          </div>
        ) : (
          <div className="py-10 text-center"><FileText className="mx-auto h-7 w-7 text-[#98A2B3]" /><p className="mt-3 text-sm font-semibold text-[#344054]">{search ? 'No matching audit events' : 'No audit events for this date'}</p><p className="mt-1 text-xs text-[#667085]">Events will appear here as staff use the workspace.</p></div>
        )}
      </section>
    </div>
  );
}

function BackupsPage({ date }: Pick<SystemPagesProps, 'date'>) {
  return (
    <div className="space-y-5">
      <PageHeading eyebrow="Data protection" title="Backups" description="Review available exports and backup status." />
      <section className="salon-card rounded-2xl p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF7E6] text-[#B45309]"><Database className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-bold text-[#14213D]">Automated database backups are not configured</h2>
            <p className="mt-1 text-xs leading-5 text-[#667085]">Configure backups with your hosting provider before relying on this workspace for disaster recovery. The CSV export below contains the selected day’s ticket ledger only; it is not a full database backup.</p>
          </div>
        </div>
        <a href={salonApi.exportLedgerUrl(date)} download className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[#0D6EFD] px-4 text-xs font-bold text-white hover:bg-[#0B5ED7]">
          <Download className="h-4 w-4" />Export {date} ledger
        </a>
      </section>
    </div>
  );
}

function SupportRequestCard({
  request,
  canManage,
  onSaved,
}: {
  request: SupportRequest;
  canManage: boolean;
  onSaved: (updated: SupportRequest) => void;
}) {
  const [status, setStatus] = useState<SupportRequestStatus>(request.status);
  const [reply, setReply] = useState(request.admin_reply);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const lastSaved = useRef({ status: request.status, reply: request.admin_reply });

  useEffect(() => {
    setStatus((current) => current === lastSaved.current.status ? request.status : current);
    setReply((current) => current === lastSaved.current.reply ? request.admin_reply : current);
    lastSaved.current = { status: request.status, reply: request.admin_reply };
  }, [request.status, request.admin_reply]);

  const saveUpdate = async () => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { request: updated } = await salonApi.updateSupportRequest(request.id, { status, admin_reply: reply });
      onSaved(updated);
      setNotice('Request updated.');
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this request.');
    } finally {
      setSaving(false);
    }
  };

  const priorityClass = request.priority === 'high'
    ? 'bg-red-50 text-red-700'
    : request.priority === 'low'
      ? 'bg-slate-100 text-slate-600'
      : 'bg-amber-50 text-amber-700';

  return (
    <article className="rounded-xl border border-[#E1E7F0] bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-[#14213D]">{request.subject}</h2>
            <span className={`rounded-full px-2 py-1 text-[9px] font-bold uppercase ${priorityClass}`}>{request.priority}</span>
          </div>
          <p className="mt-1 text-[11px] text-[#667085]">
            {request.category} · {request.requester_name}{request.requester_email ? ` (${request.requester_email})` : ''} · {new Date(request.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <span className="rounded-full bg-[#E8F1FF] px-2.5 py-1 text-[10px] font-bold capitalize text-[#0B5ED7]">{request.status.replace('_', ' ')}</span>
      </div>
      <p className="mt-3 whitespace-pre-wrap text-xs leading-5 text-[#475467]">{request.message}</p>
      {request.admin_reply && (
        <div className="mt-3 rounded-lg border-l-2 border-[#0D6EFD] bg-[#F4F7FC] px-3 py-2">
          <p className="text-[10px] font-bold text-[#14213D]">Administrator response</p>
          <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#475467]">{request.admin_reply}</p>
        </div>
      )}
      {canManage && (
        <div className="mt-4 grid gap-3 border-t border-[#EEF1F6] pt-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
          <label className="space-y-1 text-[10px] font-bold text-[#667085]">
            Status
            <select value={status} onChange={(event) => setStatus(event.target.value as SupportRequestStatus)} className="salon-input w-full px-2 text-xs text-[#14213D]">
              <option value="open">Open</option><option value="in_progress">In progress</option><option value="resolved">Resolved</option>
            </select>
          </label>
          <label className="space-y-1 text-[10px] font-bold text-[#667085]">
            Reply to requester
            <textarea maxLength={2000} rows={2} value={reply} onChange={(event) => setReply(event.target.value)} className="w-full rounded-lg border border-[#DDE6F1] bg-white px-3 py-2 text-xs font-normal text-[#14213D] focus:border-[#0D6EFD] focus:outline-none focus:ring-2 focus:ring-[#0D6EFD]/15" />
          </label>
          <button type="button" onClick={() => void saveUpdate()} disabled={saving} className="h-10 rounded-lg bg-[#0D6EFD] px-4 text-xs font-bold text-white hover:bg-[#0B5ED7] disabled:opacity-60">{saving ? 'Saving…' : 'Save update'}</button>
        </div>
      )}
      {error && <p role="alert" className="mt-2 text-xs font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-2 text-xs font-semibold text-green-700">{notice}</p>}
    </article>
  );
}

function SupportPage({ user, businessSettings }: Pick<SystemPagesProps, 'user' | 'businessSettings'>) {
  const helpItems = [
    { title: 'Appointments', detail: 'Open Appointments to create bookings, assign a stylist, and update the booking status.' },
    { title: 'Sales & payments', detail: 'Use Sales & Payments to build a ticket, select a payment method, and complete checkout.' },
    { title: 'Employees', detail: 'Administrators can create or disable employee access from the Employees page.' },
    { title: 'Access problems', detail: 'Ask the salon administrator to confirm your username, reset access, or verify your role.' },
  ];
  const categories = ['Access & accounts', 'Appointments', 'Sales & payments', 'Clients', 'Inventory', 'Other'];
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [priority, setPriority] = useState<SupportRequest['priority']>('normal');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendNotice, setSendNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoadError('');
    const loadRequests = () => {
      void salonApi.listSupportRequests()
        .then(({ requests: result }) => { if (active) setRequests(result); })
        .catch((cause: unknown) => { if (active) setLoadError(cause instanceof Error ? cause.message : 'Unable to load support requests.'); })
        .finally(() => { if (active) setLoading(false); });
    };
    loadRequests();
    const interval = window.setInterval(loadRequests, 60000);
    window.addEventListener('focus', loadRequests);
    document.addEventListener('visibilitychange', loadRequests);
    window.addEventListener('salon:workspace-updated', loadRequests);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', loadRequests);
      document.removeEventListener('visibilitychange', loadRequests);
      window.removeEventListener('salon:workspace-updated', loadRequests);
    };
  }, [reloadKey]);

  const submitRequest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSending(true);
    setSendError('');
    setSendNotice('');
    try {
      const { request } = await salonApi.createSupportRequest({ category, priority, subject, message });
      setRequests((current) => [request, ...current]);
      setSubject('');
      setMessage('');
      setSendNotice('Request submitted and added to the support queue.');
    } catch (cause: unknown) {
      setSendError(cause instanceof Error ? cause.message : 'Unable to submit your support request.');
    } finally {
      setSending(false);
    }
  };

  const updateRequestInList = (updated: SupportRequest) => {
    setRequests((current) => current.map((request) => request.id === updated.id ? updated : request));
  };

  return (
    <div className="space-y-5">
      <PageHeading eyebrow="Help center" title="Support & help" description={user.role === 'admin' ? 'Review staff requests, respond, and track resolution.' : 'Find guidance or send a request to the salon administrator.'} />
      <p className="rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-3 text-xs text-[#1E40AF]">
        Requests are saved in this workspace and visible to administrators. No external email or service-desk integration is configured.
        {(businessSettings.phone || businessSettings.email) && <span className="mt-1 block">Business contact: {[businessSettings.phone, businessSettings.email].filter(Boolean).join(' · ')}</span>}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {helpItems.map((item) => (
          <article key={item.title} className="salon-card rounded-2xl p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0B5ED7]"><CircleHelp className="h-4 w-4" /></span>
            <h2 className="mt-3 text-sm font-bold text-[#14213D]">{item.title}</h2>
            <p className="mt-1 text-xs leading-5 text-[#667085]">{item.detail}</p>
          </article>
        ))}
      </div>
      <form onSubmit={submitRequest} className="salon-card space-y-4 rounded-2xl p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0B5ED7]"><Send className="h-5 w-5" /></span>
          <div><h2 className="text-sm font-bold text-[#14213D]">Submit a support request</h2><p className="mt-0.5 text-xs text-[#667085]">Submitted as {user.name} ({user.email}).</p></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="space-y-1.5 text-xs font-semibold text-[#475467]">Category<select value={category} onChange={(event) => setCategory(event.target.value)} className="salon-input w-full px-3 text-sm font-normal text-[#14213D]">{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="space-y-1.5 text-xs font-semibold text-[#475467]">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as SupportRequest['priority'])} className="salon-input w-full px-3 text-sm font-normal capitalize text-[#14213D]"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option></select></label>
          <label className="space-y-1.5 text-xs font-semibold text-[#475467] sm:col-span-1">Subject<input required minLength={5} maxLength={120} value={subject} onChange={(event) => setSubject(event.target.value)} className="salon-input w-full px-3 text-sm font-normal text-[#14213D]" /></label>
        </div>
        <label className="block space-y-1.5 text-xs font-semibold text-[#475467]">Describe the issue<textarea required minLength={10} maxLength={4000} rows={4} value={message} onChange={(event) => setMessage(event.target.value)} className="w-full rounded-lg border border-[#DDE6F1] bg-white px-3 py-2 text-sm font-normal text-[#14213D] focus:border-[#0D6EFD] focus:outline-none focus:ring-2 focus:ring-[#0D6EFD]/15" /></label>
        {sendError && <p role="alert" className="text-xs font-semibold text-red-700">{sendError}</p>}
        {sendNotice && <p role="status" className="text-xs font-semibold text-green-700">{sendNotice}</p>}
        <button type="submit" disabled={sending} className="inline-flex h-10 items-center justify-center rounded-lg bg-[#0D6EFD] px-4 text-xs font-bold text-white hover:bg-[#0B5ED7] disabled:opacity-60">{sending ? 'Submitting…' : 'Submit request'}</button>
      </form>

      <section className="salon-card space-y-4 rounded-2xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="text-sm font-bold text-[#14213D]">{user.role === 'admin' ? 'Support inbox' : 'My support requests'}</h2><p className="mt-1 text-xs text-[#667085]">{requests.length} request{requests.length === 1 ? '' : 's'}</p></div>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)} className="h-9 rounded-lg border border-[#DDE6F1] bg-white px-3 text-xs font-bold text-[#475467] hover:bg-[#F4F7FC]">Refresh</button>
        </div>
        {loadError && <p role="alert" className="text-xs font-semibold text-red-700">{loadError}</p>}
        {loading ? <p className="py-8 text-center text-xs text-[#667085]">Loading requests…</p> : requests.length ? (
          <div className="space-y-3">
            {requests.map((request) => <SupportRequestCard key={request.id} request={request} canManage={user.role === 'admin'} onSaved={updateRequestInList} />)}
          </div>
        ) : <p className="py-8 text-center text-xs text-[#667085]">No support requests yet.</p>}
      </section>
      <p className="flex items-center gap-2 rounded-xl border border-[#DFE7F1] bg-white px-4 py-3 text-xs text-[#667085]">
        <ShieldCheck className="h-4 w-4 text-[#0B5ED7]" />For system outages or data recovery, contact the person who manages your hosting environment.
      </p>
    </div>
  );
}

export function SystemPages(props: SystemPagesProps) {
  switch (props.tab) {
    case 'settings':
      return <SettingsPage
        user={props.user}
        date={props.date}
        demoMode={props.demoMode}
        businessSettings={props.businessSettings}
        onBusinessSettingsSaved={props.onBusinessSettingsSaved}
      />;
    case 'system-logs':
      return <SystemLogPage date={props.date} />;
    case 'backups':
      return <BackupsPage date={props.date} />;
    case 'support':
      return <SupportPage user={props.user} businessSettings={props.businessSettings} />;
  }
}
