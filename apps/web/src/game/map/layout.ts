// Source layout for the office. `npm run assets` turns this into the Tiled map
// public/maps/office.json, which is what the game loads. Edit either one: change
// this file and regenerate, or open the JSON in Tiled and stop regenerating.
import type { FurnitureKind } from '../../art/furniture.ts';

export const MAP_W = 36;
export const MAP_H = 22;

export type WallSegment =
  | { dir: 'h'; y: number; from: number; to: number; doors?: number[] }
  | { dir: 'v'; x: number; from: number; to: number; doors?: number[] };

export const WALLS: WallSegment[] = [
  { dir: 'h', y: 0, from: 0, to: 35 },
  { dir: 'h', y: 21, from: 0, to: 35 },
  { dir: 'v', x: 0, from: 0, to: 21 },
  { dir: 'v', x: 35, from: 0, to: 21 },
  { dir: 'v', x: 18, from: 0, to: 21, doors: [5, 6, 10, 11, 17, 18] }, // engineering|meeting, engineering|kitchen, studio|kitchen
  { dir: 'h', y: 13, from: 0, to: 18, doors: [8, 9] },                // engineering / studio
  { dir: 'h', y: 9, from: 18, to: 35, doors: [22, 23, 30, 31] },      // meeting + focus / kitchen
  { dir: 'v', x: 27, from: 0, to: 9 },                                 // meeting | focus
];

export interface RoomDef {
  name: string;
  x: number; y: number; w: number; h: number;
  /** Where the room's name is painted, on a wall tile. */
  label: { x: number; y: number };
}

export const ROOMS: RoomDef[] = [
  { name: 'Engineering',      x: 1,  y: 1,  w: 17, h: 12, label: { x: 2,  y: 0 } },
  { name: 'Meeting room',     x: 19, y: 1,  w: 8,  h: 8,  label: { x: 19, y: 0 } },
  { name: 'Focus room',       x: 28, y: 1,  w: 7,  h: 8,  label: { x: 28, y: 0 } },
  { name: 'Kitchen',          x: 19, y: 10, w: 16, h: 11, label: { x: 25, y: 9 } },
  { name: 'Design studio',    x: 1,  y: 14, w: 17, h: 7,  label: { x: 1,  y: 13 } },
];

export const RUGS = [
  { x: 11, y: 18, w: 4, h: 3 },
  { x: 28, y: 5, w: 5, h: 3 },
  { x: 20, y: 17, w: 7, h: 4 },
];

export const FURNITURE_PLACEMENTS: Array<{ kind: FurnitureKind; x: number; y: number }> = [
  // engineering
  { kind: 'plant', x: 1, y: 1 }, { kind: 'cooler', x: 16, y: 1 }, { kind: 'plant', x: 17, y: 12 }, { kind: 'trash', x: 5, y: 12 },
  { kind: 'noticeBoard', x: 14, y: 0 },
  // design studio
  { kind: 'shelf3', x: 13, y: 14 }, { kind: 'plant', x: 1, y: 20 }, { kind: 'plant', x: 17, y: 14 }, { kind: 'armchair', x: 16, y: 19 },
  // meeting room
  { kind: 'whiteboard', x: 21, y: 0 }, { kind: 'meetingTable', x: 20, y: 3 }, { kind: 'plant', x: 26, y: 1 },
  { kind: 'stool', x: 21, y: 2 }, { kind: 'stool', x: 23, y: 2 }, { kind: 'stool', x: 25, y: 2 },
  { kind: 'stool', x: 21, y: 6 }, { kind: 'stool', x: 23, y: 6 }, { kind: 'stool', x: 25, y: 6 },
  // focus room
  { kind: 'shelf2', x: 28, y: 1 }, { kind: 'plant', x: 34, y: 1 }, { kind: 'armchair', x: 33, y: 7 },
  // kitchen & lounge
  { kind: 'counter', x: 24, y: 10 }, { kind: 'fridge', x: 33, y: 10 }, { kind: 'diningTable', x: 21, y: 13 },
  { kind: 'stool', x: 20, y: 13 }, { kind: 'stool', x: 24, y: 13 }, { kind: 'stool', x: 22, y: 15 },
  { kind: 'couch', x: 21, y: 19 }, { kind: 'armchair', x: 26, y: 19 },
  { kind: 'plant', x: 19, y: 20 }, { kind: 'plant', x: 34, y: 20 }, { kind: 'trash', x: 34, y: 13 },
];

/** Desks are 2x1 tiles; the chair sits on the left tile of the row below. */
export const DESKS = [
  { id: 'eng-1', x: 2, y: 3 }, { id: 'eng-2', x: 7, y: 3 }, { id: 'eng-3', x: 12, y: 3 },
  { id: 'eng-4', x: 2, y: 8 }, { id: 'eng-5', x: 7, y: 8 }, { id: 'eng-6', x: 12, y: 8 },
  { id: 'studio-1', x: 3, y: 16 }, { id: 'studio-2', x: 8, y: 16 }, { id: 'studio-3', x: 13, y: 16 },
  { id: 'focus-1', x: 30, y: 3 },
];

/** Places idle employees wander to. */
export const POIS = [
  { name: 'coffee', x: 25, y: 11 }, { name: 'fridge', x: 33, y: 11 },
  { name: 'table-west', x: 20, y: 14 }, { name: 'table-east', x: 24, y: 14 },
  { name: 'couch-1', x: 22, y: 18 }, { name: 'couch-2', x: 23, y: 18 },
  { name: 'cooler', x: 16, y: 2 }, { name: 'meeting-1', x: 22, y: 7 }, { name: 'meeting-2', x: 24, y: 2 },
  { name: 'bookshelf', x: 14, y: 15 }, { name: 'focus', x: 31, y: 7 },
];

export const SPAWN = { x: 9, y: 11 };

/** Things the player can press E on (tile rectangles). */
export const INTERACTABLES = [
  { name: 'taskBoard', x: 14, y: 0, w: 2, h: 1 },
  { name: 'coffee', x: 24, y: 10, w: 1, h: 1 },
];
