// The one store shared by the Phaser world and the React panels.
// Office data (employees, tasks) comes from the server by polling; the world adds
// presence (seated / walking / away) and the panels call the actions, which go to
// the API and then refresh.
import { createStore } from 'zustand/vanilla';
import type { AgentsInfo, Employee, EmployeePatch, LogLine, NewEmployee, Presence, SkillName, Task, TaskFile } from '@pixel-office/shared';
import { ApiError, httpApi, tokenStorage, type OfficeApi } from './api.ts';

export type Tab = 'employee' | 'board' | 'hire';

export type Connection =
  | { state: 'connecting' }
  | { state: 'online' }
  | { state: 'offline'; message: string }
  /** Reads work, but changes need a token. */
  | { state: 'locked'; message: string };

export interface OfficeState {
  employees: Employee[];
  tasks: Task[];
  desks: string[];
  agents: AgentsInfo | null;
  /** serverTime - Date.now(), so "finished 3s ago" uses the server's clock. */
  clockOffset: number;
  loaded: boolean;
  connection: Connection;

  selectedId: string | null;
  tab: Tab;
  toasts: Array<{ id: number; text: string }>;
  /** Short speech bubbles, by employee id. */
  speech: Record<string, { text: string; until: number }>;
  /** Where each employee's body is, reported by the game world. */
  presence: Record<string, Presence>;
  /** Bumped when the camera should move to an employee. */
  focus: { id: string; nonce: number } | null;

  serverNow(): number;
  refresh(): Promise<void>;
  /** Run log lines of a task with ids greater than `after`. */
  fetchLog(taskId: number, after: number): Promise<LogLine[]>;
  fetchFiles(taskId: number): Promise<TaskFile[]>;
  fetchFile(taskId: number, path: string): Promise<string>;
  select(id: string | null, opts?: { focus?: boolean }): void;
  setTab(tab: Tab): void;
  toast(text: string): void;
  say(id: string, text: string, ms?: number): void;
  setPresence(id: string, presence: Presence): void;
  setToken(token: string): Promise<void>;

  hire(input: NewEmployee): Promise<Employee | null>;
  updateEmployee(id: string, patch: EmployeePatch): Promise<boolean>;
  fire(id: string): Promise<boolean>;
  toggleSkill(id: string, skill: SkillName): Promise<void>;
  /** Resolves to the assignee's id, or null if it failed. */
  assignTask(assigneeId: string | 'auto', title: string, details: string, skill: SkillName): Promise<string | null>;
  cancelTask(id: number): Promise<void>;
  /** Answers a task waiting on you: approve/deny a tool (simulated) or answer an agent's question. */
  resolvePermission(taskId: number, allow: boolean, answer?: string): Promise<void>;
}

const TOAST_MS = 3500;
/** Don't start agent work more often than this, even if the server keeps saying there's more. */
const WORK_SPACING_MS = 3000;
let toastSeq = 0;

export function createOfficeStore(api: OfficeApi) {
  let refreshSeq = 0;
  let working = false;
  let lastWorkAt = 0;

  return createStore<OfficeState>()((set, get) => {
    const nameOf = (id: string) => get().employees.find(e => e.id === id)?.name ?? 'Someone';

    /** Runs a change against the server, reports failures as toasts, then refreshes. */
    async function change<T>(fn: () => Promise<T>): Promise<T | null> {
      try {
        const out = await fn();
        await get().refresh();
        return out;
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) set({ connection: { state: 'locked', message: e.message } });
        get().toast(`⚠ ${e instanceof Error ? e.message : String(e)}`);
        await get().refresh();
        return null;
      }
    }

    /**
     * Claude agents only run while someone asks the server to: an open office does that,
     * one request at a time, whenever the server says runs are waiting.
     */
    async function driveWork(): Promise<void> {
      if (working || Date.now() - lastWorkAt < WORK_SPACING_MS) return;
      working = true;
      lastWorkAt = Date.now();
      try {
        await api.work();
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) set({ connection: { state: 'locked', message: e.message } });
      } finally {
        working = false;
      }
      await get().refresh();
    }

    return {
      employees: [],
      tasks: [],
      desks: [],
      agents: null,
      clockOffset: 0,
      loaded: false,
      connection: { state: 'connecting' },
      selectedId: null,
      tab: 'employee',
      toasts: [],
      speech: {},
      presence: {},
      focus: null,

      serverNow: () => Date.now() + get().clockOffset,

      async refresh() {
        const seq = ++refreshSeq;
        try {
          const snap = await api.state();
          if (seq !== refreshSeq) return; // a newer refresh already landed
          const prev = get();
          if (prev.loaded) announce(prev.tasks, snap.tasks, nameOf, get().toast);
          const selectedGone = prev.selectedId && !snap.employees.some(e => e.id === prev.selectedId);
          set({
            employees: snap.employees,
            tasks: snap.tasks,
            desks: snap.desks,
            agents: snap.agents,
            clockOffset: snap.serverTime - Date.now(),
            loaded: true,
            connection: prev.connection.state === 'locked' ? prev.connection : { state: 'online' },
            ...(selectedGone ? { selectedId: null } : {}),
          });
          if (snap.workPending && get().connection.state !== 'locked') void driveWork();
        } catch (e) {
          if (seq !== refreshSeq) return;
          set({ connection: { state: 'offline', message: e instanceof Error ? e.message : String(e) } });
        }
      },

      fetchLog: (taskId, after) => api.events(taskId, after),
      fetchFiles: taskId => api.files(taskId),
      fetchFile: (taskId, path) => api.fileContent(taskId, path),

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
      async setToken(token) {
        tokenStorage.set(token.trim() || null);
        set({ connection: { state: 'connecting' } });
        await get().refresh();
      },

      async hire(input) {
        const e = await change(() => api.hire(input));
        if (e) { get().toast(`👋 Welcome, ${e.name}!`); get().say(e.id, 'hi everyone!'); }
        return e;
      },
      async updateEmployee(id, patch) {
        return (await change(() => api.updateEmployee(id, patch))) !== null;
      },
      async fire(id) {
        const name = nameOf(id);
        const ok = (await change(() => api.fire(id).then(() => true))) === true;
        if (ok) get().toast(`📦 ${name} has left the office`);
        return ok;
      },
      async toggleSkill(id, skill) {
        const e = get().employees.find(e => e.id === id);
        if (!e) return;
        const has = e.skills.includes(skill);
        const skills = has ? e.skills.filter(k => k !== skill) : [...e.skills, skill];
        // Optimistic: chips respond instantly; the refresh after the call corrects it if it failed.
        set(s => ({ employees: s.employees.map(x => (x.id === id ? { ...x, skills } : x)) }));
        if (await change(() => api.updateEmployee(id, { skills }))) get().say(id, has ? `forgot ${skill}?` : `learned ${skill}!`);
      },
      async assignTask(assigneeId, title, details, skill) {
        const task = await change(() => api.addTask({ assigneeId, title, details, skill }));
        if (!task) return null;
        get().toast(`📋 “${title}” → ${nameOf(task.assigneeId)}`);
        get().say(task.assigneeId, 'on it!');
        return task.assigneeId;
      },
      async cancelTask(id) {
        await change(() => api.cancelTask(id));
      },
      async resolvePermission(taskId, allow, answer) {
        await change(() => api.answerPermission(taskId, allow, answer));
      },
    };
  });
}

/** Toasts for things that happened between two polls. */
function announce(prev: Task[], next: Task[], nameOf: (id: string) => string, toast: (text: string) => void): void {
  const before = new Map(prev.map(t => [t.id, t.status]));
  for (const t of next) {
    const was = before.get(t.id);
    if (was === undefined || was === t.status) continue;
    if (t.status === 'needs_input') toast(t.runner === 'claude' ? `✋ ${nameOf(t.assigneeId)} has a question for you` : `✋ ${nameOf(t.assigneeId)} needs your approval`);
    if (t.status === 'done') toast(`✓ ${nameOf(t.assigneeId)} finished “${t.title}”`);
    if (t.status === 'failed') toast(`✘ ${nameOf(t.assigneeId)} couldn’t finish “${t.title}”`);
  }
}

export type OfficeStore = ReturnType<typeof createOfficeStore>;
export const officeStore = createOfficeStore(httpApi(import.meta.env.VITE_API_BASE ?? '/api'));
