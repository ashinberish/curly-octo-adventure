// All pixel art is drawn through this tiny interface so the same drawing code can
// target a browser canvas (characters, portraits) or an in-memory bitmap that the
// asset script encodes to PNG (tileset, furniture atlas).

export interface Painter {
  rect(x: number, y: number, w: number, h: number, color: string): void;
}

export const OUTLINE = '#2a2630';

/** 1px-rounded box with an outline, the basic building block of the art style. */
export function box(p: Painter, x: number, y: number, w: number, h: number, fill: string): void {
  p.rect(x + 1, y, w - 2, h, OUTLINE);
  p.rect(x, y + 1, w, h - 2, OUTLINE);
  p.rect(x + 1, y + 1, w - 2, h - 2, fill);
}

export function offset(p: Painter, dx: number, dy: number): Painter {
  return { rect: (x, y, w, h, c) => p.rect(x + dx, y + dy, w, h, c) };
}

export class CanvasPainter implements Painter {
  private readonly ctx: CanvasRenderingContext2D;
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }
  rect(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }
}

export type RGBA = [number, number, number, number];

export function parseColor(c: string): RGBA {
  if (c.startsWith('#') && c.length === 7) {
    return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16), 1];
  }
  const m = /^rgba?\(([^)]+)\)$/.exec(c);
  if (m) {
    const [r, g, b, a = '1'] = m[1].split(',').map(s => s.trim());
    return [Number(r), Number(g), Number(b), Number(a)];
  }
  throw new Error(`Unsupported colour: ${c}`);
}

/** RGBA bitmap with source-over blending and clipping to its own bounds. */
export class Bitmap implements Painter {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  rect(x: number, y: number, w: number, h: number, color: string): void {
    const [r, g, b, a] = parseColor(color);
    const x0 = Math.max(0, Math.round(x)), y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.width, Math.round(x) + Math.round(w)), y1 = Math.min(this.height, Math.round(y) + Math.round(h));
    for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) this.blend((j * this.width + i) * 4, r, g, b, a);
  }

  /** Copy another bitmap in, blending over what is already there. */
  blit(src: Bitmap, dx: number, dy: number): void {
    for (let j = 0; j < src.height; j++) for (let i = 0; i < src.width; i++) {
      const x = dx + i, y = dy + j;
      if (x < 0 || y < 0 || x >= this.width || y >= this.height) continue;
      const s = (j * src.width + i) * 4;
      const sa = src.data[s + 3] / 255;
      if (sa > 0) this.blend((y * this.width + x) * 4, src.data[s], src.data[s + 1], src.data[s + 2], sa);
    }
  }

  pixel(x: number, y: number): RGBA {
    const o = (y * this.width + x) * 4;
    return [this.data[o], this.data[o + 1], this.data[o + 2], this.data[o + 3] / 255];
  }

  private blend(o: number, r: number, g: number, b: number, a: number): void {
    const da = this.data[o + 3] / 255;
    const oa = a + da * (1 - a);
    if (oa === 0) return;
    this.data[o] = Math.round((r * a + this.data[o] * da * (1 - a)) / oa);
    this.data[o + 1] = Math.round((g * a + this.data[o + 1] * da * (1 - a)) / oa);
    this.data[o + 2] = Math.round((b * a + this.data[o + 2] * da * (1 - a)) / oa);
    this.data[o + 3] = Math.round(oa * 255);
  }
}
