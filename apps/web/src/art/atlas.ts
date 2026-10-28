// Packs images into a single sheet and describes it in Phaser's "JSON Hash" atlas format.
import { Bitmap } from './painter.ts';

export interface AtlasFrame {
  frame: { x: number; y: number; w: number; h: number };
  rotated: false;
  trimmed: false;
  spriteSourceSize: { x: 0; y: 0; w: number; h: number };
  sourceSize: { w: number; h: number };
}

export interface AtlasJson {
  frames: Record<string, AtlasFrame>;
  meta: { image: string; size: { w: number; h: number }; scale: '1' };
}

export function packAtlas(images: Array<{ name: string; bmp: Bitmap }>, image: string, width = 256, pad = 1): { bmp: Bitmap; json: AtlasJson } {
  const placed: Array<{ name: string; bmp: Bitmap; x: number; y: number }> = [];
  let x = pad, y = pad, rowH = 0;
  // Tallest first keeps rows tight.
  for (const img of [...images].sort((a, b) => b.bmp.height - a.bmp.height || a.name.localeCompare(b.name))) {
    if (img.bmp.width + 2 * pad > width) throw new Error(`${img.name} is wider than the atlas`);
    if (x + img.bmp.width + pad > width) { x = pad; y += rowH + pad; rowH = 0; }
    placed.push({ ...img, x, y });
    x += img.bmp.width + pad;
    rowH = Math.max(rowH, img.bmp.height);
  }
  const height = y + rowH + pad;
  const bmp = new Bitmap(width, height);
  const frames: Record<string, AtlasFrame> = {};
  for (const p of placed.sort((a, b) => a.name.localeCompare(b.name))) {
    bmp.blit(p.bmp, p.x, p.y);
    const w = p.bmp.width, h = p.bmp.height;
    frames[p.name] = { frame: { x: p.x, y: p.y, w, h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w, h }, sourceSize: { w, h } };
  }
  return { bmp, json: { frames, meta: { image, size: { w: width, h: height }, scale: '1' } } };
}
