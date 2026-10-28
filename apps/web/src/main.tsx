import { createRoot } from 'react-dom/client';
import { App } from './ui/App.tsx';
import './styles.css';

// Phaser draws text into textures once, so the pixel fonts must be ready first.
// Don't wait forever if the font CDN is unreachable.
const fontsReady = Promise.all([
  document.fonts.load('bold 8px Silkscreen'),
  document.fonts.load('8px "IBM Plex Mono"'),
]);
const timeout = new Promise(resolve => setTimeout(resolve, 3000));

Promise.race([fontsReady, timeout]).finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
