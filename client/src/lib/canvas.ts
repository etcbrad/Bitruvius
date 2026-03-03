export function setupCanvas(canvas: HTMLCanvasElement, container: HTMLDivElement) {
  const dpr = window.devicePixelRatio || 1;
  const cssW = Math.max(1, container.clientWidth);
  const cssH = Math.max(1, container.clientHeight);

  canvas.width = Math.max(1, Math.floor(cssW * dpr));
  canvas.height = Math.max(1, Math.floor(cssH * dpr));
  canvas.style.width = `${cssW}px`;
  canvas.style.height = `${cssH}px`;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Ensure scaling doesn't compound across resizes.
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

export function observeCanvasContainer(canvas: HTMLCanvasElement, container: HTMLDivElement) {
  setupCanvas(canvas, container);
  const observer = new ResizeObserver(() => setupCanvas(canvas, container));
  observer.observe(container);
  return () => observer.disconnect();
}

