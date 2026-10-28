import { activeTask, isOpen, type Employee } from '@pixel-office/shared';
import { officeStore } from '../state/store.ts';
import { Portrait, StatusPill, useEmployeeStatus, useOffice } from './common.tsx';

export function CrewStrip() {
  const employees = useOffice(s => s.employees);
  const loaded = useOffice(s => s.loaded);
  const freeDesks = useOffice(s => s.desks.length - s.employees.length);
  return (
    <div className="crew" aria-label="Employees">
      {employees.map(e => <CrewCard key={e.id} employee={e} />)}
      {loaded && (
        <button type="button" className="card hire" onClick={() => officeStore.getState().setTab('hire')} disabled={freeDesks <= 0}
          title={freeDesks > 0 ? `${freeDesks} free desk${freeDesks > 1 ? 's' : ''}` : 'Every desk is taken'}>
          <span className="plus" aria-hidden="true">+</span>
          <div className="body"><div className="nm">HIRE</div><div className="sub">{freeDesks > 0 ? `${freeDesks} free desk${freeDesks > 1 ? 's' : ''}` : 'office is full'}</div></div>
        </button>
      )}
    </div>
  );
}

function CrewCard({ employee: e }: { employee: Employee }) {
  const tasks = useOffice(s => s.tasks);
  const selected = useOffice(s => s.selectedId === e.id);
  const status = useEmployeeStatus(e.id);
  const current = activeTask(tasks, e.id);
  const open = tasks.filter(t => t.assigneeId === e.id && isOpen(t)).length;
  const sub = current ? current.title : open ? `${open} task${open > 1 ? 's' : ''} queued` : e.role;
  return (
    <button type="button" className="card" aria-pressed={selected} onClick={() => officeStore.getState().select(e.id, { focus: true })}>
      <Portrait look={e.look} />
      <div className="body">
        <div className="nm">{e.name.toUpperCase()} <span aria-hidden="true">✎</span></div>
        <div className="sub">{sub}</div>
        <StatusPill status={status} />
        <div className="mini"><i style={{ width: `${Math.round((current?.progress ?? 0) * 100)}%` }} /></div>
      </div>
    </button>
  );
}
