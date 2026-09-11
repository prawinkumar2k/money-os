import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { shareNative } from "./share";

const isNative = Capacitor.isNativePlatform();

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] ?? ""); // strip the "data:*/*;base64," prefix
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Saves a downloaded blob to the app's cache directory and opens the native share sheet so the
 * user can save/send it — the `<a download>` anchor-click pattern used on web does not reliably
 * trigger a download inside an Android/iOS WebView. Returns true if handled natively, false if
 * the caller should fall back to the web download-link approach.
 */
export async function saveAndShareFile(blob: Blob, filename: string): Promise<boolean> {
  if (!isNative) return false;
  const base64 = await blobToBase64(blob);
  const write = await Filesystem.writeFile({
    path: filename,
    data: base64,
    directory: Directory.Cache,
  });
  await shareNative({ title: filename, url: write.uri });
  return true;
}
