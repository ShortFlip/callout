/**
 * Shrink a picked image to the 128px PNG a game logo is stored as.
 *
 * Why in the browser: the source logos run to 1.5 MB at 1024px, and every
 * board draws each game's logo on every square. 128px is 4x the largest size
 * it is ever drawn at (32px on a hero square at 2x DPR), and lands at tens of
 * KB. The image is fitted inside the square, never cropped, on a transparent
 * ground, so a round badge stays round and a squircle stays a squircle.
 */
export const LOGO_SIZE = 128;

/**
 * Appended to a full-colour logo's URL (a fragment, so the fetch ignores it).
 * Untagged logos are drawn as one-colour silhouettes in the game's colour,
 * which is right for both of his and for every logo uploaded before the tag
 * existed. No column needed: the URL already rides into every card legend.
 */
export const FULL_COLOUR_TAG = '#color';

/**
 * Whether an image is more than one colour, judged on its opaque pixels: a
 * white wordmark with soft edges is one colour, box art is not. A pixel
 * counts as off-colour when it is clearly saturated (channel spread > 48);
 * 3% of such pixels makes it full colour, so anti-aliasing never tips it.
 */
export function isFullColour(data: Uint8ClampedArray): boolean {
  let opaque = 0;
  let coloured = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    opaque++;
    const spread = Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
    if (spread > 48) coloured++;
  }
  return opaque > 0 && coloured / opaque > 0.03;
}

export async function toLogoPng(file: Blob): Promise<{ png: Blob; fullColour: boolean }> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = LOGO_SIZE;
  canvas.height = LOGO_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  const scale = Math.min(LOGO_SIZE / bitmap.width, LOGO_SIZE / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (LOGO_SIZE - width) / 2, (LOGO_SIZE - height) / 2, width, height);
  bitmap.close();
  const fullColour = isFullColour(ctx.getImageData(0, 0, LOGO_SIZE, LOGO_SIZE).data);
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the logo'))), 'image/png'),
  );
  return { png, fullColour };
}
