// Every generated file under public/, keyed by its path relative to public/.
// Used by scripts/build-assets.ts to write them and by a test to check the
// committed copies are up to date.
import { buildTiledMap } from '../game/map/tiled.ts';
import { packAtlas } from './atlas.ts';
import { furnitureImages } from './furniture.ts';
import { encodePng } from './png.ts';
import { renderTileset } from './tiles.ts';

export function buildAssets(): Record<string, Buffer> {
  const atlas = packAtlas(furnitureImages(), 'furniture.png');
  return {
    'assets/tiles.png': encodePng(renderTileset()),
    'assets/furniture.png': encodePng(atlas.bmp),
    'assets/furniture.json': Buffer.from(JSON.stringify(atlas.json, null, 1) + '\n'),
    'maps/office.json': Buffer.from(JSON.stringify(buildTiledMap(), null, 1) + '\n'),
  };
}
