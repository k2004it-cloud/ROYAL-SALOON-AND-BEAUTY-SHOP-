import { useState } from 'react';
import { Eye, EyeOff, RefreshCw } from 'lucide-react';
import { salonApi } from '../api/client';
import { BrandFooter } from './BrandFooter';
import { ThemeToggle } from './ThemeToggle';

interface AuthViewProps {
  demoMode: boolean;
  connectionError: boolean;
  error: string;
  busy: boolean;
  onLogin: (payload: { username: string; password: string }) => void;
  onRetry: () => void;
}

export function AuthView({ demoMode, connectionError, error, busy, onLogin, onRetry }: AuthViewProps) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const initialResetToken = new URLSearchParams(window.location.hash.slice(1)).get('reset_token') ?? '';
  const [recoveryMode, setRecoveryMode] = useState<'login' | 'request' | 'reset'>(initialResetToken ? 'reset' : 'login');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');

  const handleRequestReset = async (event: React.FormEvent) => {
    event.preventDefault(); setRecoveryBusy(true); setRecoveryError(''); setRecoveryMessage('');
    try { setRecoveryMessage((await salonApi.requestPasswordReset({ email: recoveryEmail })).message); }
    catch (err) { setRecoveryError(err instanceof Error ? err.message : 'Could not request a password reset.'); }
    finally { setRecoveryBusy(false); }
  };

  const handleConfirmReset = async (event: React.FormEvent) => {
    event.preventDefault(); setRecoveryError(''); setRecoveryMessage('');
    if (newPassword !== confirmPassword) { setRecoveryError('The new passwords do not match.'); return; }
    setRecoveryBusy(true);
    try {
      await salonApi.confirmPasswordReset({ token: resetToken, new_password: newPassword });
      window.history.replaceState({}, '', window.location.pathname);
      setResetToken(''); setNewPassword(''); setConfirmPassword(''); setRecoveryMode('login');
      setRecoveryMessage('Password reset. Sign in with your new password.');
    } catch (err) { setRecoveryError(err instanceof Error ? err.message : 'This reset link is invalid or expired.'); }
    finally { setRecoveryBusy(false); }
  };

  return (
    <main className="auth-page min-h-screen flex flex-col items-center bg-transparent p-4 sm:p-6">
      <div className="flex w-full flex-1 items-center justify-center">
        <section className="salon-card w-full max-w-[760px] rounded-[22px] p-5 sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <img src="/royal-salon-logo.png" alt="Royal Salon logo" className="h-12 w-12 shrink-0 rounded-xl bg-black object-contain" />
            <div><p className="font-serif-editorial text-xl font-semibold text-[#14213D]">Royal Saloon</p><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#64748B]">Staff workspace access</p></div>
            <ThemeToggle className="ml-auto shrink-0" />
          </div>
          <h1 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">
            {recoveryMode === 'request' ? 'Reset your password' : recoveryMode === 'reset' ? 'Choose a new password' : 'Sign in'}
          </h1>
          <p className="mt-1 text-sm text-[#64748B]">
            {recoveryMode === 'request' ? 'Enter your staff account email to receive a password reset link.' : recoveryMode === 'reset' ? 'Choose a new password with at least 10 characters.' : 'Sign in with your assigned username and password.'}
          </p>
          {demoMode && <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">Demo data environment. Do not enter real customer information.</p>}
          {(recoveryError || (recoveryMode === 'login' ? error : '')) && <div role="alert" className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">{recoveryError || error}</div>}
          {recoveryMessage && <div role="status" className="mt-4 rounded-lg border border-[#DDE6F1] bg-white px-3 py-2 text-xs text-[#344054]">{recoveryMessage}</div>}
          {recoveryMode === 'request' ? (
            <form onSubmit={handleRequestReset} className="mt-6 space-y-4">
              <div><label htmlFor="recovery-email" className="mb-1.5 block text-xs font-semibold text-[#344054]">Account email</label><input id="recovery-email" type="email" autoComplete="email" value={recoveryEmail} onChange={e => setRecoveryEmail(e.target.value)} required maxLength={254} className="salon-input w-full px-3 text-sm text-[#14213D]" /></div>
              <button disabled={recoveryBusy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#0D6EFD] to-[#0B5ED7] text-sm font-bold text-white disabled:opacity-60">{recoveryBusy ? 'Sending…' : 'Send reset link'}</button>
              <button type="button" onClick={() => { setRecoveryMode('login'); setRecoveryError(''); setRecoveryMessage(''); }} className="w-full text-center text-xs font-semibold text-[#0B5ED7] underline">Back to sign in</button>
            </form>
          ) : recoveryMode === 'reset' ? (
            <form onSubmit={handleConfirmReset} className="mt-6 space-y-4">
              <div><label htmlFor="new-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">New password</label><div className="relative"><input id="new-password" type={showNewPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="salon-input w-full px-3 pr-11 text-sm text-[#14213D]" /><button type="button" onClick={() => setShowNewPassword(value => !value)} aria-label={showNewPassword ? 'Hide new password' : 'Show new password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0B5ED7]">{showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              <div><label htmlFor="confirm-new-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">Confirm new password</label><div className="relative"><input id="confirm-new-password" type={showConfirmPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="salon-input w-full px-3 pr-11 text-sm text-[#14213D]" /><button type="button" onClick={() => setShowConfirmPassword(value => !value)} aria-label={showConfirmPassword ? 'Hide confirmation password' : 'Show confirmation password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0B5ED7]">{showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              <button disabled={recoveryBusy || !resetToken} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#0D6EFD] to-[#0B5ED7] text-sm font-bold text-white disabled:opacity-60">{recoveryBusy ? 'Updating…' : 'Set new password'}</button>
              {!resetToken && <p className="text-xs text-[#B91C1C]">This reset link is missing its token. Request a new link.</p>}
            </form>
          ) : connectionError ? (
            <button type="button" onClick={onRetry} className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-[#0B5ED7] px-4 text-sm font-semibold text-white"><RefreshCw className="h-4 w-4" />Retry connection</button>
          ) : (
            <form onSubmit={e => { e.preventDefault(); onLogin({ username: username.trim(), password }); }} className="mt-6 space-y-4">
              <div><label htmlFor="staff-username" className="mb-1.5 block text-xs font-semibold text-[#344054]">Username</label><input id="staff-username" autoComplete="username" minLength={3} maxLength={30} value={username} onChange={e => setUsername(e.target.value)} required className="salon-input w-full px-3 text-sm text-[#14213D]" /></div>
              <div><label htmlFor="staff-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">Password</label><div className="relative"><input id="staff-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required className="salon-input w-full px-3 pr-11 text-sm text-[#14213D]" /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0B5ED7]">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>
              <button type="submit" disabled={busy} className="auth-primary-button h-12 w-full rounded-xl text-sm font-bold disabled:opacity-60">{busy ? 'Please wait…' : 'Sign in'}</button>
              {!demoMode && <button type="button" onClick={() => { setRecoveryMode('request'); setRecoveryError(''); setRecoveryMessage(''); }} className="w-full text-center text-xs font-semibold text-[#0B5ED7] underline underline-offset-2">Forgot password?</button>}
            </form>
          )}
        </section>
      </div>
      <BrandFooter className="w-full max-w-[760px] rounded-xl" />
    </main>
  );
}
