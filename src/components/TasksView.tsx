import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, ClipboardCheck, Clock3, Plus, RotateCcw } from 'lucide-react';
import { isAdminRole, type StaffTask, type StaffTaskStatus, type StaffUser } from '../types';
import { salonApi } from '../api/client';

function taskStatusLabel(status: StaffTaskStatus): string {
  return status === 'in_progress' ? 'In progress' : status === 'completed' ? 'Completed' : 'Assigned';
}

export function TasksView({ user }: { user: StaffUser }) {
  const isAdmin = isAdminRole(user.role);
  const [tasks, setTasks] = useState<StaffTask[]>([]);
  const [employees, setEmployees] = useState<StaffUser[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assignee, setAssignee] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<StaffTask['priority']>('normal');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [taskResult, staffResult] = await Promise.all([
        salonApi.listTasks(),
        isAdmin ? salonApi.listEmployees() : Promise.resolve({ employees: [] as StaffUser[] }),
      ]);
      setTasks(taskResult.tasks);
      if (isAdmin) {
        const active = staffResult.employees.filter((employee) => employee.active);
        setEmployees(active);
        setAssignee((current) => active.some((employee) => employee.id === current) ? current : active[0]?.id || '');
      }
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load staff tasks.');
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refresh);
    window.addEventListener('salon:workspace-updated', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('salon:workspace-updated', refresh);
    };
  }, [load]);

  const createTask = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await salonApi.createTask({ title, description, assigned_to_user_id: assignee, priority, due_date: dueDate });
      setTitle('');
      setDescription('');
      setDueDate('');
      setPriority('normal');
      setNotice('Task assigned to the employee.');
      await load();
      window.dispatchEvent(new Event('salon:workspace-updated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to create this task.');
    } finally {
      setSaving(false);
    }
  };

  const updateStatus = async (task: StaffTask, status: StaffTaskStatus) => {
    setError('');
    try {
      const result = await salonApi.updateTaskStatus(task.id, status);
      setTasks((current) => current.map((item) => item.id === task.id ? result.task : item));
      window.dispatchEvent(new Event('salon:workspace-updated'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this task.');
    }
  };

  const assignedCount = tasks.filter((task) => task.status === 'assigned').length;
  const progressCount = tasks.filter((task) => task.status === 'in_progress').length;
  const completedCount = tasks.filter((task) => task.status === 'completed').length;

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#C5D8F4] bg-gradient-to-r from-[#0A1D3A] via-[#0B3B7A] to-[#0B5ED7] px-5 py-5 text-white">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#DCEBFF]">{isAdmin ? 'Admin workspace' : 'Employee workspace'}</p>
        <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{isAdmin ? 'Staff Tasks' : 'My Tasks'}</h1>
        <p className="mt-2 text-sm text-[#E6F0FF]">Assign work, track progress, and confirm completion.</p>
      </section>
      <section className="grid gap-3 sm:grid-cols-3">
        {[{ label: 'Assigned', count: assignedCount, color: 'text-[#0757D8]' }, { label: 'In progress', count: progressCount, color: 'text-amber-700' }, { label: 'Completed', count: completedCount, color: 'text-emerald-700' }].map((item) => <article key={item.label} className="salon-card rounded-xl p-4"><p className="text-[10px] font-bold uppercase text-[#64748B]">{item.label}</p><p className={'mt-1 text-xl font-extrabold ' + item.color}>{item.count}</p></article>)}
      </section>
      {isAdmin && <form onSubmit={(event) => void createTask(event)} className="salon-card grid gap-3 rounded-2xl p-5 md:grid-cols-2">
        <div className="md:col-span-2"><h2 className="text-lg font-bold text-[#14213D]">Assign a task</h2><p className="mt-1 text-xs text-[#64748B]">The employee will see the assignment as soon as it is saved.</p></div>
        <label className="text-xs font-semibold text-[#344054]">Task title<input required maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} className="salon-input mt-1 w-full px-3 text-sm" placeholder="e.g. Prepare closing station" /></label>
        <label className="text-xs font-semibold text-[#344054]">Assign to<select required value={assignee} onChange={(event) => setAssignee(event.target.value)} className="salon-input mt-1 w-full px-3 text-sm"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
        <label className="text-xs font-semibold text-[#344054]">Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="salon-input mt-1 w-full px-3 text-sm" /></label>
        <label className="text-xs font-semibold text-[#344054]">Priority<select value={priority} onChange={(event) => setPriority(event.target.value as StaffTask['priority'])} className="salon-input mt-1 w-full px-3 text-sm"><option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option></select></label>
        <label className="text-xs font-semibold text-[#344054]">Details<textarea rows={2} maxLength={1000} value={description} onChange={(event) => setDescription(event.target.value)} className="mt-1 w-full rounded-lg border border-[#DDE6F1] px-3 py-2 text-sm text-[#14213D]" /></label>
        <div className="md:col-span-2"><button type="submit" disabled={saving || !employees.length} className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0D6EFD] px-4 text-sm font-bold text-white disabled:opacity-50"><Plus className="h-4 w-4" />{saving ? 'Assigning…' : 'Assign task'}</button></div>
      </form>}
      {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">{notice}</p>}
      <section className="salon-card overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-[#E1E7F0] px-5 py-4"><ClipboardCheck className="h-5 w-5 text-[#0D6EFD]" /><div><h2 className="text-lg font-bold text-[#14213D]">{isAdmin ? 'All assignments' : 'Assigned to me'}</h2><p className="mt-1 text-xs text-[#64748B]">Task status is shared with the other workspace.</p></div></div>
        {loading ? <p className="px-5 py-10 text-center text-sm text-[#64748B]">Loading tasks…</p> : tasks.length ? <div className="divide-y divide-[#E7ECF5]">{tasks.map((task) => <article key={task.id} className="flex flex-wrap items-start gap-3 px-5 py-4">
          <span className={'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (task.status === 'completed' ? 'bg-emerald-100 text-emerald-700' : task.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-[#E8F1FF] text-[#0D6EFD]')}>{task.status === 'completed' ? <CheckCircle2 className="h-4 w-4" /> : <Clock3 className="h-4 w-4" />}</span>
          <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-bold text-[#14213D]">{task.title}</h3><span className="rounded-full bg-[#F1F4F9] px-2 py-1 text-[9px] font-bold text-[#475467]">{taskStatusLabel(task.status)}</span><span className={'rounded-full px-2 py-1 text-[9px] font-bold uppercase ' + (task.priority === 'urgent' ? 'bg-red-100 text-red-700' : task.priority === 'high' ? 'bg-orange-100 text-orange-700' : task.priority === 'low' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700')}>{task.priority || 'normal'}</span></div>{task.description && <p className="mt-1 whitespace-pre-wrap text-xs text-[#475467]">{task.description}</p>}<p className="mt-2 text-[10px] text-[#64748B]">{isAdmin ? `For ${task.assignee_name}` : `Assigned by ${task.creator_name}`}{task.due_date ? ` · Due ${task.due_date}` : ''}</p></div>
          {task.status === 'assigned' && <button type="button" onClick={() => void updateStatus(task, 'in_progress')} className="rounded-lg border border-[#B7D2FF] bg-[#EFF6FF] px-3 py-2 text-xs font-bold text-[#0757D8]">Start task</button>}
          {task.status === 'in_progress' && <button type="button" onClick={() => void updateStatus(task, 'completed')} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white">Mark complete</button>}
          {isAdmin && task.status === 'completed' && <button type="button" onClick={() => void updateStatus(task, 'in_progress')} className="inline-flex items-center gap-1 rounded-lg border border-[#DDE6F1] px-3 py-2 text-xs font-bold text-[#475467]"><RotateCcw className="h-3.5 w-3.5" />Reopen</button>}
        </article>)}</div> : <p className="px-5 py-10 text-center text-sm text-[#64748B]">{isAdmin ? 'No tasks assigned yet.' : 'You have no assigned tasks.'}</p>}
      </section>
    </div>
  );
}
