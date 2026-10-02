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

export async function toLogoPng(file: Blob): Promise<Blob> {
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
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the logo'))), 'image/png'),
  );
}
