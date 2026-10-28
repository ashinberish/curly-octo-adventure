import { describe, expect, it } from 'vitest';
import type { Employee } from '@pixel-office/shared';
import { RESULTS, SCRIPTS, START_DELAY_MS, catchUp, resolvePermission, startRun, stepDelay, type RunState } from './sim.ts';

const look = { hair: '#000000', style: 'short', skin: '#ffffff', shirt: '#ff0000', pants: '#0000ff' } as const;
const ada: Employee = { id: 'ada', name: 'Ada', role: 'Engineer', skills: ['Code'], look, deskId: 'eng-1' };
const run = (patch: Partial<RunState> = {}): RunState => ({ id: 1, title: 'Fix bug', skill: 'Writing', status: 'running', step: 0, nextAt: 1000, ...patch });

describe('simulated runs', () => {
  it('starts with a spawn log and a short delay', () => {
    const a = startRun(run({ status: 'queued', nextAt: null }), ada, 500);
    expect(a.patch).toMatchObject({ status: 'running', step: 0, nextAt: 500 + START_DELAY_MS, startedAt: 500 });
    expect(a.events[0].text).toContain('Spawning Claude agent as Ada');
    expect(a.events.some(e => e.kind === 'perm')).toBe(true); // Ada lacks Writing
  });

  it('does nothing before the next step is due', () => {
    expect(catchUp(run(), 999)).toBeNull();
    expect(catchUp(run({ status: 'needs_input' }), 1e12)).toBeNull();
  });

  it('plays one step at a time when polled often', () => {
    const a = catchUp(run(), 1000)!;
    expect(a.events).toHaveLength(1);
    expect(a.events[0]).toEqual({ kind: 'text', text: SCRIPTS.Writing[0], at: 1000 });
    expect(a.patch.step).toBe(1);
    expect(a.patch.nextAt).toBe(1000 + stepDelay(1, 1));
  });

  it('catches up a whole run that nobody watched, timestamping each step', () => {
    const a = catchUp(run(), 10 * 60_000)!;
    expect(a.patch.status).toBe('done');
    expect(a.patch.progress).toBe(1);
    expect(a.events.map(e => e.text)).toEqual([...SCRIPTS.Writing, RESULTS.Writing]);
    const times = a.events.map(e => e.at);
    expect(times).toEqual([...times].sort((x, y) => x - y));
    expect(a.patch.finishedAt).toBe(times.at(-1));
    expect(a.patch.finishedAt!).toBeLessThan(20_000);
  });

  it('stops at a permission request, and approval or denial continues it', () => {
    const paused = catchUp(run({ skill: 'Code' }), 1e9)!;
    expect(paused.patch).toMatchObject({ status: 'needs_input', awaiting: 'Bash(npm test)', nextAt: null });
    const waiting = { ...run({ skill: 'Code' }), ...paused.patch };

    const approved = resolvePermission(waiting, true, 5)!;
    expect(approved.patch).toMatchObject({ status: 'running', step: waiting.step, nextAt: 505, awaiting: null });
    const doneApproved = catchUp({ ...waiting, ...approved.patch }, 1e9)!;
    expect(doneApproved.events.some(e => e.text.includes('48 passed'))).toBe(true);

    const denied = resolvePermission(waiting, false, 5)!;
    expect(denied.events[0].kind).toBe('deny');
    const doneDenied = catchUp({ ...waiting, ...denied.patch }, 1e9)!;
    expect(doneDenied.patch.status).toBe('done');
    expect(doneDenied.events.some(e => e.text.includes('48 passed'))).toBe(false);
  });

  it('only answers tasks that are waiting', () => {
    expect(resolvePermission({ ...run(), awaiting: null }, true, 0)).toBeNull();
  });

  it('has deterministic step delays in range', () => {
    for (let s = 0; s < 50; s++) {
      expect(stepDelay(7, s)).toBe(stepDelay(7, s));
      expect(stepDelay(7, s)).toBeGreaterThanOrEqual(700);
      expect(stepDelay(7, s)).toBeLessThan(1800);
    }
  });
});
