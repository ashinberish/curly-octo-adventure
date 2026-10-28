import { describe, expect, it, vi } from 'vitest';
import { createOfficeStore } from './store.ts';

describe('office store', () => {
  it('auto-assigns to the least busy employee with the skill', () => {
    const store = createOfficeStore();
    // Seed: Kenji and Ada have DevOps; Ada already has two open tasks.
    const id = store.getState().assignTask('auto', 'Rotate keys', '', 'DevOps');
    expect(id).toBe('kenji');
    const task = store.getState().tasks.at(-1)!;
    expect(task).toMatchObject({ assigneeId: 'kenji', title: 'Rotate keys', status: 'queued' });
    expect(store.getState().speech.kenji.text).toBe('on it!');
  });

  it('toggles skills on and off', () => {
    const store = createOfficeStore();
    store.getState().toggleSkill('sam', 'Data');
    expect(store.getState().employees.find(e => e.id === 'sam')!.skills).toContain('Data');
    store.getState().toggleSkill('sam', 'Data');
    expect(store.getState().employees.find(e => e.id === 'sam')!.skills).not.toContain('Data');
  });

  it('bumps the focus nonce only when asked to move the camera', () => {
    const store = createOfficeStore();
    store.getState().select('ada');
    expect(store.getState().focus).toBeNull();
    store.getState().select('ada', { focus: true });
    store.getState().select('maya', { focus: true });
    expect(store.getState().focus).toEqual({ id: 'maya', nonce: 2 });
    expect(store.getState().tab).toBe('employee');
  });

  it('keeps the last three toasts and expires them', () => {
    vi.useFakeTimers();
    const store = createOfficeStore();
    ['a', 'b', 'c', 'd'].forEach(t => store.getState().toast(t));
    expect(store.getState().toasts.map(t => t.text)).toEqual(['b', 'c', 'd']);
    vi.advanceTimersByTime(4000);
    expect(store.getState().toasts).toEqual([]);
    vi.useRealTimers();
  });
});
