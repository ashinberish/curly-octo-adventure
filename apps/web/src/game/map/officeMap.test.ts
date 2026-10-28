import { describe, expect, it } from 'vitest';
import mapJson from '../../../public/maps/office.json';
import { SEED_AWAY } from '../../state/seed.ts';
import { findPath } from '../path.ts';
import { chairTile, parseOfficeMap } from './officeMap.ts';
import type { TiledMap } from './tiled.ts';

const office = parseOfficeMap(mapJson as unknown as TiledMap);
const reachable = (to: { x: number; y: number }) => findPath(office.solid, office.spawn, to) !== null;

describe('office map', () => {
  it('has the five rooms', () => {
    expect(office.rooms.map(r => r.name)).toEqual(['Engineering', 'Meeting room', 'Focus room', 'Kitchen', 'Design studio']);
  });

  it('lets you walk to every desk chair and every place NPCs wander to', () => {
    for (const d of office.desks) expect(reachable(chairTile(d)), `desk ${d.id}`).toBe(true);
    for (const p of office.pois) expect(reachable(p), `poi ${p.name}`).toBe(true);
  });

  it('can reach every room', () => {
    for (const r of office.rooms) {
      let found = false;
      for (let y = r.y; y < r.y + r.h && !found; y++) for (let x = r.x; x < r.x + r.w && !found; x++) found = !office.solid[y][x] && reachable({ x, y });
      expect(found, r.name).toBe(true);
    }
  });

  it('can reach a tile next to every interactable', () => {
    for (const i of office.interactables) {
      const around = [];
      for (let x = i.x - 1; x <= i.x + i.w; x++) around.push({ x, y: i.y - 1 }, { x, y: i.y + i.h });
      expect(around.some(t => t.y >= 0 && t.y < office.height && !office.solid[t.y][t.x] && reachable(t)), i.name).toBe(true);
    }
  });

  it('stages people away from their desks only at real places', () => {
    for (const a of Object.values(SEED_AWAY)) expect(office.pois.some(p => p.name === a.poi), a.poi).toBe(true);
  });

  it('keeps furniture off walls, except wall decorations', () => {
    for (const f of office.furniture.filter(f => f.solid)) {
      for (let y = f.y; y < f.y + f.h; y++) for (let x = f.x; x < f.x + f.w; x++) expect(office.walls[y][x], `${f.kind} at ${x},${y}`).toBe(false);
    }
  });
});
