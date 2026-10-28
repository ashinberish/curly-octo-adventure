import { useEffect, useRef, useState } from 'react';
import type Phaser from 'phaser';
import { createGame } from '../game/createGame.ts';
import { COMPACT_VIEW_TILES, VIEW_TILES } from '../game/OfficeScene.ts';
import { virtualInput, type Direction } from '../game/input.ts';
import { useOffice } from './common.tsx';

export function GameView() {
  const host = useRef<HTMLDivElement>(null);
  const toasts = useOffice(s => s.toasts);
  // Chosen once at start-up: a closer camera on narrow screens keeps sprites and names readable.
  const [view] = useState(() => (window.innerWidth < 700 ? COMPACT_VIEW_TILES : VIEW_TILES));

  useEffect(() => {
    let game: Phaser.Game | null = createGame(host.current!, view);
    return () => { game?.destroy(true); game = null; };
  }, [view]);

  return (
    <div className="frame">
      <div ref={host} className="game-host" style={{ aspectRatio: `${view.w} / ${view.h}` }} aria-label="Pixel office. Arrow keys or WASD to walk, E to interact." role="application" />
      <div className="toasts" aria-live="polite">
        {toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}
      </div>
    </div>
  );
}

const PAD: Array<Direction | 'e' | null> = [null, 'up', null, 'left', 'e', 'right', null, 'down', null];
const ARROW: Record<Direction | 'e', string> = { up: '▲', down: '▼', left: '◀', right: '▶', e: 'E' };

/** On-screen controls for touch screens (hidden with a mouse). */
export function DPad() {
  return (
    <div className="dpad" aria-hidden="true">
      {PAD.map((k, i) => k === null ? <span key={i} /> : (
        <button
          key={i}
          type="button"
          onPointerDown={ev => { ev.preventDefault(); if (k === 'e') virtualInput.interact(); else virtualInput.held.add(k); }}
          onPointerUp={() => k !== 'e' && virtualInput.held.delete(k)}
          onPointerLeave={() => k !== 'e' && virtualInput.held.delete(k)}
          onPointerCancel={() => k !== 'e' && virtualInput.held.delete(k)}
        >{ARROW[k]}</button>
      ))}
    </div>
  );
}
