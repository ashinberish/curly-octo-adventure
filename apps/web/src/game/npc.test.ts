import { describe, expect, it } from 'vitest';
import type { Presence } from '@pixel-office/shared';
import { Npc, seatFeet, tileFeet, type NpcWorld } from './npc.ts';

// 6x5 room: a desk at (1,1)-(2,1), chair tile (1,2), a POI at (4,3).
const solid = [
  [true, true, true, true, true, true],
  [true, true, true, false, false, true],
  [true, false, false, false, false, true],
  [true, false, false, false, false, true],
  [true, true, true, true, true, true],
];
const desk = { x: 1, y: 1 };

function world(work = { has: false }) {
  const presence: Presence[] = [];
  const said: string[] = [];
  const w: NpcWorld = {
    solid,
    pois: [{ name: 'coffee', x: 4, y: 3 }],
    takenPois: () => new Set(),
    hasWork: () => work.has,
    say: (_id, text) => said.push(text),
    setPresence: (_id, p) => presence.push(p),
    random: () => 0.1,
  };
  return { w, presence, said };
}

function walk(npc: Npc, w: NpcWorld, now: number, seconds: number) {
  for (let i = 0; i < seconds * 20; i++) npc.update(0.05, now + i * 50, w);
  return now + seconds * 1000;
}

describe('Npc', () => {
  it('wanders to a POI when idle, then walks back to the desk', () => {
    const { w, presence } = world();
    const npc = new Npc('ada', desk, 0, () => 0);
    let now = walk(npc, w, 5000, 5); // first wander is due after 4s with random() = 0; the walk takes ~2s
    expect(npc.mode).toBe('away');
    expect(npc.pos).toEqual(tileFeet({ x: 4, y: 3 }));
    expect(npc.poi).toBe('coffee');
    now = walk(npc, w, now, 12); // break lasts 6-12s, then ~2s back to the desk
    expect(npc.mode).toBe('seated');
    expect(npc.pos).toEqual(seatFeet(desk));
    expect(npc.poi).toBeNull();
    expect(presence).toEqual(['walking', 'away', 'walking', 'seated']);
  });

  it('heads back as soon as there is work', () => {
    const work = { has: false };
    const { w, said } = world(work);
    const npc = new Npc('ada', desk, 0, () => 0);
    npc.placeAt({ name: 'coffee', x: 4, y: 3 }, 0, w);
    work.has = true;
    npc.update(0.05, 100, w);
    expect(said).toContain('on it!');
    expect(npc.walkingTo).toBe('desk');
    walk(npc, w, 200, 10);
    expect(npc.mode).toBe('seated');
  });

  it('stays at the desk while there is work', () => {
    const { w } = world({ has: true });
    const npc = new Npc('ada', desk, 0, () => 0);
    walk(npc, w, 5000, 30);
    expect(npc.mode).toBe('seated');
  });
});
