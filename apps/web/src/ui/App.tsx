import { useEffect, useState, type FormEvent } from 'react';
import { employeeStatus } from '@pixel-office/shared';
import { officeStore, type Tab } from '../state/store.ts';
import { useOffice } from './common.tsx';
import { CrewStrip } from './CrewStrip.tsx';
import { EmployeePanel } from './EmployeePanel.tsx';
import { DPad, GameView } from './GameView.tsx';
import { HireForm } from './HireForm.tsx';
import { TaskBoard } from './TaskBoard.tsx';

const POLL_MS = 1500;

export function App() {
  // Poll the office server; pause while the tab is hidden.
  useEffect(() => {
    const tick = () => { if (!document.hidden) void officeStore.getState().refresh(); };
    tick();
    const id = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', tick); };
  }, []);

  return (
    <>
      <TopBar />
      <ConnectionBanner />
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
  const now = officeStore.getState().serverNow();
  const statuses = employees.map(e => employeeStatus(e.id, tasks, presence[e.id], now));
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

function ConnectionBanner() {
  const connection = useOffice(s => s.connection);
  const [token, setToken] = useState('');
  if (connection.state === 'online') return null;
  if (connection.state === 'connecting') return <div className="banner" role="status">Opening the office…</div>;
  if (connection.state === 'offline') {
    return <div className="banner error" role="alert"><b>Can’t reach the office.</b> {connection.message} Retrying…</div>;
  }
  const submit = (ev: FormEvent) => { ev.preventDefault(); void officeStore.getState().setToken(token); };
  return (
    <form className="banner" role="alert" onSubmit={submit}>
      <span><b>Read-only.</b> {connection.message}.</span>
      <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Office token" aria-label="Office token" autoComplete="off" />
      <button className="btn small" type="submit">Unlock</button>
    </form>
  );
}

function SidePanel() {
  const tab = useOffice(s => s.tab);
  const tabs: Array<[Tab, string]> = [['employee', 'Employee'], ['board', 'Task board']];
  return (
    <aside className="panel">
      <div className="tabs" role="tablist">
        {tabs.map(([t, label]) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t || (t === 'employee' && tab === 'hire')} onClick={() => officeStore.getState().setTab(t)}>{label}</button>
        ))}
      </div>
      <div className="tabbody" role="tabpanel">
        {tab === 'employee' ? <EmployeePanel /> : tab === 'hire' ? <HireForm /> : <TaskBoard />}
      </div>
    </aside>
  );
}
