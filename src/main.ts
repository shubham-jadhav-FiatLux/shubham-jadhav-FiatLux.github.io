import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-600.css';
import '@fontsource/lora/latin-400-italic.css';
import './ui/styles/base.css';
import './ui/styles/loader.css';
import './ui/styles/hud.css';
import './ui/styles/panel.css';
import './ui/styles/map.css';
import './ui/styles/menu.css';
import './ui/styles/classic.css';
import './ui/styles/touch.css';
import './ui/styles/tour.css';
import { App } from './app/App';
import { Game } from './app/Game';
import { GameAudio } from './audio/GameAudio';
import { portfolio } from './content/portfolio';
import { Loader } from './ui/Loader';
import { ClassicView } from './ui/ClassicView';
import { notice } from './ui/notice';

declare global {
  interface Window {
    /** Debug / automation handles. */
    __valley?: App;
    __game?: Game;
  }
}

function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!canvas.getContext('webgl2');
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  const named = !portfolio.owner.name.includes('[');
  document.title = `${portfolio.site.title} · ${named ? portfolio.owner.name : 'Portfolio'}`;
  const webgl = hasWebGL2();
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const ui = document.getElementById('ui')!;
  const loaderEl = document.getElementById('loader')!;
  const classic = new ClassicView(document.body, portfolio, webgl, [canvas, ui, loaderEl]);
  const loader = new Loader(loaderEl, portfolio);
  loader.onClassic(() => classic.open());
  if (!webgl) {
    loader.showError('Your browser does not support WebGL 2, so here is the portfolio as a page.');
    window.setTimeout(() => classic.open(), 1200);
    return;
  }
  const app = new App(canvas, portfolio);
  const audio = new GameAudio();
  window.__valley = app;
  // GPUs reset now and then (driver updates, sleeping laptops, too many tabs).
  let dismissLost: (() => void) | null = null;
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault(); // allows the browser to restore the context
    dismissLost ??= notice('The graphics card took a break.', {
      label: 'Reload the valley',
      run: () => window.location.reload(),
    });
  });
  canvas.addEventListener('webglcontextrestored', () => {
    dismissLost?.();
    dismissLost = null;
  });
  try {
    await app.load((f, label) => loader.setProgress(f, label));
  } catch (err) {
    console.error(err);
    loader.showError('Something went wrong while building the valley. Please reload.');
    window.setTimeout(() => classic.open(), 1500);
    return;
  }
  const game = new Game(app, audio, ui, classic);
  window.__game = game;
  const preferTour = new URLSearchParams(window.location.search).has('tour');
  loader.ready(
    (tour) => {
      void audio.unlock();
      app.begin({ quiet: tour });
      game.start({ tour });
    },
    () => !classic.isOpen,
    preferTour,
  );
}

void boot();
