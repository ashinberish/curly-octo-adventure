// Builds a Tiled (JSON, orthogonal) map from layout.ts.
import { FURNITURE } from '../../art/furniture.ts';
import { E, N, S, TILE, TILESET_COLUMNS, TILE_COUNT, W, WALL_FACE, floorTile, rugTile, wallTile } from '../../art/tiles.ts';
import { DESKS, FURNITURE_PLACEMENTS, INTERACTABLES, MAP_H, MAP_W, POIS, ROOMS, RUGS, SPAWN, WALLS } from './layout.ts';

type Prop = { name: string; type: 'bool' | 'int' | 'string'; value: boolean | number | string };

export interface TiledObject {
  id: number;
  name: string;
  type: string;
  x: number; y: number; width: number; height: number;
  rotation: 0;
  visible: true;
  properties?: Prop[];
}

export interface TiledTileLayer {
  type: 'tilelayer'; id: number; name: string;
  width: number; height: number; x: 0; y: 0; opacity: 1; visible: true;
  data: number[];
}

export interface TiledObjectLayer {
  type: 'objectgroup'; id: number; name: string;
  draworder: 'topdown'; x: 0; y: 0; opacity: 1; visible: true;
  objects: TiledObject[];
}

export interface TiledMap {
  type: 'map'; version: string; tiledversion: string;
  orientation: 'orthogonal'; renderorder: 'right-down'; infinite: false;
  width: number; height: number; tilewidth: number; tileheight: number;
  nextlayerid: number; nextobjectid: number;
  layers: Array<TiledTileLayer | TiledObjectLayer>;
  tilesets: Array<Record<string, unknown>>;
}

export function wallGrid(): boolean[][] {
  const g = Array.from({ length: MAP_H }, () => Array<boolean>(MAP_W).fill(false));
  for (const s of WALLS) {
    for (let i = s.from; i <= s.to; i++) {
      if (s.doors?.includes(i)) continue;
      if (s.dir === 'h') g[s.y][i] = true; else g[i][s.x] = true;
    }
  }
  return g;
}

export function buildTiledMap(): TiledMap {
  const walls = wallGrid();
  const isWall = (x: number, y: number) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H && walls[y][x];
  const gid = (id: number) => id + 1;
  const layer = (id: number, name: string, fill: (x: number, y: number) => number): TiledTileLayer => {
    const data: number[] = [];
    for (let y = 0; y < MAP_H; y++) for (let x = 0; x < MAP_W; x++) data.push(fill(x, y));
    return { type: 'tilelayer', id, name, width: MAP_W, height: MAP_H, x: 0, y: 0, opacity: 1, visible: true, data };
  };

  const floor = layer(1, 'floor', (x, y) => gid(floorTile(x, y)));
  const rugs = layer(2, 'rugs', (x, y) => {
    const r = RUGS.find(r => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h);
    if (!r) return 0;
    const col = x === r.x ? 0 : x === r.x + r.w - 1 ? 2 : 1;
    const row = y === r.y ? 0 : y === r.y + r.h - 1 ? 2 : 1;
    return gid(rugTile(row * 3 + col));
  });
  const faces = layer(3, 'wallShadows', (x, y) => (!isWall(x, y) && isWall(x, y - 1) ? gid(WALL_FACE) : 0));
  const wallLayer = layer(4, 'walls', (x, y) => {
    if (!isWall(x, y)) return 0;
    const mask = (isWall(x, y - 1) ? N : 0) | (isWall(x + 1, y) ? E : 0) | (isWall(x, y + 1) ? S : 0) | (isWall(x - 1, y) ? W : 0);
    return gid(wallTile(mask));
  });

  let nextId = 1;
  const obj = (name: string, type: string, x: number, y: number, w: number, h: number, properties?: Prop[]): TiledObject =>
    ({ id: nextId++, name, type, x: x * TILE, y: y * TILE, width: w * TILE, height: h * TILE, rotation: 0, visible: true, ...(properties ? { properties } : {}) });

  const objects: TiledObject[] = [
    obj('player', 'spawn', SPAWN.x, SPAWN.y, 1, 1),
    ...DESKS.map(d => obj(d.id, 'desk', d.x, d.y, 2, 1)),
    ...FURNITURE_PLACEMENTS.map(f => {
      const def = FURNITURE[f.kind];
      return obj(f.kind, 'furniture', f.x, f.y, def.w, def.h, [{ name: 'solid', type: 'bool', value: def.solid }]);
    }),
    ...POIS.map(p => obj(p.name, 'poi', p.x, p.y, 1, 1)),
    ...INTERACTABLES.map(i => obj(i.name, 'interact', i.x, i.y, i.w, i.h)),
  ];
  const rooms: TiledObject[] = ROOMS.map(r => obj(r.name, 'room', r.x, r.y, r.w, r.h, [
    { name: 'labelX', type: 'int', value: r.label.x },
    { name: 'labelY', type: 'int', value: r.label.y },
  ]));

  const wallTiles = Array.from({ length: 16 }, (_, m) => ({ id: wallTile(m), properties: [{ name: 'collides', type: 'bool', value: true }] }));
  return {
    type: 'map', version: '1.10', tiledversion: '1.11.0',
    orientation: 'orthogonal', renderorder: 'right-down', infinite: false,
    width: MAP_W, height: MAP_H, tilewidth: TILE, tileheight: TILE,
    nextlayerid: 7, nextobjectid: nextId,
    layers: [
      floor, rugs, faces, wallLayer,
      { type: 'objectgroup', id: 5, name: 'objects', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects },
      { type: 'objectgroup', id: 6, name: 'rooms', draworder: 'topdown', x: 0, y: 0, opacity: 1, visible: true, objects: rooms },
    ],
    tilesets: [{
      firstgid: 1, name: 'office', tilewidth: TILE, tileheight: TILE, tilecount: TILE_COUNT, columns: TILESET_COLUMNS,
      image: '../assets/tiles.png', imagewidth: TILESET_COLUMNS * TILE, imageheight: Math.ceil(TILE_COUNT / TILESET_COLUMNS) * TILE,
      margin: 0, spacing: 0, tiles: wallTiles,
    }],
  };
}
