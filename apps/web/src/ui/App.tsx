import { useEffect } from 'react';
import { employeeStatus } from '../state/sim.ts';
import { officeStore, type Tab } from '../state/store.ts';
import { useOffice } from './common.tsx';
import { CrewStrip } from './CrewStrip.tsx';
import { EmployeePanel } from './EmployeePanel.tsx';
import { DPad, GameView } from './GameView.tsx';
import { TaskBoard } from './TaskBoard.tsx';

const TICK_MS = 200;

export function App() {
  useEffect(() => {
    const id = setInterval(() => officeStore.getState().tick(performance.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <TopBar />
      <main>
        <section className="stage">
          <GameView />
          <div className="help">
            <span><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> walk</span>
            <span><kbd>E</kbd> talk / interact</span>
            <span>click someone, or a card below</span>
            <span>“!” board = task board · coffee machine in the kitchen</span>
          </div>
          <DPad />
          <CrewStrip />
        </section>
        <SidePanel />
      </main>
    </>
  );
}

function TopBar() {
  const employees = useOffice(s => s.employees);
  const tasks = useOffice(s => s.tasks);
  const presence = useOffice(s => s.presence);
  const flashUntil = useOffice(s => s.flashUntil);
  const now = performance.now();
  const statuses = employees.map(e => employeeStatus(e.id, { tasks, presence, flashUntil }, now));
  const count = (...s: string[]) => statuses.filter(x => s.includes(x)).length;
  const stats: Array<[string, string]> = [
    ['#d8d1c0', `${count('idle', 'away', 'done')} idle`],
    ['#8fb2ff', `${count('running')} working`],
    ['#ffe08a', `${count('needs_input')} need you`],
    ['#a9dca3', `${tasks.filter(t => t.status === 'done').length} done`],
  ];
  return (
    <header className="top">
      <h1>Pixel Office</h1>
      <div className="stats">
        {stats.map(([c, label]) => <span key={label} className="stat"><i className="sq" style={{ background: c }} />{label}</span>)}
      </div>
      <span className="badge" title="Agent runs are simulated until milestone M3">Agents simulated</span>
    </header>
  );
}

function SidePanel() {
  const tab = useOffice(s => s.tab);
  const tabs: Array<[Tab, string]> = [['employee', 'Employee'], ['board', 'Task board']];
  return (
    <aside className="panel">
      <div className="tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => officeStore.getState().setTab(t)}>{label}</button>
        ))}
      </div>
      <div className="tabbody" role="tabpanel">
        {tab === 'employee' ? <EmployeePanel /> : <TaskBoard />}
      </div>
    </aside>
  );
}
