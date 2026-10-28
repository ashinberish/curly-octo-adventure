// Reads the Tiled JSON into the model the game and pathfinding use. Everything is
// derived from the map file, so an office edited in Tiled works without code changes.
import { FURNITURE, type FurnitureKind } from '../../art/furniture.ts';
import type { TiledMap, TiledObject, TiledObjectLayer, TiledTileLayer } from './tiled.ts';

export interface TileRect { x: number; y: number; w: number; h: number }

export interface OfficeMap {
  width: number;
  height: number;
  tileSize: number;
  walls: boolean[][];
  /** Walls, solid furniture and desks: what blocks walking. */
  solid: boolean[][];
  furniture: Array<TileRect & { kind: FurnitureKind; solid: boolean }>;
  desks: Array<{ id: string; x: number; y: number }>;
  pois: Array<{ name: string; x: number; y: number }>;
  interactables: Array<TileRect & { name: string }>;
  rooms: Array<TileRect & { name: string; label: { x: number; y: number } }>;
  spawn: { x: number; y: number };
}

const isTileLayer = (l: TiledMap['layers'][number]): l is TiledTileLayer => l.type === 'tilelayer';
const isObjectLayer = (l: TiledMap['layers'][number]): l is TiledObjectLayer => l.type === 'objectgroup';

export function parseOfficeMap(json: TiledMap): OfficeMap {
  const { width, height, tilewidth: ts } = json;
  const tileLayer = (name: string) => {
    const l = json.layers.find(l => l.name === name);
    if (!l || !isTileLayer(l)) throw new Error(`Map is missing tile layer "${name}"`);
    return l;
  };
  const objects = (name: string): TiledObject[] => {
    const l = json.layers.find(l => l.name === name);
    if (!l || !isObjectLayer(l)) throw new Error(`Map is missing object layer "${name}"`);
    return l.objects;
  };
  const rect = (o: TiledObject): TileRect => ({ x: Math.round(o.x / ts), y: Math.round(o.y / ts), w: Math.round(o.width / ts), h: Math.round(o.height / ts) });
  const prop = (o: TiledObject, name: string) => o.properties?.find(p => p.name === name)?.value;

  const wallData = tileLayer('walls').data;
  const walls = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) => wallData[y * width + x] !== 0));
  const solid = walls.map(r => r.slice());
  const block = (r: TileRect) => {
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (y >= 0 && y < height && x >= 0 && x < width) solid[y][x] = true;
  };

  const objs = objects('objects');
  const furniture = objs.filter(o => o.type === 'furniture').map(o => {
    if (!(o.name in FURNITURE)) throw new Error(`Unknown furniture "${o.name}"`);
    const kind = o.name as FurnitureKind;
    return { ...rect(o), kind, solid: (prop(o, 'solid') as boolean | undefined) ?? FURNITURE[kind].solid };
  });
  furniture.filter(f => f.solid).forEach(block);
  const desks = objs.filter(o => o.type === 'desk').map(o => ({ id: o.name, ...rect(o) }));
  desks.forEach(d => block({ x: d.x, y: d.y, w: 2, h: 1 }));
  const spawnObj = objs.find(o => o.type === 'spawn');
  if (!spawnObj) throw new Error('Map has no spawn point');

  return {
    width, height, tileSize: ts, walls, solid, furniture,
    desks: desks.map(({ id, x, y }) => ({ id, x, y })),
    pois: objs.filter(o => o.type === 'poi').map(o => ({ name: o.name, x: rect(o).x, y: rect(o).y })),
    interactables: objs.filter(o => o.type === 'interact').map(o => ({ name: o.name, ...rect(o) })),
    rooms: objects('rooms').map(o => ({ name: o.name, ...rect(o), label: { x: Number(prop(o, 'labelX') ?? rect(o).x), y: Number(prop(o, 'labelY') ?? rect(o).y) } })),
    spawn: { x: rect(spawnObj).x, y: rect(spawnObj).y },
  };
}

/** The tile an employee stands on to sit at a desk (the chair). */
export const chairTile = (desk: { x: number; y: number }) => ({ x: desk.x, y: desk.y + 1 });
