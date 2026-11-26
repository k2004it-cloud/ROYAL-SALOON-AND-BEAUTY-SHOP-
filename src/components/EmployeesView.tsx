import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, UserRound, UserRoundX, X } from 'lucide-react';
import type { StaffUser } from '../types';
import { salonApi } from '../api/client';

interface EmployeesViewProps {
  onNotify: (message: string) => void;
  demoMode: boolean;
  isSuperadmin?: boolean;
}

export function EmployeesView({ onNotify, demoMode, isSuperadmin = false }: EmployeesViewProps) {
  const [employees, setEmployees] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadEmployees = useCallback(async () => {
    setError('');
    try {
      const result = await salonApi.listEmployees();
      setEmployees(result.employees);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load employee accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEmployees();
    const refreshWhileVisible = () => {
      if (document.visibilityState === 'visible') void loadEmployees();
    };
    window.addEventListener('focus', refreshWhileVisible);
    document.addEventListener('visibilitychange', refreshWhileVisible);
    window.addEventListener('salon:workspace-updated', refreshWhileVisible);
    return () => {
      window.removeEventListener('focus', refreshWhileVisible);
      document.removeEventListener('visibilitychange', refreshWhileVisible);
      window.removeEventListener('salon:workspace-updated', refreshWhileVisible);
    };
  }, [loadEmployees]);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      await salonApi.createEmployee({ name, username, email, phone, job_title: jobTitle, password });
      setModalOpen(false);
      setName('');
      setUsername('');
      setEmail('');
      setPhone('');
      setJobTitle('');
      setPassword('');
      await loadEmployees();
      onNotify('Employee account created');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create employee account.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (employee: StaffUser) => {
    setError('');
    try {
      await salonApi.updateEmployee(employee.id, { active: !employee.active });
      await loadEmployees();
      onNotify(employee.active ? 'Employee access disabled' : 'Employee access restored');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to update employee access.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.24em] text-[#2563EB]">
            {isSuperadmin ? 'Superadmin Controls' : 'Admin Workspace'}
          </p>
          <h1 className="font-serif-editorial text-3xl font-semibold tracking-tight text-[#14213D]">
            Employees & Access
          </h1>
          <p className="mt-1 text-sm text-[#667085]">
            Create employee accounts with individual usernames and passwords.
          </p>
          {demoMode && (
            <p className="mt-2 text-xs font-semibold text-amber-800">
              Demo data environment. Do not enter real customer information.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setError('');
            setModalOpen(true);
          }}
          className="inline-flex h-11 items-center gap-2 self-start rounded-lg bg-gradient-to-r from-[#0D6EFD] to-[#0B5ED7] px-5 text-sm font-semibold text-white shadow-[0_10px_22px_-12px_rgba(13,110,253,0.28)] sm:self-auto"
        >
          <Plus className="h-4 w-4" />
          Add Employee
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-xs font-semibold text-[#B91C1C]">
          {error}
        </p>
      )}

      {loading ? (
        <div className="salon-card rounded-2xl p-8 text-center text-sm text-[#667085]">
          Loading employee accounts…
        </div>
      ) : employees.length === 0 ? (
        <div className="salon-card rounded-2xl p-10 text-center">
          <UserRound className="mx-auto h-8 w-8 text-[#2563EB]" />
          <p className="mt-3 text-sm font-semibold text-[#14213D]">No employee accounts yet</p>
          <p className="mt-1 text-xs text-[#64748B]">Add staff so they can sign in to the salon workspace.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {employees.map((employee) => (
            <article key={employee.id} className="salon-card flex items-center justify-between gap-4 rounded-2xl p-5">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#E8F1FF] text-[#0B5ED7]">
                  <UserRound className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-bold text-[#14213D]">{employee.name}</h2>
                  <p className="truncate text-xs font-semibold text-[#0B5ED7]">@{employee.username}</p>
                  <p className="truncate text-xs text-[#64748B]">{employee.email}</p>
                  <p className="truncate text-xs text-[#64748B]">{employee.phone || 'Phone not added'}</p>
                  <p className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">{employee.job_title || 'Employee'}</p>
                  <p className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#0B5ED7]">
                    <KeyRound className="h-3 w-3" />
                    Username & password access
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${employee.active ? 'bg-[#ECFDF5] text-[#047857]' : 'bg-[#F1F4F9] text-[#667085]'}`}>
                  {employee.active ? 'Active' : 'Disabled'}
                </span>
                <button
                  type="button"
                  onClick={() => void handleToggleActive(employee)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#E1E7F0] px-3 text-xs font-semibold text-[#344054] hover:bg-[#F4F7FC]"
                >
                  {employee.active ? <UserRoundX className="h-3.5 w-3.5" /> : <UserRound className="h-3.5 w-3.5" />}
                  {employee.active ? 'Disable access' : 'Enable access'}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071426]/50 p-4">
          <section className="salon-sheet w-full max-w-lg space-y-5 rounded-2xl p-6">
            <div className="flex items-center justify-between border-b border-[#E1E7F0] pb-4">
              <div>
                <h2 className="font-serif-editorial text-2xl font-semibold text-[#14213D]">Add Employee</h2>
                <p className="mt-0.5 text-xs text-[#667085]">Create the employee’s workspace credentials.</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Close employee form"
                className="flex h-10 w-10 items-center justify-center rounded-lg text-[#667085] hover:bg-[#F1F4F9]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label htmlFor="employee-name" className="mb-1.5 block text-xs font-semibold text-[#344054]">Employee name</label>
                <input id="employee-name" value={name} onChange={(event) => setName(event.target.value)} required className="salon-input w-full px-3 text-sm" />
              </div>
              <div>
                <label htmlFor="employee-job-title" className="mb-1.5 block text-xs font-semibold text-[#344054]">Employee position / role</label>
                <input id="employee-job-title" value={jobTitle} onChange={(event) => setJobTitle(event.target.value)} minLength={2} maxLength={80} placeholder="e.g. Hair Stylist, Nail Technician, Receptionist" required className="salon-input w-full px-3 text-sm" />
              </div>
              <div>
                <label htmlFor="employee-username" className="mb-1.5 block text-xs font-semibold text-[#344054]">Username</label>
                <input id="employee-username" autoComplete="off" minLength={3} maxLength={30} pattern={'[A-Za-z0-9._\\-]{3,30}'} value={username} onChange={(event) => setUsername(event.target.value)} required className="salon-input w-full px-3 text-sm" />
              </div>
              <div>
                <label htmlFor="employee-email" className="mb-1.5 block text-xs font-semibold text-[#344054]">Work email</label>
                <input id="employee-email" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} required className="salon-input w-full px-3 text-sm" />
              </div>
              <div>
                <label htmlFor="employee-phone" className="mb-1.5 block text-xs font-semibold text-[#344054]">Phone number</label>
                <input id="employee-phone" type="tel" autoComplete="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} className="salon-input w-full px-3 text-sm" />
              </div>
              <div>
                <label htmlFor="employee-password" className="mb-1.5 block text-xs font-semibold text-[#344054]">Temporary password (10+ characters)</label>
                <input id="employee-password" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(event) => setPassword(event.target.value)} required className="salon-input w-full px-3 text-sm" />
              </div>
              <p className="text-xs text-[#667085]">Appointments and service commissions will be linked to this employee account and position.</p>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setModalOpen(false)} className="h-11 rounded-lg border border-[#E1E7F0] px-4 text-sm font-semibold text-[#14213D]">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="h-11 rounded-lg bg-[#6D28D9] px-5 text-sm font-semibold text-white disabled:opacity-60">
                  {saving ? 'Creating…' : 'Create Account'}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
