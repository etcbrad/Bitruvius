import { computeOtsuThreshold, runPenInkCleanup } from '@/app/sheetParser';

// Synthetic sepia-ish sheet with a dark stroke on the left
const makeSepiaImage = () => {
  const width = 4;
  const height = 4;
  const img = new ImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      // Warm paper base
      let r = 220, g = 200, b = 170;
      // Dark stroke on left column
      if (x === 0 && y >= 1 && y <= 2) {
        r = 50; g = 40; b = 30;
      }
      img.data[idx] = r;
      img.data[idx + 1] = g;
      img.data[idx + 2] = b;
      img.data[idx + 3] = 255;
    }
  }
  return img;
};

describe('Pen & Ink parser helpers', () => {
  it('normalizes sepia paper and retains dark strokes', () => {
    const img = makeSepiaImage();
    const cleaned = runPenInkCleanup(img);
    // Gutter removal zeros alpha on the top row
    expect(cleaned.data[3]).toBe(0);
    // Dark stroke stays darker than paper after cleanup
    const paperLum = cleaned.data[(1 * cleaned.width + 1) * 4];
    const strokeLum = cleaned.data[(1 * cleaned.width + 0) * 4];
    expect(strokeLum).toBeLessThan(paperLum);
  });

  it('computes an adaptive threshold after cleanup', () => {
    const img = runPenInkCleanup(makeSepiaImage());
    const threshold = computeOtsuThreshold(img.data);
    expect(threshold).toBeGreaterThan(80);
    expect(threshold).toBeLessThan(200);
  });
});
