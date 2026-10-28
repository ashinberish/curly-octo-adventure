import Phaser from 'phaser';
import { activeTask, employeeStatus, hasOpenWork, type Employee, type EmployeeStatus, type Look } from '@pixel-office/shared';
import { CHAR_H, CHAR_W, DIRS, FEET_Y, FRAME_COUNT, SEATED_FRAME, drawCharacterSheet, walkFrame, type Dir } from '../art/character.ts';
import { FURNITURE, MONITOR_RUN_FRAMES } from '../art/furniture.ts';
import { CanvasPainter } from '../art/painter.ts';
import { TILE } from '../art/tiles.ts';
import { SEED_AWAY } from '../state/seed.ts';
import { officeStore, type OfficeState } from '../state/store.ts';
import { isTyping, virtualInput, type Direction } from './input.ts';
import { Label } from './label.ts';
import { parseOfficeMap, type OfficeMap, type TileRect } from './map/officeMap.ts';
import type { TiledMap } from './map/tiled.ts';
import { Npc, type NpcWorld } from './npc.ts';

export const VIEW_TILES = { w: 26, h: 15 };
export const COMPACT_VIEW_TILES = { w: 15, h: 13 };
export const ZOOM = 3;

const PLAYER_LOOK: Look = { hair: '#e9b63a', style: 'short', skin: '#f5d0a9', shirt: '#cf5a4f', pants: '#34303c' };
const PLAYER_SPEED = 70;
const INTERACT_RANGE = 9;

interface Actor {
  npc: Npc;
  /** Texture key of the character sheet, which encodes the look. */
  sheet: string;
  deskId: string;
  sprite: Phaser.GameObjects.Sprite;
  tag: Label;
  bubble: Label;
  select: Phaser.GameObjects.Image;
}

type Target = { kind: 'employee'; id: string; box: Box } | { kind: 'interact'; name: string; box: Box };
interface Box { x: number; y: number; w: number; h: number }

const sheetKey = (look: Look) => `char:${look.style}:${look.hair}:${look.skin}:${look.shirt}:${look.pants}`;

/** Builds a character sprite sheet from a look and registers its walk animations. */
function ensureCharacter(scene: Phaser.Scene, key: string, look: Look): void {
  if (scene.textures.exists(key)) return;
  const canvas = document.createElement('canvas');
  canvas.width = CHAR_W * FRAME_COUNT;
  canvas.height = CHAR_H;
  drawCharacterSheet(new CanvasPainter(canvas.getContext('2d')!), look);
  const tex = scene.textures.addCanvas(key, canvas)!;
  for (let i = 0; i < FRAME_COUNT; i++) tex.add(i, 0, i * CHAR_W, 0, CHAR_W, CHAR_H);
  for (const dir of DIRS) {
    scene.anims.create({
      key: `${key}-walk-${dir}`,
      frames: [0, 1, 2, 3].map(step => ({ key, frame: walkFrame(dir, step) })),
      frameRate: 8,
      repeat: -1,
    });
  }
}

export class OfficeScene extends Phaser.Scene {
  private office!: OfficeMap;
  private player!: Phaser.Physics.Arcade.Sprite;
  private playerDir: Dir = 'down';
  private playerTag!: Label;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private actors = new Map<string, Actor>();
  private monitors = new Map<string, Phaser.GameObjects.Image>();
  /** The employees array the actors were last built from. */
  private syncedEmployees: Employee[] | null = null;
  private stagedOpening = false;
  private prompt!: Phaser.GameObjects.Image;
  private boardBadge!: Label;
  private near: Target | null = null;
  private focusNonce = 0;
  private following: Phaser.GameObjects.GameObject | null = null;
  private world!: NpcWorld;

  constructor() {
    super('office');
  }

  preload(): void {
    const base = import.meta.env.BASE_URL;
    this.load.image('tiles', `${base}assets/tiles.png`);
    this.load.atlas('furniture', `${base}assets/furniture.png`, `${base}assets/furniture.json`);
    this.load.tilemapTiledJSON('office', `${base}maps/office.json`);
  }

  create(): void {
    const json = this.cache.tilemap.get('office').data as TiledMap;
    this.office = parseOfficeMap(json);
    this.buildMap();
    this.buildFurniture();
    this.setupWorld();
    this.buildPlayer();
    this.setupInput();
    this.focusNonce = officeStore.getState().focus?.nonce ?? 0;
  }

  // ───────────────────────── World building ─────────────────────────

  private buildMap(): void {
    const map = this.make.tilemap({ key: 'office' });
    const tiles = map.addTilesetImage('office', 'tiles')!;
    ['floor', 'rugs', 'wallShadows', 'walls'].forEach((name, i) => map.createLayer(name, tiles, 0, 0)!.setDepth(-1000 + i));

    // Invisible layer the player collides with: walls, desks and solid furniture.
    const collision = map.createBlankLayer('collision', tiles)!;
    this.office.solid.forEach((row, y) => row.forEach((s, x) => { if (s) collision.putTileAt(1, x, y); }));
    collision.setCollision(1).setVisible(false);
    this.physics.world.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.data.set('collision', collision);

    for (const room of this.office.rooms) {
      this.add.text(room.label.x * TILE + 3, room.label.y * TILE + 3.5, room.name.toUpperCase(), {
        fontFamily: 'Silkscreen', fontStyle: 'bold', fontSize: '5px', color: '#9b8f73', resolution: ZOOM,
      }).setDepth(-900);
    }
  }

  private buildFurniture(): void {
    this.anims.create({ key: 'plant', frames: [{ key: 'furniture', frame: 'plant_0' }, { key: 'furniture', frame: 'plant_1' }], frameRate: 1.25, repeat: -1 });
    this.anims.create({ key: 'steam', frames: [0, 1, 2].map(f => ({ key: 'furniture', frame: `steam_${f}` })), frameRate: 4, repeat: -1 });

    for (const f of this.office.furniture) {
      const def = FURNITURE[f.kind];
      const onWall = this.office.walls[f.y]?.[f.x];
      const s = this.add.sprite(f.x * TILE, f.y * TILE - def.overhang, 'furniture', def.frames > 1 ? `${f.kind}_0` : f.kind).setOrigin(0);
      s.setDepth(onWall ? -800 : (f.y + f.h) * TILE - (f.solid ? 0 : 8));
      if (f.kind === 'plant') s.play({ key: 'plant', startFrame: Math.random() < 0.5 ? 0 : 1 });
      if (f.kind === 'counter') this.add.sprite(f.x * TILE + 6, f.y * TILE - 15, 'furniture', 'steam_0').setOrigin(0).setDepth(s.depth + 1).play('steam');
    }

    for (const d of this.office.desks) {
      this.add.image(d.x * TILE, d.y * TILE, 'furniture', 'desk').setOrigin(0).setDepth((d.y + 1) * TILE);
      this.monitors.set(d.id, this.add.image(d.x * TILE + 9, d.y * TILE - 8, 'furniture', 'monitor_off').setOrigin(0).setDepth((d.y + 1) * TILE - 0.5));
      this.add.image(d.x * TILE + 10, (d.y + 1) * TILE + 2, 'furniture', 'chair').setOrigin(0).setDepth((d.y + 2) * TILE - 4);
    }

    const board = this.office.interactables.find(i => i.name === 'taskBoard');
    this.boardBadge = new Label(this, 'tag');
    if (board) this.boardBadge.setPosition((board.x + board.w) * TILE - 3, board.y * TILE - 2);
    this.boardBadge.hide();
    this.prompt = this.add.image(0, 0, 'furniture', 'prompt_e').setOrigin(0.5, 0).setDepth(100_002).setVisible(false);
  }

  private setupWorld(): void {
    this.world = {
      solid: this.office.solid,
      pois: this.office.pois,
      takenPois: except => new Set([...this.actors.values()].filter(a => a.npc !== except && a.npc.poi).map(a => a.npc.poi!)),
      hasWork: id => hasOpenWork(officeStore.getState().tasks, id),
      say: (id, text, ms) => officeStore.getState().say(id, text, ms),
      setPresence: (id, p) => officeStore.getState().setPresence(id, p),
      random: Math.random,
    };
  }

  /** Adds, rebuilds and removes people to match the server's list of employees. */
  private syncActors(employees: Employee[], now: number): void {
    if (employees === this.syncedEmployees) return;
    this.syncedEmployees = employees;
    const state = officeStore.getState();
    const wanted = new Map(employees.map(e => [e.id, e]));

    for (const [id, a] of this.actors) {
      const e = wanted.get(id);
      if (e && e.deskId === a.deskId && sheetKey(e.look) === a.sheet) continue;
      // Fired, moved desks or changed look: rebuild (or drop) this person.
      a.sprite.destroy(); a.tag.destroy(); a.bubble.destroy(); a.select.destroy();
      this.monitors.get(a.deskId)?.setFrame('monitor_off');
      this.actors.delete(id);
    }

    for (const e of employees) {
      if (this.actors.has(e.id)) continue;
      const desk = this.office.desks.find(d => d.id === e.deskId);
      if (!desk) { console.warn(`No desk "${e.deskId}" for ${e.name}`); continue; }
      const sheet = sheetKey(e.look);
      ensureCharacter(this, sheet, e.look);
      const npc = new Npc(e.id, desk, now, Math.random);
      // On first load, stage a few people away from their desks so the office feels lived in.
      const away = this.stagedOpening ? undefined : SEED_AWAY[e.id];
      const poi = away && this.office.pois.find(p => p.name === away.poi);
      if (poi) {
        npc.placeAt(poi, now, this.world);
        if (away.says) state.say(e.id, away.says, 6000);
      } else {
        state.setPresence(e.id, 'seated');
      }
      this.actors.set(e.id, {
        npc, sheet, deskId: e.deskId,
        sprite: this.add.sprite(0, 0, sheet, SEATED_FRAME).setOrigin(0.5, FEET_Y / CHAR_H),
        tag: new Label(this, 'tag'),
        bubble: new Label(this, 'speech'),
        select: this.add.image(0, 0, 'furniture', 'select').setOrigin(0.5, 0).setVisible(false),
      });
    }
    if (employees.length) this.stagedOpening = true;
  }

  private buildPlayer(): void {
    ensureCharacter(this, 'char-player', PLAYER_LOOK);
    const { x, y } = this.office.spawn;
    this.player = this.physics.add.sprite(x * TILE + 8, y * TILE + 12, 'char-player', walkFrame('down', 0));
    this.player.setOrigin(0.5, FEET_Y / CHAR_H).setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(8, 5).setOffset(4, FEET_Y - 4);
    this.physics.add.collider(this.player, this.data.get('collision') as Phaser.Tilemaps.TilemapLayer);
    this.playerTag = new Label(this, 'tag');

    const cam = this.cameras.main;
    cam.setZoom(ZOOM).setBounds(0, 0, this.office.width * TILE, this.office.height * TILE).setRoundPixels(true);
    this.follow(this.player);
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    // enableCapture=false so typing in the side panel's inputs still works.
    this.keys = kb.addKeys({ up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D' }, false) as OfficeScene['keys'];
    kb.on('keydown', (ev: KeyboardEvent) => {
      if (isTyping() || ev.repeat) return;
      if (ev.key === 'e' || ev.key === 'E' || ev.key === ' ') this.interact();
    });
    virtualInput.interact = () => this.interact();

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      const hit = (b: Box) => p.worldX >= b.x && p.worldX < b.x + b.w && p.worldY >= b.y && p.worldY < b.y + b.h;
      for (const a of this.actors.values()) if (hit(this.actorBox(a.npc))) return officeStore.getState().select(a.npc.id);
      const board = this.office.interactables.find(i => i.name === 'taskBoard');
      if (board && hit(this.tileBox(board))) officeStore.getState().setTab('board');
    });
  }

  // ───────────────────────── Per frame ─────────────────────────

  update(_time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const now = performance.now();
    const state = officeStore.getState();
    this.syncActors(state.employees, now);
    this.movePlayer();
    const serverNow = state.serverNow();
    for (const a of this.actors.values()) {
      a.npc.update(dt, now, this.world);
      this.drawActor(a, state, now, serverNow);
    }
    this.playerTag.show('YOU', '#34303c', '#ffffff').setPosition(Math.round(this.player.x), Math.round(this.player.y) + 2);

    if (state.focus && state.focus.nonce !== this.focusNonce) {
      this.focusNonce = state.focus.nonce;
      const a = this.actors.get(state.focus.id);
      if (a) this.follow(a.sprite);
    }

    const waiting = state.tasks.filter(t => t.status === 'needs_input').length;
    if (waiting) this.boardBadge.show(String(waiting), '#cf5a4f', '#ffffff'); else this.boardBadge.hide();

    this.updatePrompt(state, now, serverNow);
  }

  private movePlayer(): void {
    const held = (d: Direction, k1: Phaser.Input.Keyboard.Key, k2: Phaser.Input.Keyboard.Key) => virtualInput.held.has(d) || (!isTyping() && (k1.isDown || k2.isDown));
    const dx = (held('right', this.keys.right, this.keys.d) ? 1 : 0) - (held('left', this.keys.left, this.keys.a) ? 1 : 0);
    const dy = (held('down', this.keys.down, this.keys.s) ? 1 : 0) - (held('up', this.keys.up, this.keys.w) ? 1 : 0);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    if (!dx && !dy) {
      body.setVelocity(0, 0);
      this.player.anims.stop();
      this.player.setFrame(walkFrame(this.playerDir, 0));
    } else {
      const len = Math.hypot(dx, dy);
      body.setVelocity((dx / len) * PLAYER_SPEED, (dy / len) * PLAYER_SPEED);
      this.playerDir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
      this.player.anims.play(`char-player-walk-${this.playerDir}`, true);
      if (this.following !== this.player) this.follow(this.player);
    }
    this.player.setDepth(this.player.y);
  }

  private drawActor(a: Actor, state: OfficeState, now: number, serverNow: number): void {
    const { npc, sprite } = a;
    const status = employeeStatus(npc.id, state.tasks, state.presence[npc.id], serverNow);
    const seated = npc.mode === 'seated';
    const key = a.sheet;
    const desk = npc.desk;

    if (seated) {
      const typing = status === 'running' && Math.floor(now / 140) % 2 === 1;
      sprite.anims.stop();
      sprite.setFrame(SEATED_FRAME).setPosition(npc.pos.x, npc.pos.y + (typing ? 1 : 0)).setDepth((desk.y + 2) * TILE - 3);
    } else {
      sprite.setPosition(Math.round(npc.pos.x), Math.round(npc.pos.y)).setDepth(npc.pos.y);
      if (npc.mode === 'walking') sprite.anims.play(`${key}-walk-${npc.dir}`, true);
      else { sprite.anims.stop(); sprite.setFrame(walkFrame(npc.dir, 0)); }
    }

    const monitorFrame = status === 'running' ? `monitor_running_${Math.floor(now / 180) % MONITOR_RUN_FRAMES}`
      : status === 'needs_input' || status === 'done' ? `monitor_${status}` : 'monitor_off';
    this.monitors.get(a.deskId)?.setFrame(monitorFrame);

    const selected = state.selectedId === npc.id;
    a.select.setVisible(selected).setAlpha(0.55 + 0.3 * Math.sin(now / 200));
    a.select.setPosition(Math.round(sprite.x), Math.round(sprite.y) - (seated ? 6 : 2)).setDepth(sprite.depth - 0.1);

    const name = state.employees.find(e => e.id === npc.id)?.name ?? npc.id;
    const tagY = seated ? (desk.y + 2) * TILE - 1 : Math.round(npc.pos.y) + 2;
    a.tag.show(name.toUpperCase(), selected ? '#e9b63a' : '#34303c', selected ? '#2a2630' : '#ffffff').setPosition(Math.round(npc.pos.x), tagY);

    const headTop = seated ? desk.y * TILE - 12 : Math.round(npc.pos.y) - 23;
    const bob = Math.floor(now / 450) % 2;
    a.bubble.setPosition(Math.round(npc.pos.x), headTop - (status === 'idle' || status === 'away' ? 0 : bob));
    this.showBubble(a.bubble, npc.id, status, state, now);
  }

  private showBubble(bubble: Label, id: string, status: EmployeeStatus, state: OfficeState, now: number): void {
    if (status === 'running') {
      const dots = '.'.repeat(1 + (Math.floor(now / 350) % 3)).padEnd(3, ' ');
      bubble.show(`working${dots}`, '#ffffff', '#2a2630', activeTask(state.tasks, id)?.progress ?? 0);
    } else if (status === 'needs_input') {
      bubble.show(activeTask(state.tasks, id)?.runner === 'claude' ? 'got a question!' : 'need your OK!', '#ffe08a', '#2a2630');
    }
    else if (status === 'done') bubble.show('done!', '#a9dca3', '#2a2630');
    else {
      const s = state.speech[id];
      if (s && s.until > now) bubble.show(s.text, '#ffffff', '#2a2630'); else bubble.hide();
    }
  }

  private updatePrompt(state: OfficeState, now: number, serverNow: number): void {
    const fx = this.player.x, fy = this.player.y - 4;
    const dist = (b: Box) => Math.hypot(Math.max(b.x - fx, 0, fx - (b.x + b.w)), Math.max(b.y - fy, 0, fy - (b.y + b.h)));
    const targets: Target[] = [
      ...[...this.actors.values()].map(a => ({ kind: 'employee' as const, id: a.npc.id, box: this.actorBox(a.npc) })),
      ...this.office.interactables.map(i => ({ kind: 'interact' as const, name: i.name, box: this.tileBox(i) })),
    ];
    let best: Target | null = null, bestD = INTERACT_RANGE;
    for (const t of targets) { const d = dist(t.box); if (d < bestD) { best = t; bestD = d; } }
    this.near = best;
    // Hide the prompt over someone who already has a status bubble, so they don't overlap.
    const busy = best?.kind === 'employee' && !['idle', 'away'].includes(employeeStatus(best.id, state.tasks, state.presence[best.id], serverNow));
    if (!best || busy) { this.prompt.setVisible(false); return; }
    const top = best.kind === 'employee' && this.actors.get(best.id)!.npc.mode !== 'seated' ? best.box.y - 2 : best.box.y;
    this.prompt.setVisible(true).setPosition(Math.round(best.box.x + best.box.w / 2), top - 14 - (Math.floor(now / 300) % 2));
  }

  private interact(): void {
    const t = this.near;
    if (!t) return;
    const s = officeStore.getState();
    if (t.kind === 'employee') s.select(t.id);
    else if (t.name === 'taskBoard') s.setTab('board');
    else if (t.name === 'coffee') s.toast('☕ +10 focus. The coffee is… fine.');
  }

  private follow(target: Phaser.GameObjects.GameObject): void {
    this.following = target;
    this.cameras.main.startFollow(target, true, 0.12, 0.12);
  }

  private actorBox(npc: Npc): Box {
    return npc.mode === 'seated'
      ? { x: npc.desk.x * TILE + 4, y: npc.desk.y * TILE - 2, w: 24, h: 34 }
      : { x: npc.pos.x - 8, y: npc.pos.y - 22, w: 16, h: 24 };
  }

  private tileBox(r: TileRect): Box {
    return { x: r.x * TILE, y: r.y * TILE, w: r.w * TILE, h: r.h * TILE };
  }
}
