import { describe, expect, it } from 'vitest';
import { findPath } from './path.ts';

const grid = (rows: string[]) => rows.map(r => [...r].map(c => c === '#'));

describe('findPath', () => {
  it('finds the shortest route around walls', () => {
    const g = grid([
      '.....',
      '.###.',
      '.....',
    ]);
    const path = findPath(g, { x: 0, y: 1 }, { x: 4, y: 1 })!;
    expect(path[0]).toEqual({ x: 0, y: 1 });
    expect(path.at(-1)).toEqual({ x: 4, y: 1 });
    expect(path).toHaveLength(7);
    path.forEach(t => expect(g[t.y][t.x]).toBe(false));
  });

  it('returns null when the target is blocked or walled off', () => {
    const g = grid([
      '..#..',
      '..#..',
    ]);
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 })).toBeNull();
    expect(findPath(g, { x: 0, y: 0 }, { x: 4, y: 1 })).toBeNull();
  });

  it('can start on a blocked tile', () => {
    const g = grid(['#..']);
    expect(findPath(g, { x: 0, y: 0 }, { x: 2, y: 0 })).toHaveLength(3);
  });
});
