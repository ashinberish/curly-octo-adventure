import { activeTask, employeeStatus } from '../state/sim.ts';
import { officeStore } from '../state/store.ts';
import { Portrait, StatusPill, useOffice } from './common.tsx';

export function CrewStrip() {
  const employees = useOffice(s => s.employees);
  const tasks = useOffice(s => s.tasks);
  const presence = useOffice(s => s.presence);
  const flashUntil = useOffice(s => s.flashUntil);
  const selectedId = useOffice(s => s.selectedId);
  const now = performance.now();

  return (
    <div className="crew" aria-label="Employees">
      {employees.map(e => {
        const current = activeTask(tasks, e.id);
        const open = tasks.filter(t => t.assigneeId === e.id && t.status !== 'done').length;
        const sub = current ? current.title : open ? `${open} task${open > 1 ? 's' : ''} queued` : e.role;
        return (
          <button key={e.id} type="button" className="card" aria-pressed={selectedId === e.id}
            onClick={() => officeStore.getState().select(e.id, { focus: true })}>
            <Portrait look={e.look} />
            <div className="body">
              <div className="nm">{e.name.toUpperCase()} <span aria-hidden="true">✎</span></div>
              <div className="sub">{sub}</div>
              <StatusPill status={employeeStatus(e.id, { tasks, presence, flashUntil }, now)} />
              <div className="mini"><i style={{ width: `${Math.round((current?.progress ?? 0) * 100)}%` }} /></div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
