import { Capacitor } from "@capacitor/core";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

const isNative = Capacitor.isNativePlatform();

/**
 * Captures a receipt photo natively, or falls back to the browser's own file-input camera
 * capture on web (handled by the caller via <input type="file" accept="image/*" capture>) —
 * this module only covers the native path. Returns a data URL, or null if unavailable/cancelled.
 */
export async function capturePhoto(): Promise<string | null> {
  if (!isNative) return null;
  try {
    const photo = await Camera.getPhoto({
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt,
      quality: 80,
      width: 1600, // keeps the encoded data URL under the backend's ~2.2MB receipt upload cap
    });
    return photo.dataUrl ?? null;
  } catch {
    return null; // user cancelled or permission denied
  }
}

export async function isCameraAvailable(): Promise<boolean> {
  if (!isNative) return false;
  try {
    const status = await Camera.checkPermissions();
    return status.camera === "granted" || status.camera === "prompt" || status.camera === "prompt-with-rationale";
  } catch {
    return false;
  }
}
