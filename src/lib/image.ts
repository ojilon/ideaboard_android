/**
 * Downscale images on import. Keeps a board with 20 photos to a few MB, which
 * matters because everything lives in IndexedDB on a phone.
 */

export type PreparedImage = { blob: Blob; mime: string; width: number; height: number };

async function decode(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; close: () => void }> {
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h),
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), mime, quality));
}

export async function prepareImage(file: File, maxDim = 1400): Promise<PreparedImage> {
  const source = await decode(file);
  try {
    const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    ctx.imageSmoothingQuality = 'high';
    source.draw(ctx, width, height);

    let blob = await canvasToBlob(canvas, 'image/webp', 0.82);
    let mime = 'image/webp';
    if (!blob) {
      blob = await canvasToBlob(canvas, 'image/jpeg', 0.82);
      mime = 'image/jpeg';
    }
    if (!blob) throw new Error('Could not encode image');
    return { blob, mime, width, height };
  } finally {
    source.close();
  }
}
