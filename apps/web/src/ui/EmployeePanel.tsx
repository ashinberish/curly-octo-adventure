import { useEffect, useRef, useState, type FormEvent } from 'react';
import { SKILLS, SKILL_NAMES, toolsFor, type SkillName } from '@pixel-office/shared';
import { activeTask, employeeStatus, suggestAssignees } from '../state/sim.ts';
import { officeStore } from '../state/store.ts';
import { Portrait, StatusPill, TaskItem, useOffice } from './common.tsx';

export function EmployeePanel() {
  const selectedId = useOffice(s => s.selectedId);
  const employee = useOffice(s => s.employees.find(e => e.id === s.selectedId));
  if (!selectedId || !employee) {
    return (
      <div className="empty">
        <span className="px">Nobody selected</span>
        Walk up to someone and press <kbd>E</kbd>, click them, or pick a card under the office.
      </div>
    );
  }
  // key: reset the form when switching people
  return <EmployeeDetails key={employee.id} id={employee.id} />;
}

function EmployeeDetails({ id }: { id: string }) {
  const employee = useOffice(s => s.employees.find(e => e.id === id))!;
  const employees = useOffice(s => s.employees);
  const tasks = useOffice(s => s.tasks);
  const presence = useOffice(s => s.presence);
  const flashUntil = useOffice(s => s.flashUntil);
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [skill, setSkill] = useState<SkillName>(employee.skills[0] ?? 'Code');

  const mine = tasks.filter(t => t.assigneeId === id).sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || b.id - a.id);
  const shown = activeTask(tasks, id) ?? mine.find(t => t.status !== 'done') ?? mine.find(t => t.status === 'done');
  const lacksSkill = !employee.skills.includes(skill);
  const alternative = lacksSkill ? suggestAssignees(employees, tasks, skill)[0] : undefined;
  const skillOrder = [...SKILL_NAMES].sort((a, b) => Number(employee.skills.includes(b)) - Number(employee.skills.includes(a)));

  const submit = (ev: FormEvent) => {
    ev.preventDefault();
    if (!title.trim()) return;
    officeStore.getState().assignTask(id, title.trim(), details.trim(), skill);
    setTitle('');
    setDetails('');
    (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div>
      <div className="emp-head">
        <Portrait look={employee.look} size={72} />
        <div>
          <h2>{employee.name}</h2>
          <div className="role">{employee.role}</div>
          <div style={{ marginTop: 6 }}><StatusPill status={employeeStatus(id, { tasks, presence, flashUntil }, performance.now())} /></div>
        </div>
      </div>

      <h3>Skills (click to toggle)</h3>
      <div className="chips">
        {SKILL_NAMES.map(s => {
          const on = employee.skills.includes(s);
          return (
            <button key={s} type="button" className={`chip${on ? ' on' : ''}`} aria-pressed={on} title={SKILLS[s].description}
              style={on ? { background: SKILLS[s].color } : undefined}
              onClick={() => officeStore.getState().toggleSkill(id, s)}>{s}</button>
          );
        })}
      </div>
      <p className="hint">
        {employee.skills.length ? `Agent tools: ${toolsFor(employee.skills).join(' · ')}` : 'No skills: this agent only gets read-only tools.'}
      </p>

      <h3>Assign a task</h3>
      <form onSubmit={submit} autoComplete="off">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Add rate limiting to /api/login" required maxLength={80} aria-label="Task title" />
        <textarea value={details} onChange={e => setDetails(e.target.value)} rows={2} placeholder="Details, acceptance criteria…" aria-label="Task details" />
        <div className="row">
          <select value={skill} onChange={e => setSkill(e.target.value as SkillName)} aria-label="Skill needed">
            {skillOrder.map(s => <option key={s} value={s}>{employee.skills.includes(s) ? '★ ' : ''}{s}</option>)}
          </select>
          <button className="btn" type="submit">{lacksSkill ? 'Assign anyway' : 'Assign ▶'}</button>
        </div>
        {lacksSkill && <div className="warn">⚠ {employee.name} doesn't have {skill}.{alternative ? ` ${alternative.name} does.` : ''}</div>}
      </form>

      <h3>Queue</h3>
      <ul className="tasks">
        {mine.length ? mine.map(t => <TaskItem key={t.id} task={t} />) : <li className="hint">No tasks yet.</li>}
      </ul>

      <h3>Agent console</h3>
      <AgentConsole taskId={shown?.id} />
    </div>
  );
}

function AgentConsole({ taskId }: { taskId?: number }) {
  const task = useOffice(s => s.tasks.find(t => t.id === taskId));
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [task?.log.length]);

  return (
    <>
      <div className="console" ref={box} onScroll={e => { const el = e.currentTarget; stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 4; }}>
        {task ? (
          <>
            <div className="sys">— {task.title} —</div>
            {task.log.map((l, i) => <div key={i} className={l.kind}>{l.text}</div>)}
            {task.status === 'running' && <span className="cursor" />}
          </>
        ) : <div className="sys">Idle. Assign a task to spin up an agent.</div>}
      </div>
      {task?.status === 'needs_input' && (
        <div className="approve">
          <span>Allow <b>{task.awaiting}</b>?</span>
          <button className="btn green" type="button" onClick={() => officeStore.getState().resolvePermission(task.id, true)}>Approve</button>
          <button className="btn red" type="button" onClick={() => officeStore.getState().resolvePermission(task.id, false)}>Deny</button>
        </div>
      )}
    </>
  );
}
