import { describe, it, expect } from 'vitest';
import { isFullColour } from '../logo-image';

/** RGBA pixels from [r, g, b, a] tuples. */
const px = (...pixels: Array<[number, number, number, number]>) => new Uint8ClampedArray(pixels.flat());

describe('isFullColour', () => {
  it('reads a white mark on transparency as one colour (drawn in the game colour)', () => {
    expect(isFullColour(px([255, 255, 255, 255], [250, 250, 250, 200], [0, 0, 0, 0], [0, 0, 0, 0]))).toBe(false);
  });

  it('reads box art as full colour (keeps its own pixels)', () => {
    expect(isFullColour(px([230, 90, 20, 255], [30, 90, 220, 255], [240, 240, 240, 255]))).toBe(true);
  });

  it('ignores a few tinted anti-aliased edge pixels on a one-colour mark', () => {
    const pixels: Array<[number, number, number, number]> = Array.from({ length: 99 }, () => [255, 255, 255, 255]);
    pixels.push([200, 120, 120, 255]);
    expect(isFullColour(px(...pixels))).toBe(false);
  });

  it('treats a fully transparent image as one colour', () => {
    expect(isFullColour(px([0, 0, 0, 0]))).toBe(false);
  });
});
