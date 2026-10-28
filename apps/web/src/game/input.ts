// Input shared between the Phaser world and the React on-screen d-pad.

export type Direction = 'up' | 'down' | 'left' | 'right';

export const virtualInput = {
  held: new Set<Direction>(),
  /** Set by the scene; the d-pad's E button calls it. */
  interact: () => {},
};

/** True while the user is typing in a form field, so WASD/E/Space shouldn't move or interact. */
export function isTyping(): boolean {
  const el = document.activeElement;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || (el as HTMLElement).isContentEditable);
}

let installed = false;
/** Stop arrow keys and Space from scrolling the page while you walk around. */
export function installScrollGuard(): void {
  if (installed) return;
  installed = true;
  window.addEventListener('keydown', e => {
    if (!isTyping() && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  });
}
