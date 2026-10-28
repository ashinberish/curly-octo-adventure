import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SKILLS, SKILL_NAMES, activeTask, isOpen, suggestAssignees, toolsFor, type Employee, type LogLine, type SkillName } from '@pixel-office/shared';
import { officeStore } from '../state/store.ts';
import { Portrait, StatusPill, TaskItem, useEmployeeStatus, useOffice } from './common.tsx';

export function EmployeePanel() {
  const employee = useOffice(s => s.employees.find(e => e.id === s.selectedId));
  if (!employee) {
    return (
      <div className="empty">
        <span className="px">Nobody selected</span>
        Walk up to someone and press <kbd>E</kbd>, click them, or pick a card under the office.
      </div>
    );
  }
  // key: reset forms when switching people
  return <EmployeeDetails key={employee.id} employee={employee} />;
}

function EmployeeDetails({ employee }: { employee: Employee }) {
  const id = employee.id;
  const employees = useOffice(s => s.employees);
  const tasks = useOffice(s => s.tasks);
  const status = useEmployeeStatus(id);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [skill, setSkill] = useState<SkillName>(employee.skills[0] ?? 'Code');
  const [sending, setSending] = useState(false);

  const mine = tasks.filter(t => t.assigneeId === id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || b.id - a.id);
  const shown = activeTask(tasks, id) ?? mine.find(isOpen) ?? mine.find(t => t.status === 'done');
  const lacksSkill = !employee.skills.includes(skill);
  const alternative = lacksSkill ? suggestAssignees(employees, tasks, skill)[0] : undefined;
  const skillOrder = [...SKILL_NAMES].sort((a, b) => Number(employee.skills.includes(b)) - Number(employee.skills.includes(a)));

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!title.trim() || sending) return;
    setSending(true);
    const ok = await officeStore.getState().assignTask(id, title.trim(), details.trim(), skill);
    setSending(false);
    if (ok) { setTitle(''); setDetails(''); (document.activeElement as HTMLElement | null)?.blur(); }
  };

  const fire = async () => {
    const open = mine.filter(isOpen).length;
    const warning = open ? ` Their ${open} open task${open > 1 ? 's' : ''} will be deleted too.` : '';
    if (window.confirm(`Let ${employee.name} go?${warning}`)) await officeStore.getState().fire(id);
  };

  return (
    <div>
      <div className="emp-head">
        <Portrait look={employee.look} size={72} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{employee.name}</h2>
          <div className="role">{employee.role}</div>
          <div style={{ marginTop: 6 }}><StatusPill status={status} /></div>
        </div>
        <div className="head-actions">
          <button type="button" className="btn small" onClick={() => setEditing(v => !v)} aria-expanded={editing}>{editing ? 'Close' : 'Edit'}</button>
          <button type="button" className="btn small red" onClick={() => void fire()}>Fire</button>
        </div>
      </div>
      {editing && <EditEmployee employee={employee} onDone={() => setEditing(false)} />}

      <h3>Skills (click to toggle)</h3>
      <div className="chips">
        {SKILL_NAMES.map(s => {
          const on = employee.skills.includes(s);
          return (
            <button key={s} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} title={SKILLS[s].description}
              style={on ? { background: SKILLS[s].color } : undefined}
              onClick={() => void officeStore.getState().toggleSkill(id, s)}>{s}</button>
          );
        })}
      </div>
      <p className="hint">
        {employee.skills.length ? `Agent tools: ${toolsFor(employee.skills).join(' · ')}` : 'No skills: this agent only gets read-only tools.'}
      </p>

      <h3>Assign a task</h3>
      <form onSubmit={e => void submit(e)} autoComplete="off">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Add rate limiting to /api/login" required maxLength={120} aria-label="Task title" />
        <textarea value={details} onChange={e => setDetails(e.target.value)} rows={2} placeholder="Details, acceptance criteria…" aria-label="Task details" maxLength={4000} />
        <div className="row">
          <select value={skill} onChange={e => setSkill(e.target.value as SkillName)} aria-label="Skill needed">
            {skillOrder.map(s => <option key={s} value={s}>{employee.skills.includes(s) ? '★ ' : ''}{s}</option>)}
          </select>
          <button className="btn" type="submit" disabled={sending}>{lacksSkill ? 'Assign anyway' : 'Assign ▶'}</button>
        </div>
        {lacksSkill && <div className="warn">⚠ {employee.name} doesn't have {skill}.{alternative ? ` ${alternative.name} does.` : ''}</div>}
      </form>

      <h3>Queue</h3>
      <ul className="tasks">
        {mine.length ? mine.map(t => <TaskItem key={t.id} task={t} />) : <li className="hint">No tasks yet.</li>}
      </ul>

      <h3>Agent console</h3>
      {shown ? <AgentConsole key={shown.id} taskId={shown.id} /> : <div className="console"><div className="sys">Idle. Assign a task to spin up an agent.</div></div>}
    </div>
  );
}

function EditEmployee({ employee, onDone }: { employee: Employee; onDone: () => void }) {
  const desks = useOffice(s => s.desks);
  const taken = useOffice(s => s.employees);
  const [name, setName] = useState(employee.name);
  const [role, setRole] = useState(employee.role);
  const [deskId, setDeskId] = useState(employee.deskId);
  const free = desks.filter(d => d === employee.deskId || !taken.some(e => e.deskId === d));

  const save = async (ev: FormEvent) => {
    ev.preventDefault();
    const patch = {
      ...(name.trim() !== employee.name ? { name: name.trim() } : {}),
      ...(role.trim() !== employee.role ? { role: role.trim() } : {}),
      ...(deskId !== employee.deskId ? { deskId } : {}),
    };
    if (!Object.keys(patch).length || (await officeStore.getState().updateEmployee(employee.id, patch))) onDone();
  };

  return (
    <form className="edit" onSubmit={e => void save(e)} autoComplete="off">
      <label>Name<input value={name} onChange={e => setName(e.target.value)} required maxLength={40} /></label>
      <label>Role<input value={role} onChange={e => setRole(e.target.value)} required maxLength={60} /></label>
      <label>Desk<select value={deskId} onChange={e => setDeskId(e.target.value)}>{free.map(d => <option key={d}>{d}</option>)}</select></label>
      <button className="btn" type="submit">Save</button>
    </form>
  );
}

const LOG_POLL_MS = 1000;

/** The run log for one task, fetched incrementally while the task is still going. */
function AgentConsole({ taskId }: { taskId: number }) {
  const task = useOffice(s => s.tasks.find(t => t.id === taskId));
  const [lines, setLines] = useState<LogLine[]>([]);
  const after = useRef(0);
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const status = task?.status;
  const live = task ? isOpen(task) : false;

  // Re-runs on status changes too, so the last lines arrive when the task finishes.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const next = await officeStore.getState().fetchLog(taskId, after.current);
        if (cancelled) return;
        if (next.length) { after.current = next[next.length - 1].id; setLines(l => [...l, ...next]); }
      } catch { /* connection problems are reported by the store's polling */ }
      if (!cancelled && live) timer = setTimeout(() => void poll(), LOG_POLL_MS);
    };
    void poll();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [taskId, live, status]);

  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [lines.length]);

  return (
    <>
      <div className="console" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4; }}>
        <div className="sys">— {task?.title ?? 'Task'} —</div>
        {lines.map(l => <div key={l.id} className={l.kind}>{l.text}</div>)}
        {task?.status === 'running' && <span className="cursor" />}
      </div>
      {task?.status === 'needs_input' && (
        <div className="approve">
          <span>Allow <b>{task.awaiting}</b>?</span>
          <button className="btn green" type="button" onClick={() => void officeStore.getState().resolvePermission(task.id, true)}>Approve</button>
          <button className="btn red" type="button" onClick={() => void officeStore.getState().resolvePermission(task.id, false)}>Deny</button>
        </div>
      )}
    </>
  );
}
