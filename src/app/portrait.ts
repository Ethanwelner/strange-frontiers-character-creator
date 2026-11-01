// A character's picture. The player's image is shrunk in the browser to fit
// PORTRAIT_SIZE on its long side and saved as WebP (JPEG where the browser
// can't write WebP), then kept in the build as a data URL. A phone photo of a
// few megabytes comes out around 30–80 KB, small enough for the saved draft and
// the exported JSON. Nothing is uploaded anywhere.
import { MAX_PORTRAIT_LENGTH } from "./draft.js";

export const PORTRAIT_SIZE = 512;

export async function toPortrait(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error(`${file.name} isn't an image.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`Couldn't read ${file.name}. Try a PNG, JPEG or WebP.`);
  }
  const scale = Math.min(1, PORTRAIT_SIZE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  // Browsers that can't write WebP hand back a PNG instead; JPEG is smaller.
  let url = canvas.toDataURL("image/webp", 0.82);
  if (!url.startsWith("data:image/webp")) url = canvas.toDataURL("image/jpeg", 0.85);
  if (url.length > MAX_PORTRAIT_LENGTH) throw new Error(`${file.name} is still too big after shrinking it.`);
  return url;
}
