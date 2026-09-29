import '@fontsource/cormorant-garamond/latin-500.css';
import '@fontsource/cormorant-garamond/latin-700.css';
import '@fontsource/cormorant-garamond/latin-500-italic.css';
import '@fontsource/lora/latin-400.css';
import '@fontsource/lora/latin-600.css';
import '@fontsource/lora/latin-400-italic.css';
import './ui/styles/base.css';
import './ui/styles/loader.css';
import { App } from './app/App';
import { portfolio } from './content/portfolio';
import { Loader } from './ui/Loader';

declare global {
  interface Window {
    /** Debug / automation handle. */
    __valley?: App;
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
  document.title = `${portfolio.site.title} · ${portfolio.owner.name.includes('[') ? 'Portfolio' : portfolio.owner.name}`;
  const loader = new Loader(document.getElementById('loader')!, portfolio);
  if (!hasWebGL2()) {
    loader.showError('Your browser does not support WebGL 2, so the 3D valley cannot open.');
    return;
  }
  const canvas = document.getElementById('scene') as HTMLCanvasElement;
  const app = new App(canvas);
  window.__valley = app;
  try {
    await app.load((f, label) => loader.setProgress(f, label));
  } catch (err) {
    console.error(err);
    loader.showError('Something went wrong while building the valley. Please reload.');
    return;
  }
  loader.ready(() => app.begin());
}

void boot();
