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
    const { default: sj_GUIClass } = await import('lil-gui');
    this.gui = new sj_GUIClass({ title: 'Valley debug', width: 300 });
    this.gui.close();
    this.fpsEl = document.createElement('div');
    this.fpsEl.className = 'debug-fps';
    document.body.appendChild(this.fpsEl);
  }

  folder(sj_name: string): GUI | null {
    return this.gui ? this.gui.addFolder(sj_name).close() : null;
  }

  update(sj_frameTime: number, sj_info?: string): void {
    if (!this.fpsEl) return;
    this.frames++;
    this.acc += sj_frameTime;
    if (this.acc >= 0.5) {
      const sj_fps = Math.round(this.frames / this.acc);
      this.fpsEl.textContent = `${sj_fps} fps${sj_info ? ' · ' + sj_info : ''}`;
      this.frames = 0;
      this.acc = 0;
    }
  }
}
