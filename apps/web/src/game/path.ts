export interface Tile { x: number; y: number }

/**
 * Shortest 4-directional path over a grid, from `from` to `to` inclusive.
 * Returns null when `to` is blocked or unreachable. The start tile may be blocked
 * (someone getting up from a chair next to a desk).
 */
export function findPath(solid: boolean[][], from: Tile, to: Tile): Tile[] | null {
  const h = solid.length, w = solid[0]?.length ?? 0;
  const inside = (t: Tile) => t.x >= 0 && t.y >= 0 && t.x < w && t.y < h;
  if (!inside(from) || !inside(to) || solid[to.y][to.x]) return null;
  const key = (t: Tile) => t.y * w + t.x;
  const prev = new Map<number, number>([[key(from), -1]]);
  const queue: Tile[] = [from];
  for (let i = 0; i < queue.length; i++) {
    const t = queue[i];
    if (t.x === to.x && t.y === to.y) break;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = { x: t.x + dx, y: t.y + dy };
      if (!inside(n) || solid[n.y][n.x] || prev.has(key(n))) continue;
      prev.set(key(n), key(t));
      queue.push(n);
    }
  }
  if (!prev.has(key(to))) return null;
  const path: Tile[] = [];
  for (let k = key(to); k !== -1; k = prev.get(k)!) path.unshift({ x: k % w, y: Math.floor(k / w) });
  return path;
}
