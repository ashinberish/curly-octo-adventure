import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Employee, OfficeSnapshot, Task } from '@pixel-office/shared';
import { ApiError, type OfficeApi } from './api.ts';
import { createOfficeStore } from './store.ts';

const look = { hair: '#000000', style: 'short', skin: '#ffffff', shirt: '#ff0000', pants: '#0000ff' } as const;
const ada: Employee = { id: 'ada', name: 'Ada', role: 'Engineer', skills: ['Code'], look, deskId: 'eng-1' };
const task = (patch: Partial<Task> = {}): Task => ({
  id: 1, assigneeId: 'ada', title: 'Fix bug', details: '', skill: 'Code', status: 'running', progress: 0.5,
  awaiting: null, runner: 'sim', result: null, costUsd: 0, createdAt: 0, startedAt: 0, finishedAt: null, ...patch,
});
const snap = (patch: Partial<OfficeSnapshot>): OfficeSnapshot =>
  ({ serverTime: 0, employees: [], tasks: [], desks: [], agents: { mode: 'simulated', reason: 'test' }, workPending: false, ...patch });

function fakeApi(snapshot: OfficeSnapshot): OfficeApi & { snapshot: OfficeSnapshot } {
  const api = {
    snapshot,
    state: vi.fn(async () => api.snapshot),
    events: vi.fn(async () => []),
    hire: vi.fn(),
    updateEmployee: vi.fn(async (_id: string, patch: Partial<Employee>) => ({ ...ada, ...patch })),
    fire: vi.fn(async () => {}),
    addTask: vi.fn(async () => task({ id: 2, status: 'queued' })),
    updateTask: vi.fn(),
    cancelTask: vi.fn(),
    answerPermission: vi.fn(),
    files: vi.fn(async () => []),
    fileContent: vi.fn(async () => ''),
    work: vi.fn(async () => ({ turns: 1, tasks: 1 })),
  };
  return api as unknown as OfficeApi & { snapshot: OfficeSnapshot };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('office store', () => {
  it('loads a snapshot and lines its clock up with the server', async () => {
    vi.setSystemTime(10_000);
    const store = createOfficeStore(fakeApi(snap({ serverTime: 12_500, employees: [ada], tasks: [task()], desks: ['eng-1'] })));
    await store.getState().refresh();
    const s = store.getState();
    expect(s).toMatchObject({ loaded: true, connection: { state: 'online' }, employees: [ada], desks: ['eng-1'] });
    expect(s.serverNow()).toBe(12_500);
  });

  it('announces approvals and finished work that happened between polls', async () => {
    const api = fakeApi(snap({ serverTime: 0, employees: [ada], tasks: [task()], desks: [] }));
    const store = createOfficeStore(api);
    await store.getState().refresh();
    expect(store.getState().toasts).toEqual([]);
    api.snapshot = { ...api.snapshot, tasks: [task({ status: 'needs_input' })] };
    await store.getState().refresh();
    api.snapshot = { ...api.snapshot, tasks: [task({ status: 'done' })] };
    await store.getState().refresh();
    expect(store.getState().toasts.map(t => t.text)).toEqual(['✋ Ada needs your approval', '✓ Ada finished “Fix bug”']);
  });

  it('reports the server being unreachable', async () => {
    const api = fakeApi(snap({ serverTime: 0, employees: [], tasks: [], desks: [] }));
    api.state = vi.fn(async () => { throw new ApiError(503, 'The office has no database yet.'); });
    const store = createOfficeStore(api);
    await store.getState().refresh();
    expect(store.getState().connection).toEqual({ state: 'offline', message: 'The office has no database yet.' });
  });

  it('assigns a task and has the assignee answer', async () => {
    const api = fakeApi(snap({ serverTime: 0, employees: [ada], tasks: [], desks: [] }));
    const store = createOfficeStore(api);
    await store.getState().refresh();
    expect(await store.getState().assignTask('auto', 'Fix bug', '', 'Code')).toBe('ada');
    expect(api.addTask).toHaveBeenCalledWith({ assigneeId: 'auto', title: 'Fix bug', details: '', skill: 'Code' });
    expect(store.getState().speech.ada.text).toBe('on it!');
    expect(api.state).toHaveBeenCalledTimes(2); // refreshed after the change
  });

  it('toggles skills optimistically and rolls back if the server refuses', async () => {
    const api = fakeApi(snap({ serverTime: 0, employees: [ada], tasks: [], desks: [] }));
    api.updateEmployee = vi.fn(async () => { throw new ApiError(401, 'This office needs a token to make changes'); });
    const store = createOfficeStore(api);
    await store.getState().refresh();
    const pending = store.getState().toggleSkill('ada', 'QA');
    expect(store.getState().employees[0].skills).toEqual(['Code', 'QA']);
    await pending;
    expect(store.getState().employees[0].skills).toEqual(['Code']);
    expect(store.getState().connection.state).toBe('locked');
    expect(store.getState().toasts.at(-1)?.text).toBe('⚠ This office needs a token to make changes');
  });

  it('clears the selection when the selected employee is fired', async () => {
    const api = fakeApi(snap({ serverTime: 0, employees: [ada], tasks: [], desks: [] }));
    const store = createOfficeStore(api);
    await store.getState().refresh();
    store.getState().select('ada', { focus: true });
    expect(store.getState().focus).toEqual({ id: 'ada', nonce: 1 });
    api.snapshot = { ...api.snapshot, employees: [] };
    expect(await store.getState().fire('ada')).toBe(true);
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().toasts.at(-1)?.text).toBe('📦 Ada has left the office');
  });

  it('asks the server to play agent turns when runs are waiting, one request at a time', async () => {
    vi.setSystemTime(100_000);
    const api = fakeApi(snap({ workPending: true }));
    let finish!: () => void;
    api.work = vi.fn(() => new Promise<{ turns: number; tasks: number }>(r => { finish = () => r({ turns: 1, tasks: 1 }); }));
    const store = createOfficeStore(api);
    await store.getState().refresh();
    await store.getState().refresh(); // still working: no second request
    expect(api.work).toHaveBeenCalledTimes(1);
    api.snapshot = { ...api.snapshot, workPending: false };
    finish();
    await vi.waitFor(() => expect(api.state).toHaveBeenCalledTimes(3)); // refreshed after the work
    vi.setSystemTime(200_000);
    await store.getState().refresh();
    expect(api.work).toHaveBeenCalledTimes(1); // nothing pending any more
  });

  it('keeps the last three toasts and expires them', () => {
    const store = createOfficeStore(fakeApi(snap({ serverTime: 0, employees: [], tasks: [], desks: [] })));
    ['a', 'b', 'c', 'd'].forEach(t => store.getState().toast(t));
    expect(store.getState().toasts.map(t => t.text)).toEqual(['b', 'c', 'd']);
    vi.advanceTimersByTime(4000);
    expect(store.getState().toasts).toEqual([]);
  });
});
