// Character sprite sheets, generated from an employee's look.
//
// Sheet layout (each frame CHAR_W x CHAR_H):
//   frames 0-3   walk down     frames 8-11  walk right
//   frames 4-7   walk left     frames 12-15 walk up
//   frame 16     seated, seen from behind (at a desk)
// Walk frames: 0 and 2 stand, 1 lifts the left foot, 3 lifts the right.
import type { Look } from '@pixel-office/shared';
import { OUTLINE as O, type Painter } from './painter.ts';

export const CHAR_W = 16;
export const CHAR_H = 26;
/** The figure is drawn 4px down inside its frame so a hair bun fits above the head. */
const CHAR_OY = 4;
export const DIRS = ['down', 'left', 'right', 'up'] as const;
export type Dir = (typeof DIRS)[number];
export const SEATED_FRAME = 16;
export const FRAME_COUNT = 17;
/** Feet sit on this row of the frame (sprite origin is bottom-centre). */
export const FEET_Y = CHAR_OY + 21;

export const walkFrame = (dir: Dir, step: number) => DIRS.indexOf(dir) * 4 + step;

export function drawCharacter(p: Painter, x: number, y: number, look: Look, dir: Dir, step: number, seated: boolean): void {
  const P = (a: number, b: number, w: number, h: number, c: string) => p.rect(x + a, y + b, w, h, c);
  if (!seated) {
    P(3, 20, 10, 2, 'rgba(42,38,48,0.22)');
    const l = step === 1 ? 1 : 0, r = step === 3 ? 1 : 0;
    P(4, 17, 8, 3 - Math.max(l, r), O);
    P(5, 17, 2, 3 - l, look.pants); P(9, 17, 2, 3 - r, look.pants);
    P(4, 20 - l, 3, 1, O); P(9, 20 - r, 3, 1, O);
  }
  if (look.style === 'long' && dir !== 'up') { P(2, 4, 12, 10, O); P(3, 4, 10, 9, look.hair); }
  // body
  P(3, 11, 10, 7, O); P(4, 11, 8, 6, look.shirt); P(4, 11, 8, 1, 'rgba(255,255,255,0.25)');
  P(2, 12, 2, 4, O); P(12, 12, 2, 4, O); P(2, 15, 2, 1, look.skin); P(12, 15, 2, 1, look.skin);
  // head
  P(2, 0, 12, 12, O); P(3, 1, 10, 10, look.skin);
  const H = look.hair;
  if (dir === 'up') {
    if (look.style === 'bald') { P(3, 1, 10, 3, 'rgba(255,255,255,0.3)'); P(2, 6, 1, 3, look.skin); P(13, 6, 1, 3, look.skin); }
    else { P(3, 1, 10, look.style === 'long' ? 10 : 8, H); if (look.style === 'long') P(4, 11, 8, 2, H); }
    if (look.style === 'bun') { P(6, -3, 4, 4, O); P(7, -2, 2, 2, H); }
    return;
  }
  if (look.style !== 'bald') {
    P(3, 1, 10, 3, H);
    if (dir === 'down') { P(3, 4, 1, 4, H); P(12, 4, 1, 4, H); }
    if (dir === 'left') P(9, 1, 4, 7, H);
    if (dir === 'right') P(3, 1, 4, 7, H);
    if (look.style === 'bun') { P(6, -3, 4, 4, O); P(7, -2, 2, 2, H); }
  } else {
    P(3, 1, 10, 1, 'rgba(255,255,255,0.35)');
  }
  if (dir === 'down') {
    P(5, 6, 1, 2, O); P(10, 6, 1, 2, O);
    P(7, 9, 2, 1, 'rgba(120,40,30,0.6)');
    P(4, 8, 1, 1, 'rgba(230,110,110,0.45)'); P(11, 8, 1, 1, 'rgba(230,110,110,0.45)');
  } else {
    P(dir === 'left' ? 5 : 9, 6, 1, 2, O);
  }
}

/** Draws every frame side by side: a FRAME_COUNT*CHAR_W by CHAR_H strip. */
export function drawCharacterSheet(p: Painter, look: Look): void {
  DIRS.forEach(dir => {
    for (let step = 0; step < 4; step++) drawCharacter(p, walkFrame(dir, step) * CHAR_W, CHAR_OY, look, dir, step, false);
  });
  drawCharacter(p, SEATED_FRAME * CHAR_W, CHAR_OY, look, 'up', 0, true);
}

/** Head-and-shoulders portrait in a 16x16 box. */
export function drawPortrait(p: Painter, look: Look): void {
  drawCharacter(p, 0, 3, look, 'down', 0, true);
}
