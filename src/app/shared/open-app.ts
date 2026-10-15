import { AppLauncher } from '@capacitor/app-launcher';
import { Capacitor } from '@capacitor/core';

/**
 * Opens a sister app: the installed Android app by its package name, otherwise
 * (not installed, or on the web) its web version.
 */
export async function openApp(androidPackage: string, webUrl: string): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    try {
      if ((await AppLauncher.openUrl({ url: androidPackage })).completed) {
        return;
      }
    } catch {
      // Not installed: fall through to the web version.
    }
  }
  window.open(webUrl, '_blank');
}
