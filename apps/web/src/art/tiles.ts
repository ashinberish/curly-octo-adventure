// The office tileset: floor, walls (auto-tiled by neighbours), wall shadows and rugs.
import { Bitmap, OUTLINE as O, box } from './painter.ts';

export const TILE = 16;
export const TILESET_COLUMNS = 8;

// Tile ids (Tiled gid = id + 1).
/** Floor tiles vary by the parity of their position so the grout lines and diamonds line up. */
export const floorTile = (x: number, y: number) => (y % 2) * 2 + (x % 2);
export const WALL_FACE = 4;
/** Wall bitmask: which neighbours are also walls. */
export const N = 1, E = 2, S = 4, W = 8;
export const wallTile = (mask: number) => 5 + mask;
/** Rugs are 9-sliced: 0 1 2 / 3 4 5 / 6 7 8. */
export const rugTile = (slice: number) => 21 + slice;
export const TILE_COUNT = 30;

export const COLORS = {
  floor: '#a9b699', grout: '#99a78a', diamond: '#8a9a7c',
  wall: '#f4ecdb', wallBand: '#e9dfc9', wallFace: '#ddd1b6',
  rug: '#d9c8a5', rugInner: '#e6d8b9', rugLine: '#cbb68f',
};

function floor(px: number, py: number): Bitmap {
  const t = new Bitmap(TILE, TILE);
  t.rect(0, 0, TILE, TILE, COLORS.floor);
  if (px === 0) t.rect(0, 0, 1, TILE, COLORS.grout);
  if (py === 0) t.rect(0, 0, TILE, 1, COLORS.grout);
  for (const cx of [0, TILE]) for (const cy of [0, TILE]) {
    const wx = px + cx / TILE, wy = py + cy / TILE;
    if (wx % 2 === 0 && wy % 2 === 0) {
      t.rect(cx - 1, cy - 2, 3, 5, COLORS.diamond);
      t.rect(cx - 2, cy - 1, 5, 3, COLORS.diamond);
    }
  }
  return t;
}

function wall(mask: number): Bitmap {
  const t = new Bitmap(TILE, TILE);
  t.rect(0, 0, TILE, TILE, COLORS.wall);
  t.rect(0, 11, TILE, 5, COLORS.wallBand);
  if (!(mask & N)) t.rect(0, 0, TILE, 1, O);
  if (!(mask & S)) t.rect(0, 15, TILE, 1, O);
  if (!(mask & W)) t.rect(0, 0, 1, TILE, O);
  if (!(mask & E)) t.rect(15, 0, 1, TILE, O);
  return t;
}

function wallFace(): Bitmap {
  const t = new Bitmap(TILE, TILE);
  t.rect(0, 0, TILE, 5, COLORS.wallFace);
  t.rect(0, 5, TILE, 1, 'rgba(42,38,48,0.35)');
  return t;
}

function rugSlices(): Bitmap[] {
  const big = new Bitmap(TILE * 3, TILE * 3);
  box(big, 3, 3, TILE * 3 - 6, TILE * 3 - 6, COLORS.rug);
  big.rect(6, 6, TILE * 3 - 12, TILE * 3 - 12, COLORS.rugInner);
  big.rect(6, 6, TILE * 3 - 12, 1, COLORS.rugLine);
  const out: Bitmap[] = [];
  for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
    const t = new Bitmap(TILE, TILE);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) {
      const [r, g, b, a] = big.pixel(sx * TILE + x, sy * TILE + y);
      if (a > 0) t.rect(x, y, 1, 1, `rgba(${r},${g},${b},${a})`);
    }
    out.push(t);
  }
  return out;
}

export function renderTileset(): Bitmap {
  const rows = Math.ceil(TILE_COUNT / TILESET_COLUMNS);
  const sheet = new Bitmap(TILESET_COLUMNS * TILE, rows * TILE);
  const put = (id: number, t: Bitmap) => sheet.blit(t, (id % TILESET_COLUMNS) * TILE, Math.floor(id / TILESET_COLUMNS) * TILE);
  for (let py = 0; py < 2; py++) for (let px = 0; px < 2; px++) put(floorTile(px, py), floor(px, py));
  put(WALL_FACE, wallFace());
  for (let m = 0; m < 16; m++) put(wallTile(m), wall(m));
  rugSlices().forEach((t, i) => put(rugTile(i), t));
  return sheet;
}
