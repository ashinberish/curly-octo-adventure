import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildAssets } from './assets.ts';
import { Bitmap, parseColor } from './painter.ts';
import { encodePng } from './png.ts';

describe('generated assets', () => {
  it('match the committed files in public/ (run `npm run assets` if this fails)', () => {
    for (const [path, data] of Object.entries(buildAssets())) {
      const committed = readFileSync(join(__dirname, '../../public', path));
      expect(committed.equals(data), path).toBe(true);
    }
  });
});

describe('Bitmap', () => {
  it('blends translucent colours over what is there', () => {
    const b = new Bitmap(2, 1);
    b.rect(0, 0, 2, 1, '#000000');
    b.rect(0, 0, 1, 1, 'rgba(255,255,255,0.5)');
    expect(b.pixel(0, 0)).toEqual([128, 128, 128, 1]);
    expect(b.pixel(1, 0)).toEqual([0, 0, 0, 1]);
  });

  it('clips drawing to its bounds', () => {
    const b = new Bitmap(2, 2);
    b.rect(-5, -5, 6, 6, '#ff0000');
    expect(b.pixel(0, 0)).toEqual([255, 0, 0, 1]);
    expect(b.pixel(1, 1)[3]).toBe(0);
  });

  it('parses hex and rgba colours', () => {
    expect(parseColor('#2a2630')).toEqual([42, 38, 48, 1]);
    expect(parseColor('rgba(1, 2, 3, 0.25)')).toEqual([1, 2, 3, 0.25]);
    expect(() => parseColor('red')).toThrow();
  });
});

describe('encodePng', () => {
  it('writes a PNG whose pixel data round-trips', () => {
    const b = new Bitmap(3, 2);
    b.rect(1, 1, 1, 1, '#11aaff');
    const png = encodePng(b);
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(3); // IHDR width
    expect(png.readUInt32BE(20)).toBe(2); // IHDR height
    const idatLen = png.readUInt32BE(33);
    const raw = inflateSync(png.subarray(41, 41 + idatLen));
    // Row 1 starts after row 0 (1 filter byte + 12 bytes); pixel 1 is 4 bytes after its filter byte.
    expect([...raw.subarray(13 + 1 + 4, 13 + 1 + 8)]).toEqual([0x11, 0xaa, 0xff, 255]);
  });
});
