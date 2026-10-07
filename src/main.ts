import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-600.css';
import '@fontsource/lora/latin-700.css';
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
import { createContext } from './render/context';
import { Game } from './app/Game';
import { GameAudio } from './audio/GameAudio';
import { sj_portfolio } from './content/portfolio';
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

async function boot(): Promise<void> {
  const sj_named = !sj_portfolio.owner.name.includes('[');
  document.title = `${sj_portfolio.site.title} · ${sj_named ? sj_portfolio.owner.name : 'Portfolio'}`;
  const sj_canvas = document.getElementById('scene') as HTMLCanvasElement;
  const sj_context = createContext(sj_canvas);
  const sj_webgl = sj_context !== null;
  const sj_ui = document.getElementById('ui')!;
  const sj_loaderEl = document.getElementById('loader')!;
  const sj_classic = new ClassicView(document.body, sj_portfolio, sj_webgl, [
    sj_canvas,
    sj_ui,
    sj_loaderEl,
  ]);
  const sj_loader = new Loader(sj_loaderEl, sj_portfolio);
  sj_loader.onClassic(() => sj_classic.open());
  if (!sj_context) {
    sj_loader.showError(
      'Your browser does not support WebGL 2, so here is the portfolio as a page.',
    );
    window.setTimeout(() => sj_classic.open(), 1200);
    return;
  }
  const sj_app = new App(sj_canvas, sj_portfolio, sj_context);
  const sj_audio = new GameAudio();
  window.__valley = sj_app;
  // GPUs reset now and then (driver updates, sleeping laptops, too many tabs).
  let sj_dismissLost: (() => void) | null = null;
  sj_canvas.addEventListener('webglcontextlost', (sj_e) => {
    sj_e.preventDefault(); // allows the browser to restore the context
    sj_dismissLost ??= notice('The graphics card took a break.', {
      label: 'Reload the valley',
      run: () => window.location.reload(),
    });
  });
  sj_canvas.addEventListener('webglcontextrestored', () => {
    sj_dismissLost?.();
    sj_dismissLost = null;
  });
  let sj_game: Game;
  try {
    const sj_progress = (sj_f: number, sj_label: string) => sj_loader.setProgress(sj_f, sj_label);
    await sj_app.load(sj_progress);
    sj_game = new Game(sj_app, sj_audio, sj_ui, sj_classic);
    window.__game = sj_game;
    await sj_app.prepare(sj_progress);
  } catch (sj_err) {
    console.error(sj_err);
    sj_loader.showError('Something went wrong while building the valley. Please reload.');
    window.setTimeout(() => sj_classic.open(), 1500);
    return;
  }
  const sj_preferTour = new URLSearchParams(window.location.search).has('tour');
  sj_loader.ready(
    (sj_tour) => {
      void sj_audio.unlock();
      sj_app.begin({ quiet: sj_tour });
      sj_game.start({ tour: sj_tour });
    },
    () => !sj_classic.isOpen,
    sj_preferTour,
  );
}

void boot();
