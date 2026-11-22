import { useState } from 'react';
import { ArrowRight, Crown, LockKeyhole, RefreshCw } from 'lucide-react';
import type { StaffRole } from '../types';

interface AuthViewProps {
  role: StaffRole | null;
  setupRequired: boolean;
  demoMode: boolean;
  connectionError: boolean;
  error: string;
  busy: boolean;
  onSetup: (payload: { name: string; username: string; email: string; password: string }) => void;
  onLogin: (payload: { username: string; password: string; role: StaffRole }) => void;
  onNavigate: (path: string) => void;
  onRetry: () => void;
}

export function AuthView({
  role,
  setupRequired,
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

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!role) return;
    if (setupRequired && role === 'admin') {
      onSetup({ name, username, email, password });
    } else {
      onLogin({ username, password, role });
    }
  };

  const roleLabel = role === 'admin' ? 'Admin' : 'Employee';

  return (
    <main className="min-h-screen flex items-center justify-center bg-transparent p-4">
      <section className="salon-card w-full max-w-xl rounded-3xl p-6 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#3B82F6] to-[#0B5ED7] text-white">
            {setupRequired && role === 'admin' ? <Crown className="h-5 w-5" /> : <LockKeyhole className="h-5 w-5" />}
          </span>
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
                ['admin', 'Admin Login', 'Manage salon operations, services, sales, and staff.'],
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
                  {targetRole === 'admin' && setupRequired && (
                    <span className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-[#0B5ED7]">
                      First-time setup
                    </span>
                  )}
                  {targetRole === 'employee' && setupRequired && (
                    <span className="mt-3 block text-[10px] font-bold uppercase tracking-wide text-[#64748B]">
                      Admin setup required first
                    </span>
                  )}
                </a>
              ))}
            </div>
          </>
        ) : (
          <>
            <h1 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">
              {setupRequired && role === 'admin' ? 'Set up the Owner / Admin account' : `${roleLabel} sign in`}
            </h1>
            <p className="mt-1 text-sm text-[#64748B]">
              {setupRequired && role === 'admin'
                ? 'Create the first Admin account. You can add Employee accounts afterward.'
                : setupRequired
                  ? 'The Owner / Admin account must be set up before Employees can sign in.'
                  : 'Use your assigned username and password.'}
            </p>
            {demoMode && (
              <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
                Demo data environment. Do not enter real customer information.
              </p>
            )}
            {demoMode && !setupRequired && (
              <p className="mt-3 rounded-lg border border-[#DDE6F1] bg-white px-3 py-2 text-xs text-[#64748B]">
                Development sign-in: {role === 'admin' ? (
                  <>Admin <strong>admin / 0000</strong></>
                ) : (
                  <>Employee <strong>test / 11111</strong></>
                )}
              </p>
            )}
            {error && (
              <div role="alert" className="mt-4 rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
                {error}
              </div>
            )}

            {setupRequired && role === 'employee' ? (
              <button
                type="button"
                onClick={() => onNavigate('/admin/login')}
                className="mt-6 h-11 rounded-lg bg-[#0B5ED7] px-4 text-sm font-semibold text-white"
              >
                Go to Admin setup
              </button>
            ) : !connectionError ? (
              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {setupRequired && (
                  <div>
                    <label htmlFor="admin-name" className="mb-1.5 block text-xs font-semibold text-[#344054]">
                      Administrator name
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

                {setupRequired && (
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
                    Password{setupRequired ? ' (at least 10 characters)' : ''}
                  </label>
                  <input
                    id="staff-password"
                    type="password"
                    autoComplete={setupRequired ? 'new-password' : 'current-password'}
                    minLength={setupRequired ? 10 : undefined}
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
                  {busy ? 'Please wait…' : setupRequired ? 'Create Admin Account' : `Sign in to ${roleLabel} workspace`}
                </button>
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
            {!setupRequired && (
              <a
                href={role === 'admin' ? '/employee' : '/admin'}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigate(role === 'admin' ? '/employee' : '/admin');
                }}
                className="text-xs font-semibold text-[#0B5ED7] underline underline-offset-2"
              >
                {role === 'admin' ? 'Employee login' : 'Admin login'}
              </a>
            )}
          </div>
        )}
      </section>
    </main>
  );
}
