// An employee walking around the office: sits at their desk, wanders to places
// when idle, and walks back when there's work.
import type { Presence } from '@pixel-office/shared';
import type { Dir } from '../art/character.ts';
import { TILE } from '../art/tiles.ts';
import { chairTile } from './map/officeMap.ts';
import { findPath, type Tile } from './path.ts';

export const WALK_SPEED = 38; // px per second

export const CHATTER = [
  'did you miss me?', 'brb, coffee', 'who took my mug?', 'pretending to read my notes', 'standup in 5?',
  'works on my machine', 'no.', 'is it friday yet', 'one sec, thinking', 'nice shoes',
];

export interface Point { x: number; y: number }

/** Feet position for standing in the middle of a tile. */
export const tileFeet = (t: Tile): Point => ({ x: t.x * TILE + 8, y: t.y * TILE + 12 });
/** Feet position (sprite origin) when sitting at a desk. */
export const seatFeet = (desk: Tile): Point => ({ x: desk.x * TILE + 16, y: desk.y * TILE + 30 });

export interface NpcWorld {
  solid: boolean[][];
  pois: Array<{ name: string; x: number; y: number }>;
  /** POIs other employees are at or heading to. */
  takenPois(except: Npc): Set<string>;
  hasWork(id: string): boolean;
  say(id: string, text: string, ms?: number): void;
  setPresence(id: string, p: Presence): void;
  random(): number;
}

export class Npc {
  readonly id: string;
  readonly desk: Tile;
  pos: Point;
  mode: Presence = 'seated';
  dir: Dir = 'up';
  /** Walking distance covered, drives the walk animation. */
  stride = 0;
  poi: string | null = null;
  private path: Point[] = [];
  private goal: 'desk' | 'poi' | null = null;
  private leaveAt = 0;
  private nextWander: number;

  constructor(id: string, desk: Tile, now: number, random: () => number) {
    this.id = id;
    this.desk = desk;
    this.pos = seatFeet(desk);
    this.nextWander = now + 4000 + random() * 11000;
  }

  get walkingTo(): 'desk' | 'poi' | null { return this.mode === 'walking' ? this.goal : null; }

  placeAt(poi: { name: string; x: number; y: number }, now: number, world: NpcWorld): void {
    this.pos = tileFeet(poi);
    this.mode = 'away';
    this.dir = 'down';
    this.poi = poi.name;
    this.goal = 'poi';
    this.leaveAt = now + 8000 + world.random() * 8000;
    world.setPresence(this.id, 'away');
  }

  goToDesk(world: NpcWorld): boolean {
    return this.walkTo(chairTile(this.desk), 'desk', world);
  }

  wander(world: NpcWorld): boolean {
    const taken = world.takenPois(this);
    const options = world.pois.filter(p => !taken.has(p.name));
    const p = options[Math.floor(world.random() * options.length)];
    if (!p || !this.walkTo(p, 'poi', world)) return false;
    this.poi = p.name;
    return true;
  }

  update(dt: number, now: number, world: NpcWorld): void {
    if (this.mode === 'walking') {
      const next = this.path[0];
      if (!next) return this.arrive(now, world);
      const dx = next.x - this.pos.x, dy = next.y - this.pos.y, d = Math.hypot(dx, dy), step = WALK_SPEED * dt;
      if (d <= step) { this.pos = { ...next }; this.path.shift(); }
      else this.pos = { x: this.pos.x + (dx / d) * step, y: this.pos.y + (dy / d) * step };
      if (d > 0.5) this.dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
      this.stride += Math.min(step, d);
    } else if (this.mode === 'away') {
      if (world.hasWork(this.id)) { world.say(this.id, 'on it!'); this.goToDesk(world); }
      else if (now > this.leaveAt) this.goToDesk(world);
    } else if (!world.hasWork(this.id) && now > this.nextWander) {
      this.nextWander = now + 10000 + world.random() * 12000;
      if (world.random() < 0.6) this.wander(world);
    }
  }

  private walkTo(target: Tile, goal: 'desk' | 'poi', world: NpcWorld): boolean {
    const from = this.mode === 'seated' ? chairTile(this.desk) : { x: Math.floor(this.pos.x / TILE), y: Math.floor((this.pos.y - 2) / TILE) };
    const tiles = findPath(world.solid, from, target);
    if (!tiles) return false;
    this.path = tiles.map(tileFeet);
    if (goal === 'desk') this.path.push(seatFeet(this.desk));
    this.goal = goal;
    if (goal === 'desk') this.poi = null;
    this.mode = 'walking';
    world.setPresence(this.id, 'walking');
    return true;
  }

  private arrive(now: number, world: NpcWorld): void {
    if (this.goal === 'desk') {
      this.mode = 'seated';
      this.dir = 'up';
      this.goal = null;
      this.nextWander = now + 12000 + world.random() * 13000;
      world.setPresence(this.id, 'seated');
    } else {
      this.mode = 'away';
      this.dir = 'down';
      this.leaveAt = now + 6000 + world.random() * 6000;
      world.setPresence(this.id, 'away');
      if (world.random() < 0.7) world.say(this.id, CHATTER[Math.floor(world.random() * CHATTER.length)]);
    }
  }
}

