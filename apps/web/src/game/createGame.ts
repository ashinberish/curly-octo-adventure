import Phaser from 'phaser';
import { TILE } from '../art/tiles.ts';
import { installScrollGuard } from './input.ts';
import { OfficeScene, VIEW_TILES, ZOOM } from './OfficeScene.ts';

/** `view` is how many tiles the camera shows; phones get a closer view than desktops. */
export function createGame(parent: HTMLElement, view: { w: number; h: number } = VIEW_TILES): Phaser.Game {
  installScrollGuard();
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: view.w * TILE * ZOOM,
    height: view.h * TILE * ZOOM,
    backgroundColor: '#3a3742',
    pixelArt: true,
    roundPixels: true,
    banner: false,
    physics: { default: 'arcade', arcade: { debug: false } },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_HORIZONTALLY },
    scene: [OfficeScene],
  });
}
