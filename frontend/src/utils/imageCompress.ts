/**
 * Downscales and re-encodes an image file to a JPEG data URL that fits the backend's receipt
 * upload cap (~2.2MB binary / 3,000,000 base64 chars — see receiptImageSchema on the backend).
 * A raw phone-camera photo from a web file picker is routinely 3-10MB, well over that limit.
 */
export async function fileToCompressedDataUrl(file: File, maxDimension = 1600, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);

  let q = quality;
  let dataUrl = canvas.toDataURL("image/jpeg", q);
  // Re-encode at progressively lower quality if still too large for the backend's cap.
  while (dataUrl.length > 2_900_000 && q > 0.3) {
    q -= 0.15;
    dataUrl = canvas.toDataURL("image/jpeg", q);
  }
  if (dataUrl.length > 2_900_000) {
    throw new Error("This image is too large to attach, even after compression");
  }
  return dataUrl;
}
