import { useState, type FormEvent } from 'react';
import { SKILL_NAMES, type SkillName, type TaskStatus } from '@pixel-office/shared';
import { officeStore } from '../state/store.ts';
import { STATUS_LABEL, TaskItem, useOffice } from './common.tsx';

const COLUMNS: TaskStatus[] = ['needs_input', 'running', 'queued', 'done'];

export function TaskBoard() {
  const tasks = useOffice(s => s.tasks);
  const employees = useOffice(s => s.employees);
  const [title, setTitle] = useState('');
  const [skill, setSkill] = useState<SkillName>('Code');
  const [who, setWho] = useState('auto');
  const [sending, setSending] = useState(false);
  const nameOf = (id: string) => employees.find(e => e.id === id)?.name ?? id;

  const submit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!title.trim() || sending) return;
    setSending(true);
    const ok = await officeStore.getState().assignTask(who, title.trim(), '', skill);
    setSending(false);
    if (ok) { setTitle(''); (document.activeElement as HTMLElement | null)?.blur(); }
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>Quick assign</h3>
      <form onSubmit={e => void submit(e)} autoComplete="off">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="What needs doing?" required maxLength={120} aria-label="Task title" />
        <div className="row">
          <select value={skill} onChange={e => setSkill(e.target.value as SkillName)} aria-label="Skill needed">
            {SKILL_NAMES.map(s => <option key={s}>{s}</option>)}
          </select>
          <select value={who} onChange={e => setWho(e.target.value)} aria-label="Assignee">
            <option value="auto">Auto-match by skill</option>
            {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <button className="btn" type="submit" disabled={sending}>Add to board ▶</button>
      </form>

      {COLUMNS.map(status => {
        // Failed runs are listed with the finished ones.
        const list = tasks.filter(t => t.status === status || (status === 'done' && t.status === 'failed')).sort((a, b) => b.id - a.id);
        return (
          <section key={status}>
            <div className="colhead"><h3>{STATUS_LABEL[status]}</h3><span className={`status s-${status}`}>{list.length}</span></div>
            <ul className="tasks">
              {list.length ? list.map(t => <TaskItem key={t.id} task={t} assignee={nameOf(t.assigneeId)} />) : <li className="hint">—</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
