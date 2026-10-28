// Name tags and speech bubbles drawn in the world, in the same outlined style as the art.
import Phaser from 'phaser';

const OUTLINE = 0x2a2630;
const hex = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

export type LabelKind = 'tag' | 'speech';

export class Label extends Phaser.GameObjects.Container {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly t: Phaser.GameObjects.Text;
  private readonly kind: LabelKind;
  private key = '';

  constructor(scene: Phaser.Scene, kind: LabelKind) {
    super(scene, 0, 0);
    this.kind = kind;
    this.g = scene.add.graphics();
    this.t = scene.add.text(0, 0, '', {
      fontFamily: kind === 'tag' ? 'Silkscreen' : '"IBM Plex Mono"',
      fontStyle: kind === 'tag' ? 'bold' : 'normal',
      fontSize: '5px',
      color: '#ffffff',
      resolution: 3,
    });
    this.add([this.g, this.t]);
    this.setDepth(kind === 'tag' ? 100_000 : 100_001);
    scene.add.existing(this);
  }

  /**
   * Tags hang below (x, y); speech bubbles sit above it with their tail pointing at it.
   * `progress` (0..1) adds a small bar on top of a speech bubble.
   */
  show(text: string, bg: string, fg: string, progress?: number): this {
    this.setVisible(true);
    const key = `${text}|${bg}|${fg}|${progress === undefined ? '' : Math.round(progress * 22)}`;
    if (key === this.key) return this;
    this.key = key;
    this.t.setText(text).setColor(fg);
    const g = this.g.clear();
    const pad = this.kind === 'tag' ? 3 : 3.5;
    const w = Math.ceil(this.t.width + pad * 2), h = this.kind === 'tag' ? 8 : 10;
    const x = -Math.round(w / 2), y = this.kind === 'tag' ? 0 : -h - 3;
    roundBox(g, x, y, w, h, hex(bg));
    if (this.kind === 'speech') {
      g.fillStyle(OUTLINE).fillRect(-2, y + h - 1, 1, 2).fillRect(2, y + h - 1, 1, 2).fillRect(-1, y + h + 1, 3, 1);
      g.fillStyle(hex(bg)).fillRect(-1, y + h - 1, 3, 2);
      if (progress !== undefined) {
        roundBox(g, -12, y - 5, 24, 4, 0xffffff);
        g.fillStyle(0x4f9a5f).fillRect(-11, y - 4, Math.round(22 * progress), 2);
      }
    }
    this.t.setPosition(x + pad, y + (this.kind === 'tag' ? 0.8 : 1.6));
    return this;
  }

  hide(): this {
    this.setVisible(false);
    return this;
  }
}

function roundBox(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, fill: number): void {
  g.fillStyle(OUTLINE).fillRect(x + 1, y, w - 2, h).fillRect(x, y + 1, w, h - 2);
  g.fillStyle(fill).fillRect(x + 1, y + 1, w - 2, h - 2);
}
