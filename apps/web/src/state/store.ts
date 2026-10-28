// The one store shared by the Phaser world and the React panels.
// The world writes presence (seated / walking / away) and reads statuses;
// the panels read everything and call the actions.
import { createStore } from 'zustand/vanilla';
import type { Presence, SkillName } from '@pixel-office/shared';
import { createTask, resolvePermission, stepSimulation, suggestAssignees, type SimState } from './sim.ts';
import { SEED_AWAY, SEED_EMPLOYEES, seedTasks } from './seed.ts';

export type Tab = 'employee' | 'board';

export interface OfficeState extends SimState {
  selectedId: string | null;
  tab: Tab;
  toasts: Array<{ id: number; text: string }>;
  /** Short speech bubbles, by employee id. */
  speech: Record<string, { text: string; until: number }>;
  /** Bumped when the camera should move to an employee. */
  focus: { id: string; nonce: number } | null;
  nextTaskId: number;

  select(id: string | null, opts?: { focus?: boolean }): void;
  setTab(tab: Tab): void;
  toast(text: string): void;
  say(id: string, text: string, ms?: number): void;
  setPresence(id: string, presence: Presence): void;
  toggleSkill(id: string, skill: SkillName): void;
  /** Returns the id of the employee the task went to. */
  assignTask(assigneeId: string | 'auto', title: string, details: string, skill: SkillName): string;
  resolvePermission(taskId: number, allow: boolean): void;
  tick(now: number): void;
}

const TOAST_MS = 3500;
let toastSeq = 0;

export function createOfficeStore(initial?: Partial<SimState>) {
  return createStore<OfficeState>()((set, get) => ({
    employees: SEED_EMPLOYEES,
    tasks: seedTasks(),
    runs: {},
    presence: Object.fromEntries(SEED_EMPLOYEES.map(e => [e.id, SEED_AWAY[e.id] ? 'away' : 'seated'])),
    flashUntil: {},
    selectedId: null,
    tab: 'employee',
    toasts: [],
    speech: {},
    focus: null,
    nextTaskId: 100,
    ...initial,

    select(id, opts) {
      set(s => ({
        selectedId: id,
        tab: id ? 'employee' : s.tab,
        focus: id && opts?.focus ? { id, nonce: (s.focus?.nonce ?? 0) + 1 } : s.focus,
      }));
    },
    setTab(tab) { set({ tab }); },
    toast(text) {
      const id = ++toastSeq;
      set(s => ({ toasts: [...s.toasts, { id, text }].slice(-3) }));
      setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), TOAST_MS);
    },
    say(id, text, ms = 3500) {
      set(s => ({ speech: { ...s.speech, [id]: { text, until: performance.now() + ms } } }));
    },
    setPresence(id, presence) {
      if (get().presence[id] !== presence) set(s => ({ presence: { ...s.presence, [id]: presence } }));
    },
    toggleSkill(id, skill) {
      const e = get().employees.find(e => e.id === id);
      if (!e) return;
      const has = e.skills.includes(skill);
      set(s => ({ employees: s.employees.map(x => (x === e ? { ...e, skills: has ? e.skills.filter(k => k !== skill) : [...e.skills, skill] } : x)) }));
      get().say(id, has ? `forgot ${skill}?` : `learned ${skill}!`);
    },
    assignTask(assigneeId, title, details, skill) {
      const s = get();
      const id = assigneeId === 'auto' ? (suggestAssignees(s.employees, s.tasks, skill)[0] ?? s.employees[0]).id : assigneeId;
      set({ tasks: [...s.tasks, createTask(s.nextTaskId, id, title, details, skill)], nextTaskId: s.nextTaskId + 1 });
      const name = s.employees.find(e => e.id === id)?.name ?? id;
      get().toast(`📋 “${title}” → ${name}`);
      get().say(id, 'on it!');
      return id;
    },
    resolvePermission(taskId, allow) {
      set(s => resolvePermission(s, taskId, allow, performance.now()));
    },
    tick(now) {
      const { state, events, changed } = stepSimulation(get(), now);
      if (changed) set({ tasks: state.tasks, runs: state.runs, flashUntil: state.flashUntil });
      for (const ev of events) {
        if (ev.type === 'toast') get().toast(ev.text);
        else get().say(ev.employeeId, ev.text);
      }
    },
  }));
}

export type OfficeStore = ReturnType<typeof createOfficeStore>;
export const officeStore = createOfficeStore();
