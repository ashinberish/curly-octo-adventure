import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SKILLS, SKILL_NAMES, activeTask, isOpen, suggestAssignees, toolsFor, type Employee, type LogLine, type SkillName, type Task, type TaskFile } from '@pixel-office/shared';
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
      {task?.status === 'needs_input' && <WaitingOnYou task={task} />}
      {task?.result && (task.status === 'done' || task.status === 'failed') && (
        <div className={`summary${task.status === 'failed' ? ' failed' : ''}`}><b>{task.status === 'failed' ? 'Stopped' : 'Summary'}</b>{task.result}</div>
      )}
      {task?.runner === 'claude' && <TaskFiles task={task} />}
    </>
  );
}

/** A task blocked on you: approve a simulated tool call, or answer a Claude agent's question. */
function WaitingOnYou({ task }: { task: Task }) {
  const name = useOffice(s => s.employees.find(e => e.id === task.assigneeId)?.name ?? 'The agent');
  const [answer, setAnswer] = useState('');
  const [sending, setSending] = useState(false);
  const send = async (allow: boolean, text?: string) => {
    setSending(true);
    await officeStore.getState().resolvePermission(task.id, allow, text);
    setSending(false);
  };
  if (task.runner !== 'claude') {
    return (
      <div className="approve">
        <span>Allow <b>{task.awaiting}</b>?</span>
        <button className="btn green" type="button" disabled={sending} onClick={() => void send(true)}>Approve</button>
        <button className="btn red" type="button" disabled={sending} onClick={() => void send(false)}>Deny</button>
      </div>
    );
  }
  return (
    <form className="approve question" onSubmit={e => { e.preventDefault(); if (answer.trim()) void send(true, answer.trim()); }}>
      <div><b>{name} asks:</b> {task.awaiting}</div>
      <textarea value={answer} onChange={e => setAnswer(e.target.value)} rows={2} placeholder="Your answer…" aria-label="Your answer" maxLength={4000} />
      <div className="row">
        <button className="btn green" type="submit" disabled={sending || !answer.trim()}>Send answer</button>
        <button className="btn small" type="button" disabled={sending} onClick={() => void send(true)}>Yes</button>
        <button className="btn small red" type="button" disabled={sending} onClick={() => void send(false)}>No</button>
      </div>
    </form>
  );
}

const FILES_POLL_MS = 3000;

/** Files the agent saved for this task, with a preview. HTML renders in a sandboxed frame with scripts off. */
function TaskFiles({ task }: { task: Task }) {
  const [files, setFiles] = useState<TaskFile[]>([]);
  const [open, setOpen] = useState<{ path: string; content: string } | null>(null);
  const live = isOpen(task);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await officeStore.getState().fetchFiles(task.id);
        if (!cancelled) setFiles(next);
      } catch { /* reported by the store's polling */ }
      if (!cancelled && live) timer = setTimeout(() => void load(), FILES_POLL_MS);
    };
    void load();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [task.id, live]);

  const show = async (path: string) => {
    if (open?.path === path) return setOpen(null);
    try { setOpen({ path, content: await officeStore.getState().fetchFile(task.id, path) }); }
    catch (e) { officeStore.getState().toast(`⚠ ${e instanceof Error ? e.message : String(e)}`); }
  };
  const download = (f: { path: string; content: string }) => {
    const url = URL.createObjectURL(new Blob([f.content], { type: 'text/plain;charset=utf-8' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: f.path.split('/').pop() ?? 'file.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <h3>Files</h3>
      {files.length ? (
        <ul className="files">
          {files.map(f => (
            <li key={f.path}>
              <button type="button" className={`file${open?.path === f.path ? ' on' : ''}`} onClick={() => void show(f.path)}>
                <span>{f.path}</span><span className="hint">{f.size < 1024 ? `${f.size} B` : `${(f.size / 1024).toFixed(1)} KB`}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : <p className="hint">{live ? 'Nothing saved yet.' : 'No files.'}</p>}
      {open && (
        <div className="viewer">
          <div className="row"><b className="path">{open.path}</b><button type="button" className="btn small" onClick={() => download(open)}>Download</button></div>
          {/\.html?$/i.test(open.path)
            ? <iframe title={open.path} sandbox="" srcDoc={open.content} />
            : <pre>{open.content}</pre>}
        </div>
      )}
    </>
  );
}
