import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Bell, Check, Send } from 'lucide-react';
import type { Announcement, StaffUser } from '../types';
import { salonApi } from '../api/client';

export function NotificationsView({ user }: { user: StaffUser }) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const result = await salonApi.listAnnouncements();
      setAnnouncements(result.announcements);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load announcements.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('salon:workspace-updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('salon:workspace-updated', refresh);
    };
  }, [load]);

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPublishing(true);
    setError('');
    setNotice('');
    try {
      const result = await salonApi.createAnnouncement({ title, message });
      setAnnouncements((current) => [result.announcement, ...current.filter((item) => item.id !== result.announcement.id)]);
      setTitle('');
      setMessage('');
      setNotice('Announcement published to the salon team.');
      void load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to publish this announcement.');
    } finally {
      setPublishing(false);
    }
  };

  const markRead = async (announcement: Announcement) => {
    try {
      await salonApi.markAnnouncementRead(announcement.id);
      setAnnouncements((current) => current.map((item) => item.id === announcement.id ? { ...item, is_read: true } : item));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to mark the announcement as read.');
    }
  };

  const unreadCount = announcements.filter((item) => item.sender_user_id !== user.id && !item.is_read).length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#C5D8F4] bg-gradient-to-r from-[#0A1D3A] via-[#0B3B7A] to-[#0B5ED7] px-5 py-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">Staff communication</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">Notifications</h1>
        <p className="mt-2 text-sm text-[#E6F0FF]">Publish updates for all signed-in salon staff and read team announcements.</p>
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.4fr)]">
        <form onSubmit={(event) => void publish(event)} className="salon-card space-y-4 rounded-2xl p-5">
          <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#E8F1FF] text-[#0D6EFD]"><Send className="h-5 w-5" /></span><div><h2 className="text-sm font-bold text-[#14213D]">Publish to the team</h2><p className="text-xs text-[#64748B]">Your name and role appear with the update.</p></div></div>
          <label className="block text-xs font-semibold text-[#344054]">Title<input value={title} onChange={(event) => setTitle(event.target.value)} minLength={4} maxLength={120} required className="salon-input mt-1 w-full px-3 text-sm" placeholder="e.g. Updated closing checklist" /></label>
          <label className="block text-xs font-semibold text-[#344054]">Message<textarea value={message} onChange={(event) => setMessage(event.target.value)} minLength={5} maxLength={2000} required rows={5} className="mt-1 w-full rounded-lg border border-[#DDE6F1] px-3 py-2 text-sm text-[#14213D] focus:border-[#0D6EFD] focus:outline-none focus:ring-2 focus:ring-[#0D6EFD]/15" placeholder="Share a useful update with the team." /></label>
          {error && <p role="alert" className="text-xs font-semibold text-red-700">{error}</p>}
          {notice && <p role="status" className="text-xs font-semibold text-emerald-700">{notice}</p>}
          <button type="submit" disabled={publishing} className="inline-flex h-11 items-center gap-2 rounded-lg bg-[#0D6EFD] px-4 text-sm font-bold text-white disabled:opacity-60"><Send className="h-4 w-4" />{publishing ? 'Publishing…' : 'Publish announcement'}</button>
        </form>

        <section className="salon-card overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-[#E1E7F0] px-5 py-4"><div><h2 className="flex items-center gap-2 text-lg font-bold text-[#14213D]"><Bell className="h-5 w-5 text-[#0D6EFD]" />Team updates</h2><p className="mt-1 text-xs text-[#64748B]">{unreadCount} unread announcement{unreadCount === 1 ? '' : 's'}</p></div><button type="button" onClick={() => void load()} className="rounded-lg border border-[#DDE6F1] px-3 py-2 text-xs font-bold text-[#344054]">Refresh</button></div>
          {loading ? <p className="px-5 py-10 text-center text-sm text-[#64748B]">Loading team updates…</p> : announcements.length ? <div className="divide-y divide-[#E7ECF5]">
            {announcements.map((announcement) => <article key={announcement.id} className="flex gap-3 px-5 py-4">
              <span className={'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ' + (!announcement.is_read && announcement.sender_user_id !== user.id ? 'bg-blue-100 text-blue-700' : 'bg-[#F1F4F9] text-[#64748B]')}><Bell className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><h3 className="text-sm font-bold text-[#14213D]">{announcement.title}</h3>{!announcement.is_read && announcement.sender_user_id !== user.id && <span className="rounded-full bg-[#E8F1FF] px-2 py-1 text-[9px] font-bold uppercase text-[#0757D8]">New</span>}</div>
                <p className="mt-1 whitespace-pre-wrap text-xs leading-5 text-[#475467]">{announcement.message}</p>
                <p className="mt-2 text-[10px] font-semibold text-[#64748B]">{announcement.sender_name} · {announcement.sender_role === 'admin' ? 'Admin' : 'Employee'} · {new Date(announcement.created_at).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
              </div>
              {!announcement.is_read && announcement.sender_user_id !== user.id && <button type="button" onClick={() => void markRead(announcement)} aria-label="Mark announcement as read" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#0757D8] hover:bg-[#EFF4FF]"><Check className="h-4 w-4" /></button>}
            </article>)}
          </div> : <p className="px-5 py-10 text-center text-sm text-[#64748B]">No team announcements yet.</p>}
        </section>
      </div>
    </div>
  );
}
