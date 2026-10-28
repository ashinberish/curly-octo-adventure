// Furniture and props, packed into one texture atlas by the asset script.
//
// Each piece covers a footprint of w x h tiles on the map. Its image is the
// footprint plus `overhang` pixels above it (a plant's leaves, a fridge's top),
// and its draw function uses coordinates where (0, 0) is the footprint's
// top-left corner, so it can draw at negative y into the overhang.
import { Bitmap, OUTLINE as O, box, offset, type Painter } from './painter.ts';
import { TILE } from './tiles.ts';

export interface FurnitureDef {
  w: number;
  h: number;
  overhang: number;
  solid: boolean;
  frames: number;
  draw: (p: Painter, frame: number) => void;
}

const GREEN = '#4f9a5f', LEAF = '#6dbb6f', WOOD = '#e8b860', WOOD_LINE = '#d29f4a', WOOD_DARK = '#c08638';
const BOOKS = ['#cf5a4f', '#4d7bd9', '#e9b63a', '#4f9a5f', '#9b78f0', '#e0884f', '#4fa6a0'];
const PINK = '#b5506e', PINK_LIGHT = '#cc6a88', PINK_DARK = '#9a3f5a';

function shelf(w: number): FurnitureDef {
  return {
    w, h: 1, overhang: 8, solid: true, frames: 1,
    draw: p => {
      box(p, 0, -8, w * TILE, TILE + 8, '#9a6a3a');
      for (let i = 0; i < w * 4; i++) {
        p.rect(2 + i * 3.6, -6, 3, 6, BOOKS[i % 7]);
        p.rect(2 + i * 3.6, 2, 3, 6, BOOKS[(i + 3) % 7]);
      }
      p.rect(1, 0, w * TILE - 2, 1, O);
    },
  };
}

export const FURNITURE = {
  plant: {
    w: 1, h: 1, overhang: 4, solid: true, frames: 2,
    draw: (p, s) => {
      box(p, 4, 9, 8, 7, '#f5f5f5');
      p.rect(3 + s, -1, 3, 9, O); p.rect(10 - s, -1, 3, 9, O); p.rect(6, -4, 4, 13, O);
      p.rect(4 + s, 0, 1, 7, GREEN); p.rect(11 - s, 0, 1, 7, GREEN); p.rect(7, -3, 2, 12, LEAF);
    },
  },
  cooler: {
    w: 1, h: 1, overhang: 4, solid: true, frames: 1,
    draw: p => { box(p, 4, -4, 8, 7, '#bfe3ff'); box(p, 3, 2, 10, 13, '#f2f2f2'); p.rect(6, 5, 4, 2, '#4d7bd9'); },
  },
  trash: {
    w: 1, h: 1, overhang: 0, solid: true, frames: 1,
    draw: p => { box(p, 4, 5, 8, 10, '#b9bcc4'); p.rect(4, 5, 8, 2, '#8d909a'); },
  },
  shelf2: shelf(2),
  shelf3: shelf(3),
  armchair: {
    w: 1, h: 1, overhang: 0, solid: true, frames: 1,
    draw: p => { box(p, 1, 0, 14, 15, PINK); p.rect(3, 5, 10, 8, PINK_LIGHT); p.rect(3, 2, 10, 2, PINK_DARK); },
  },
  couch: {
    w: 4, h: 1, overhang: 0, solid: true, frames: 1,
    draw: p => {
      box(p, 0, 0, 4 * TILE, 15, PINK); p.rect(2, 2, 4 * TILE - 4, 4, PINK_DARK);
      for (let i = 0; i < 4; i++) p.rect(3 + i * TILE, 7, TILE - 4, 6, PINK_LIGHT);
    },
  },
  meetingTable: {
    w: 6, h: 3, overhang: 0, solid: true, frames: 1,
    draw: p => {
      box(p, 0, 2, 6 * TILE, 3 * TILE - 2, WOOD); p.rect(2, 4, 6 * TILE - 4, 3 * TILE - 8, '#efc775');
      box(p, 12, 14, 10, 8, '#ffffff'); box(p, 60, 12, 9, 11, '#fffbe6'); box(p, 40, 20, 4, 5, '#ffffff');
    },
  },
  diningTable: {
    w: 3, h: 2, overhang: 0, solid: true, frames: 1,
    draw: p => { box(p, 1, 2, 3 * TILE - 2, 2 * TILE - 4, '#f2ece0'); p.rect(3, 4, 3 * TILE - 6, 2 * TILE - 9, '#fbf7ef'); box(p, 20, 10, 5, 5, '#ffffff'); },
  },
  stool: {
    w: 1, h: 1, overhang: 0, solid: false, frames: 1,
    draw: p => box(p, 4, 4, 8, 8, '#e0a94a'),
  },
  counter: {
    w: 5, h: 1, overhang: 9, solid: true, frames: 1,
    draw: p => {
      box(p, 0, -2, 5 * TILE, TILE + 2, '#f2f2f2'); p.rect(1, 9, 5 * TILE - 2, 5, WOOD_DARK);
      for (let i = 1; i < 5; i++) p.rect(i * TILE, 9, 1, 5, O);
      // coffee machine on the first tile
      box(p, 2, -9, 11, 13, '#8d909a'); p.rect(4, -7, 7, 3, '#34303c'); p.rect(10, -3, 1, 1, '#6dbb6f'); box(p, 5, 0, 5, 4, '#ffffff');
      box(p, 18, 0, 5, 5, '#e9b63a');
      // sink
      box(p, 42, -1, 16, 8, '#c9ccd4'); p.rect(44, 1, 12, 4, '#9ea3ad'); p.rect(49, -3, 2, 3, O);
    },
  },
  fridge: {
    w: 2, h: 1, overhang: 14, solid: true, frames: 1,
    draw: p => {
      box(p, 1, -14, 2 * TILE - 2, TILE + 14, '#d7dade'); p.rect(2, -4, 2 * TILE - 4, 1, O);
      p.rect(2 * TILE - 6, -11, 2, 5, '#8d909a'); p.rect(2 * TILE - 6, 0, 2, 6, '#8d909a');
    },
  },
  // Wall decorations: they sit on wall tiles, so they never block anything themselves.
  whiteboard: {
    w: 3, h: 1, overhang: 0, solid: false, frames: 1,
    draw: p => {
      box(p, 0, 2, 3 * TILE, 12, '#fbfbf7');
      p.rect(5, 5, 20, 1, '#8fb2ff'); p.rect(5, 8, 30, 1, '#cf5a4f'); p.rect(30, 4, 8, 6, '#ffe08a');
    },
  },
  noticeBoard: {
    w: 2, h: 1, overhang: 0, solid: false, frames: 1,
    draw: p => {
      box(p, 2, 2, 2 * TILE - 4, 13, '#d9b479'); p.rect(3, 3, 2 * TILE - 6, 2, '#c9b2ff');
      p.rect(15, 6, 2, 4, '#7a5a2a'); p.rect(15, 11, 2, 1, '#7a5a2a');
      p.rect(6, 7, 3, 3, '#ffffff'); p.rect(23, 7, 3, 3, '#ffe08a'); p.rect(6, 11, 3, 2, '#a9dca3');
    },
  },
} satisfies Record<string, FurnitureDef>;

export type FurnitureKind = keyof typeof FURNITURE;

// Desk parts and other sprites that aren't map furniture.
export type MonitorState = 'off' | 'running' | 'needs_input' | 'done';
export const MONITOR_RUN_FRAMES = 4;

function drawDesk(p: Painter): void {
  box(p, 0, 2, 32, 12, WOOD);
  p.rect(1, 6, 30, 1, WOOD_LINE); p.rect(1, 9, 30, 1, WOOD_LINE); p.rect(12, 3, 1, 3, WOOD_LINE); p.rect(22, 7, 1, 2, WOOD_LINE);
  p.rect(1, 11, 30, 2, WOOD_DARK);
  p.rect(1, 14, 3, 2, O); p.rect(28, 14, 3, 2, O);
  box(p, 10, 7, 12, 4, '#f5f5f5'); p.rect(12, 8, 8, 1, '#c8c8c8');
  box(p, 25, 5, 4, 5, '#ffffff');
}

function drawMonitor(p: Painter, state: MonitorState, frame: number): void {
  box(p, 0, 0, 14, 11, '#dcdcdc');
  const screen = { running: '#4d7bd9', needs_input: '#e9b63a', done: '#4f9a5f', off: '#2f2a3c' }[state];
  p.rect(2, 2, 10, 7, screen);
  if (state === 'running') for (let i = 0; i < 3; i++) p.rect(3, 3 + i * 2, 3 + ((i + frame) * 3) % 6, 1, '#dfe8ff');
  else if (state === 'needs_input') { p.rect(6, 3, 2, 3, O); p.rect(6, 7, 2, 1, O); }
  else if (state === 'done') { p.rect(4, 5, 1, 1, '#ffffff'); p.rect(5, 6, 1, 1, '#ffffff'); p.rect(6, 5, 1, 1, '#ffffff'); p.rect(7, 4, 1, 1, '#ffffff'); p.rect(8, 3, 1, 1, '#ffffff'); }
  else p.rect(3, 3, 2, 1, 'rgba(255,255,255,0.35)');
  p.rect(5, 11, 4, 2, O);
}

function drawChair(p: Painter): void {
  box(p, 0, 0, 12, 11, '#e0a94a'); p.rect(2, 2, 8, 1, '#f0c26a'); p.rect(2, 8, 8, 1, WOOD_DARK);
}

function drawPromptE(p: Painter): void {
  box(p, 0, 0, 10, 10, '#e9b63a');
  p.rect(3, 2, 4, 1, O); p.rect(3, 2, 1, 6, O); p.rect(3, 4, 3, 1, O); p.rect(3, 7, 4, 1, O);
}

function drawSteam(p: Painter, f: number): void {
  p.rect(1 + (f === 1 ? 1 : 0), 3 - f, 1, 2, 'rgba(255,255,255,0.8)');
}

/** Every image in the atlas, by frame name. */
export function furnitureImages(): Array<{ name: string; bmp: Bitmap }> {
  const out: Array<{ name: string; bmp: Bitmap }> = [];
  const add = (name: string, w: number, h: number, draw: (p: Painter) => void, oy = 0) => {
    const bmp = new Bitmap(w, h);
    draw(offset(bmp, 0, oy));
    out.push({ name, bmp });
  };
  for (const [kind, def] of Object.entries(FURNITURE) as Array<[FurnitureKind, FurnitureDef]>) {
    for (let f = 0; f < def.frames; f++) {
      add(def.frames > 1 ? `${kind}_${f}` : kind, def.w * TILE, def.h * TILE + def.overhang, p => def.draw(p, f), def.overhang);
    }
  }
  add('desk', 32, 16, drawDesk);
  add('chair', 12, 11, drawChair);
  add('monitor_off', 14, 13, p => drawMonitor(p, 'off', 0));
  add('monitor_needs_input', 14, 13, p => drawMonitor(p, 'needs_input', 0));
  add('monitor_done', 14, 13, p => drawMonitor(p, 'done', 0));
  for (let f = 0; f < MONITOR_RUN_FRAMES; f++) add(`monitor_running_${f}`, 14, 13, p => drawMonitor(p, 'running', f));
  for (let f = 0; f < 3; f++) add(`steam_${f}`, 4, 6, p => drawSteam(p, f));
  add('prompt_e', 10, 10, drawPromptE);
  add('select', 18, 3, p => p.rect(0, 0, 18, 3, '#e9b63a'));
  return out;
}
