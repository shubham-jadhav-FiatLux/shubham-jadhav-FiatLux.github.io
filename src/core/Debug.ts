import type GUI from 'lil-gui';

/**
 * Developer tools, enabled with `?debug` in the URL. lil-gui is loaded lazily so it
 * never ships in the main bundle path for regular visitors.
 */
export class Debug {
  readonly enabled: boolean;
  gui: GUI | null = null;
  private fpsEl: HTMLDivElement | null = null;
  private frames = 0;
  private acc = 0;

  constructor() {
    this.enabled = new URLSearchParams(window.location.search).has('debug');
  }

  async init(): Promise<void> {
    if (!this.enabled) return;
    const { default: GUIClass } = await import('lil-gui');
    this.gui = new GUIClass({ title: 'Valley debug', width: 300 });
    this.gui.close();
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'debug-fps';
    document.body.appendChild(this.fpsEl);
  }

  folder(name: string): GUI | null {
    return this.gui ? this.gui.addFolder(name).close() : null;
  }

  update(frameTime: number, info?: string): void {
    if (!this.fpsEl) return;
    this.frames++;
    this.acc += frameTime;
    if (this.acc >= 0.5) {
      const fps = Math.round(this.frames / this.acc);
      this.fpsEl.textContent = `${fps} fps${info ? ' · ' + info : ''}`;
      this.frames = 0;
      this.acc = 0;
    }
  }
}
