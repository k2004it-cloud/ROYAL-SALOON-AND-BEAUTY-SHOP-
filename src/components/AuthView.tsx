import { useState } from 'react';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { salonApi } from '../api/client';
import type { StaffRole } from '../types';
import { BrandFooter } from './BrandFooter';

interface AuthViewProps {
  role: StaffRole | null;
  setupRequired: boolean;
  adminSetupRequired: boolean;
  superadminSetupRequired: boolean;
  demoMode: boolean;
  connectionError: boolean;
  error: string;
  busy: boolean;
  onSetup: (payload: { name: string; username: string; email: string; password: string; role: 'admin' | 'superadmin' }) => void;
  onLogin: (payload: { username: string; password: string; role: StaffRole }) => void;
  onNavigate: (path: string) => void;
  onRetry: () => void;
}

export function AuthView({
  role,
  setupRequired,
  adminSetupRequired,
  superadminSetupRequired,
  demoMode,
  connectionError,
  error,
  busy,
  onSetup,
  onLogin,
  onNavigate,
  onRetry,
}: AuthViewProps) {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const roleSetupRequired = role === 'admin' ? adminSetupRequired : role === 'superadmin' ? superadminSetupRequired : setupRequired;
  const initialResetToken = new URLSearchParams(window.location.hash.slice(1)).get('reset_token') ?? '';
  const [recoveryMode, setRecoveryMode] = useState<'login' | 'request' | 'reset'>(initialResetToken ? 'reset' : 'login');
  const [resetToken, setResetToken] = useState(initialResetToken);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!role) return;
    if (roleSetupRequired && (role === 'superadmin' || role === 'admin')) {
      onSetup({ name, username, email, password, role });
    } else {
      onLogin({ username, password, role });
    }
  };

  const handleRequestReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryBusy(true);
    setRecoveryError('');
    setRecoveryMessage('');
    try {
      const result = await salonApi.requestPasswordReset({ email: recoveryEmail });
      setRecoveryMessage(result.message);
    } catch (requestError) {
      setRecoveryError(requestError instanceof Error ? requestError.message : 'Could not request a password reset.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  const handleConfirmReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setRecoveryError('');
    setRecoveryMessage('');
    if (newPassword !== confirmPassword) {
      setRecoveryError('The new passwords do not match.');
      return;
    }
    setRecoveryBusy(true);
    try {
      await salonApi.confirmPasswordReset({ token: resetToken, new_password: newPassword });
      window.history.replaceState({}, '', window.location.pathname);
      setResetToken('');
      setNewPassword('');
      setConfirmPassword('');
      setRecoveryMode('login');
      setRecoveryMessage('Password reset. Sign in with your new password.');
    } catch (requestError) {
      setRecoveryError(requestError instanceof Error ? requestError.message : 'This reset link is invalid or expired.');
    } finally {
      setRecoveryBusy(false);
    }
  };

  const roleLabel = role === 'superadmin' ? 'Superadmin' : role === 'admin' ? 'Admin' : 'Employee';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-4 bg-transparent p-4">
      <section className="salon-card w-full max-w-xl rounded-3xl p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <img src="/royal-salon-logo.png" alt="Royal Salon logo" className="h-12 w-12 shrink-0 rounded-xl bg-black object-contain" />
          <div>
            <p className="font-serif-editorial text-xl font-semibold text-[#14213D]">
              Royal Saloon
            </p>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#64748B]">
              Staff workspace access
            </p>
          </div>
        </div>

        {role === null ? (
          <>
            <h1 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">
              Select your login
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">
              Choose the account type you use to sign in.
            </p>
            {demoMode && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Demo data environment. Do not enter real customer information.
              </p>
            )}
            {demoMode && !setupRequired && (
              <p className="mt-3 rounded-lg border border-[#DDE6F1] bg-white px-3 py-2 text-xs text-[#64748B]">
                Development sign-in: Admin <strong>admin / 0000</strong> · Employee <strong>test / 11111</strong>
              </p>
            )}
            {error && (
              <div role="alert" className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
                {error}
              </div>
            )}
            {connectionError && (
              <button
                type="button"
                onClick={onRetry}
                className="mt-4 inline-flex h-11 items-center gap-2 rounded-lg bg-[#0B5ED7] px-4 text-sm font-semibold text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Retry connection
              </button>
            )}
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {([
                ['superadmin', superadminSetupRequired ? 'Set Up Superadmin' : 'Superadmin Login', 'System creator access for maintenance and troubleshooting.'],
                ['admin', adminSetupRequired ? 'Set Up Admin' : 'Admin Login', 'Manage salon operations, services, sales, and staff.'],
                ['employee', 'Employee Login', 'Open your employee workspace and assigned schedule.'],
              ] as const).map(([targetRole, title, description]) => (
                <a
                  key={targetRole}
                  href={`/${targetRole}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigate(`/${targetRole}`);
                  }}
                  className="group rounded-2xl border border-[#DDE6F1] bg-white p-5 transition-colors hover:border-[#3B82F6] hover:bg-[#F4F7FC]"
                >
                  <span className="flex items-center justify-between">
                    <span className="font-semibold text-[#14213D]">{title}</span>
                    <ArrowRight className="h-4 w-4 text-[#0B5ED7] transition-transform group-hover:translate-x-1" />
                  </span>
                  <span className="mt-2 block text-xs leading-5 text-[#64748B]">{description}</span>
                  {targetRole === 'superadmin' && superadminSetupRequired && (
                    <span className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-[#0B5ED7]">
                      Set up system creator account
                    </span>
                  )}
                  {targetRole === 'employee' && setupRequired && (
                    <span className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                      Superadmin setup required first
                    </span>
                  )}
                </a>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">
              {recoveryMode === 'request'
                ? 'Reset your password'
                : recoveryMode === 'reset'
                  ? 'Choose a new password'
                  : roleSetupRequired && role === 'superadmin'
                    ? 'Set up the Superadmin account'
                    : roleSetupRequired && role === 'admin'
                      ? 'Set up the salon Admin account'
                    : `${roleLabel} sign in`}
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">
              {recoveryMode === 'request'
                ? 'Enter the email address on your staff account. If it matches an active account, we will send a reset link.'
                : recoveryMode === 'reset'
                  ? 'Choose a new password with at least 10 characters.'
                : roleSetupRequired && role === 'superadmin'
                ? 'Create the system creator account. The salon owner keeps a separate Admin account.'
                  : roleSetupRequired && role === 'admin'
                    ? 'Create the salon owner’s Admin account. This account is separate from the system Superadmin.'
                    : roleSetupRequired
                  ? 'The Admin account must be set up before Employees can sign in.'
                  : 'Use your assigned username and password.'}
            </p>
            {demoMode && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Demo data environment. Do not enter real customer information.
              </p>
            )}
            {demoMode && !setupRequired && (
              <p className="mt-3 rounded-lg border border-[#DDE6F1] bg-white px-3 py-2 text-xs text-[#64748B]">
                Development sign-in: {role === 'superadmin' ? (
                  superadminSetupRequired ? <>Create the Superadmin account here, then sign in.</> : <>Use the Superadmin credentials you created.</>
                ) : role === 'admin' ? (
                  <>Admin <strong>admin / 0000</strong></>
                ) : (
                  <>Employee <strong>test / 11111</strong></>
                )}
              </p>
            )}
            {(recoveryError || (recoveryMode === 'login' ? error : '')) && (
              <div role="alert" className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
                {recoveryError || error}
              </div>
            )}

            {recoveryMessage && (
              <div role="status" className="mt-4 rounded-lg border border-[#DDE6F1] bg-white px-3 py-2 text-xs text-[#344054]">
                {recoveryMessage}
              </div>
            )}

            {recoveryMode === 'request' ? (
              <form onSubmit={handleRequestReset} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="recovery-email" className="mb-1.5 block text-xs font-semibold text-[#344054]">Account email</label>
                  <input id="recovery-email" type="email" autoComplete="email" value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} required maxLength={254} className="salon-input w-full px-3 text-sm text-[#14213D]" />
                </div>
                <button type="submit" disabled={recoveryBusy} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#0D6EFD] to-[#0B5ED7] text-sm font-bold text-white disabled:opacity-60">
                  {recoveryBusy ? 'Sending…' : 'Send reset link'}
                </button>
                <button type="button" onClick={() => { setRecoveryMode('login'); setRecoveryError(''); setRecoveryMessage(''); }} className="w-full text-center text-xs font-semibold text-[#0B5ED7] underline underline-offset-2">
                  Back to sign in
                </button>
              </form>
            ) : recoveryMode === 'reset' ? (
              <form onSubmit={handleConfirmReset} className="mt-6 space-y-4">
                <div>
                  <label htmlFor="new-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">New password</label>
                  <input id="new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required className="salon-input w-full px-3 text-sm text-[#14213D]" />
                </div>
                <div>
                  <label htmlFor="confirm-new-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">Confirm new password</label>
                  <input id="confirm-new-password" type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required className="salon-input w-full px-3 text-sm text-[#14213D]" />
                </div>
                <button type="submit" disabled={recoveryBusy || !resetToken} className="h-12 w-full rounded-xl bg-gradient-to-r from-[#0D6EFD] to-[#0B5ED7] text-sm font-bold text-white disabled:opacity-60">
                  {recoveryBusy ? 'Updating…' : 'Set new password'}
                </button>
                {!resetToken && <p className="text-xs text-[#B91C1C]">This reset link is missing its token. Request a new link.</p>}
              </form>
            ) : roleSetupRequired && role === 'employee' ? (
              <p className="mt-6 rounded-lg border border-[#DDE6F1] bg-white px-3 py-2 text-xs text-[#64748B]">
                Employee sign-in will be available after the administrator completes setup.
              </p>
            ) : !connectionError ? (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {roleSetupRequired && (
                  <div>
                    <label htmlFor="admin-name" className="mb-1.5 block text-xs font-semibold text-[#344054]">
                      {role === 'superadmin' ? 'Superadmin name' : 'Admin name'}
                    </label>
                    <input
                      id="admin-name"
                      autoComplete="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      required
                      className="salon-input w-full px-3 text-sm text-[#14213D]"
                    />
                  </div>
                )}

                {roleSetupRequired && (
                  <div>
                    <label htmlFor="admin-email" className="mb-1.5 block text-xs font-semibold text-[#344054]">
                      Work email
                    </label>
                    <input
                      id="admin-email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                      className="salon-input w-full px-3 text-sm text-[#14213D]"
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="staff-username" className="mb-1.5 block text-xs font-semibold text-[#344054]">
                    Username
                  </label>
                  <input
                    id="staff-username"
                    autoComplete="username"
                    minLength={3}
                    maxLength={30}
                    pattern={'[A-Za-z0-9._\\-]{3,30}'}
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    required
                    className="salon-input w-full px-3 text-sm text-[#14213D]"
                  />
                </div>

                <div>
                  <label htmlFor="staff-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">
                    Password{roleSetupRequired ? ' (at least 10 characters)' : ''}
                  </label>
                  <input
                    id="staff-password"
                    type="password"
                    autoComplete={roleSetupRequired ? 'new-password' : 'current-password'}
                    minLength={roleSetupRequired ? 10 : undefined}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    className="salon-input w-full px-3 text-sm text-[#14213D]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busy}
                  className="h-12 w-full rounded-xl bg-gradient-to-r from-[#0D6EFD] to-[#0B5ED7] text-sm font-bold text-white disabled:opacity-60"
                >
                  {busy ? 'Please wait…' : roleSetupRequired ? `Create ${role === 'superadmin' ? 'Superadmin' : 'Admin'} Account` : `Sign in to ${roleLabel} workspace`}
                </button>
                {!roleSetupRequired && !demoMode && (
                  <button type="button" onClick={() => { setRecoveryMode('request'); setRecoveryError(''); setRecoveryMessage(''); }} className="w-full text-center text-xs font-semibold text-[#0B5ED7] underline underline-offset-2">
                    Forgot password?
                  </button>
                )}
              </form>
            ) : (
              <button
                type="button"
                onClick={onRetry}
                className="mt-6 inline-flex h-11 items-center gap-2 rounded-lg bg-[#0B5ED7] px-4 text-sm font-semibold text-white"
              >
                <RefreshCw className="h-4 w-4" />
                Retry connection
              </button>
            )}
          </>
        )}

        {role && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[#E1E7F0] pt-4">
            <a
              href="/"
              onClick={(event) => {
                event.preventDefault();
                onNavigate('/');
              }}
              className="text-xs font-semibold text-[#64748B] underline underline-offset-2 hover:text-[#0B5ED7]"
            >
              Choose workspace
            </a>
            {!roleSetupRequired && (role === 'admin' || role === 'superadmin') && (
              <a
                href="/employee"
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate('/employee');
                }}
                className="text-xs font-semibold text-[#0B5ED7] underline underline-offset-2"
              >
                Employee login
              </a>
            )}
          </div>
        )}
      </section>
      <BrandFooter className="w-full max-w-xl rounded-xl" />
    </main>
  );
}
