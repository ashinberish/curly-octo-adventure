import { useEffect, useRef } from 'react';
import { useStore } from 'zustand';
import { employeeStatus, type EmployeeStatus, type Look, type Task } from '@pixel-office/shared';
import { drawPortrait } from '../art/character.ts';
import { CanvasPainter } from '../art/painter.ts';
import { officeStore, type OfficeState } from '../state/store.ts';

export const useOffice = <T,>(selector: (s: OfficeState) => T): T => useStore(officeStore, selector);

/** An employee's status on the server's clock; re-renders whenever office data or presence changes. */
export function useEmployeeStatus(id: string): EmployeeStatus {
  const tasks = useOffice(s => s.tasks);
  const presence = useOffice(s => s.presence[id]);
  return employeeStatus(id, tasks, presence, officeStore.getState().serverNow());
}

export const STATUS_LABEL: Record<Task['status'], string> = { queued: 'Queued', running: 'Working', needs_input: 'Needs you', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' };

export const usd = (n: number) => (n < 0.01 && n > 0 ? '<$0.01' : `$${n.toFixed(2)}`);

const EMPLOYEE_STATUS: Record<EmployeeStatus, [string, string]> = {
  idle: ['idle', '#d8d1c0'],
  away: ['on a break', '#c9b2ff'],
  running: ['working', '#8fb2ff'],
  needs_input: ['needs you', '#ffe08a'],
  done: ['finished', '#a9dca3'],
};

export function StatusPill({ status }: { status: EmployeeStatus }) {
  const [label, color] = EMPLOYEE_STATUS[status];
  return <span className="st"><i className="sq" style={{ background: color }} />{label}</span>;
}

export function Portrait({ look, size = 48 }: { look: Look; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(3, 0, 0, 3, 0, 0);
    ctx.clearRect(0, 0, 16, 16);
    drawPortrait(new CanvasPainter(ctx), look);
  }, [look]);
  return <canvas ref={ref} width={48} height={48} style={{ width: size, height: size }} aria-hidden="true" />;
}

export function TaskItem({ task, assignee }: { task: Task; assignee?: string }) {
  const active = task.status === 'running' || task.status === 'needs_input';
  const open = active || task.status === 'queued';
  return (
    <li className="task">
      <div className="t1">
        <b title={task.result ? `${task.title}\n\n${task.result}` : task.title}>{task.title}</b>
        <span className={`status s-${task.status}`}>{STATUS_LABEL[task.status]}</span>
      </div>
      <div className="meta">
        {assignee && <span>@{assignee}</span>}
        <span>{task.skill}</span>
        {task.runner === 'claude' && task.costUsd > 0 && <span title="Estimated API cost">{usd(task.costUsd)}</span>}
        {open && (
          <button type="button" className="link" onClick={() => void officeStore.getState().cancelTask(task.id)} aria-label={`Cancel “${task.title}”`}>
            cancel
          </button>
        )}
      </div>
      {active && <div className="mini"><i style={{ width: `${Math.round(task.progress * 100)}%` }} /></div>}
    </li>
  );
}
