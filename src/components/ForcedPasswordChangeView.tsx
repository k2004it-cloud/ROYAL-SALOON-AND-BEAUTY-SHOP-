import { useState } from 'react';
import { KeyRound, LogOut } from 'lucide-react';
import { salonApi } from '../api/client';
import { BrandFooter } from './BrandFooter';
import { ThemeToggle } from './ThemeToggle';

interface ForcedPasswordChangeViewProps {
  name: string;
  onComplete: () => void;
  onLogout: () => void;
}

export function ForcedPasswordChangeView({ name, onComplete, onLogout }: ForcedPasswordChangeViewProps) {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }
    setBusy(true);
    try {
      await salonApi.changePassword({ new_password: newPassword });
      onComplete();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="auth-page fixed inset-0 z-50 flex min-h-screen flex-col items-center bg-[#071426]/65 p-4 backdrop-blur-sm sm:p-6">
      <div className="flex w-full flex-1 items-center justify-center">
        <section role="dialog" aria-modal="true" aria-labelledby="forced-password-title" aria-describedby="forced-password-description" className="salon-card w-full max-w-[520px] rounded-[22px] p-5 sm:p-8 shadow-2xl">
          <div className="mb-6 flex items-center gap-3">
            <img src="/royal-salon-logo.png" alt="Royal Salon logo" className="h-12 w-12 shrink-0 rounded-xl bg-black object-contain" />
            <div><p className="font-serif-editorial text-xl font-semibold text-[#14213D]">Royal Saloon</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#64748B]">Secure your account</p></div>
            <ThemeToggle className="ml-auto shrink-0" />
          </div>
          <div className="mb-4 flex items-center gap-2 text-[#0B5ED7]"><KeyRound className="h-5 w-5" /><span className="text-xs font-bold uppercase tracking-wide">Temporary password</span></div>
          <h1 id="forced-password-title" className="font-serif-editorial text-2xl font-semibold text-[#14213D]">Choose a new password</h1>
          <p id="forced-password-description" className="mt-1 text-sm text-[#64748B]">Hi {name}, create a new password before continuing to your workspace.</p>
          {error && <p role="alert" className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">{error}</p>}
          <form onSubmit={(event) => void submit(event)} className="mt-6 space-y-4">
            <div><label htmlFor="required-new-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">New password (10+ characters)</label><input id="required-new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required autoFocus className="salon-input w-full px-3 text-sm text-[#14213D]" /></div>
            <div><label htmlFor="required-confirm-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">Confirm new password</label><input id="required-confirm-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className="salon-input w-full px-3 text-sm text-[#14213D]" /></div>
            <button type="submit" disabled={busy} className="auth-primary-button h-12 w-full rounded-xl text-sm font-bold disabled:opacity-60">{busy ? 'Updating…' : 'Save new password'}</button>
          </form>
          <button type="button" onClick={onLogout} className="mt-4 inline-flex w-full items-center justify-center gap-2 text-xs font-semibold text-[#64748B] hover:text-[#0B5ED7]"><LogOut className="h-3.5 w-3.5" />Sign out</button>
        </section>
      </div>
      <BrandFooter className="w-full max-w-[520px] rounded-xl" />
    </main>
  );
}
