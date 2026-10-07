/**
 * Attributes of the page's WebGL 2 context. The canvas is opaque (every frame covers it
 * completely), so the browser can composite it without blending it over the page; the
 * scene is antialiased in the post-processing render target, not here.
 */
const CONTEXT_ATTRIBUTES: WebGLContextAttributes = {
  alpha: false,
  depth: true,
  stencil: false,
  antialias: false,
  premultipliedAlpha: true,
  preserveDrawingBuffer: false,
  powerPreference: 'high-performance',
  failIfMajorPerformanceCaveat: false,
};

/**
 * Creates the WebGL 2 context on the scene's own canvas, or returns null where WebGL 2
 * is not available. Checking for support this way, instead of on a throwaway canvas,
 * avoids creating (and discarding) a second context, which is slow on some machines.
 */
export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  try {
    return canvas.getContext('webgl2', CONTEXT_ATTRIBUTES);
  } catch {
    return null;
  }
}
