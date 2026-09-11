import { Capacitor } from "@capacitor/core";
import { Share } from "@capacitor/share";

const isNative = Capacitor.isNativePlatform();

/**
 * Opens the native OS share sheet. On web, callers should fall back to the Web Share API
 * (navigator.share) or a plain download — this module only covers the native path.
 */
export async function shareNative(options: { title: string; text?: string; url?: string }): Promise<boolean> {
  if (!isNative) return false;
  try {
    await Share.share(options);
    return true;
  } catch {
    return false; // user dismissed the share sheet
  }
}

export function isNativeShareAvailable(): boolean {
  return isNative;
}
