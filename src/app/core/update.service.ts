import { Injectable, inject, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import { ToastController } from '@ionic/angular';
import { version } from '../../../package.json';
import { environment } from '../../environments/environment';

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'ready'
  | 'up-to-date'
  | 'needs-apk'
  | 'error';

/** True when a is a newer MAJOR.MINOR.PATCH than b. */
export function isNewer(a: string, b: string): boolean {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) {
      return (pa[i] ?? 0) > (pb[i] ?? 0);
    }
  }
  return false;
}

const AUTO_CHECK_MS = 6 * 60 * 60 * 1000;

/**
 * Updates download in the background and are offered with a prompt; Settings
 * has the manual check.
 *
 * - Web: the Angular service worker fetches a new build behind the scenes.
 * - Android: the web layer comes from the latest GitHub release's www.zip,
 *   verified against GitHub's SHA-256 digest and applied on the next start.
 *   A MAJOR version bump means native code changed, so the APK itself must be
 *   installed; the prompt links to it.
 */
@Injectable({ providedIn: 'root' })
export class UpdateService {
  private readonly sw = inject(SwUpdate);
  private readonly toastCtrl = inject(ToastController);
  private readonly native = Capacitor.isNativePlatform();
  private lastCheck = 0;
  private pendingBundle = '';
  private pendingVersion = '';

  readonly version = version;
  readonly status = signal<UpdateStatus>('idle');
  readonly latest = signal('');
  readonly apkUrl = signal('');

  start(): void {
    if (this.native) {
      // Without this the plugin assumes the new bundle is broken and rolls back.
      void CapacitorUpdater.notifyAppReady();
    } else if (this.sw.isEnabled) {
      this.sw.versionUpdates.subscribe((event) => {
        if (event.type === 'VERSION_READY') {
          this.status.set('ready');
          void this.prompt('גרסה חדשה מוכנה.');
        }
      });
    } else {
      return;
    }
    void this.check();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Date.now() - this.lastCheck > AUTO_CHECK_MS) {
        void this.check();
      }
    });
  }

  async check(manual = false): Promise<void> {
    if (this.status() === 'checking' || this.status() === 'downloading') {
      return;
    }
    this.lastCheck = Date.now();
    this.status.set('checking');
    try {
      if (this.native) {
        await this.checkNative();
      } else if (this.sw.isEnabled) {
        const found = await this.sw.checkForUpdate();
        // VERSION_READY sets 'ready' once the download finishes.
        if (!found) {
          this.status.set('up-to-date');
        }
      } else {
        this.status.set('up-to-date');
      }
    } catch {
      this.status.set('error');
      if (manual) {
        await this.toast('לא הצלחנו לבדוק עדכונים. יש חיבור לאינטרנט?');
      }
    }
  }

  async apply(): Promise<void> {
    if (this.native && this.pendingBundle) {
      await CapacitorUpdater.set({ id: this.pendingBundle });
    } else if (!this.native) {
      await this.sw.activateUpdate();
      document.location.reload();
    }
  }

  private async checkNative(): Promise<void> {
    const res = await fetch(`https://api.github.com/repos/${environment.githubRepo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) {
      throw new Error(`GitHub ${res.status}`);
    }
    const release = (await res.json()) as {
      tag_name: string;
      assets: { name: string; browser_download_url: string; digest?: string }[];
    };
    const latest = release.tag_name.replace(/^v/, '');
    this.latest.set(latest);
    this.apkUrl.set(release.assets.find((a) => a.name.endsWith('.apk'))?.browser_download_url ?? '');
    if (!isNewer(latest, version)) {
      this.status.set('up-to-date');
      return;
    }
    if (this.pendingBundle && this.pendingVersion === latest) {
      // Already downloaded; it applies the next time the app goes to the background.
      this.status.set('ready');
      return;
    }
    const zip = release.assets.find((a) => a.name === 'www.zip');
    const sha256 = zip?.digest?.startsWith('sha256:') ? zip.digest.slice(7) : '';
    if (latest.split('.')[0] !== version.split('.')[0] || !zip || !sha256) {
      this.status.set('needs-apk');
      await this.prompt(`גרסה ${latest} דורשת התקנה מחדש של האפליקציה.`, true);
      return;
    }
    this.status.set('downloading');
    const bundle = await CapacitorUpdater.download({
      url: zip.browser_download_url,
      version: latest,
      checksum: sha256,
    });
    // Applied by itself the next time the app goes to the background.
    await CapacitorUpdater.next({ id: bundle.id });
    this.pendingBundle = bundle.id;
    this.pendingVersion = latest;
    this.status.set('ready');
    await this.prompt(`גרסה ${latest} מוכנה.`);
  }

  private async prompt(message: string, needsApk = false): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      position: 'bottom',
      buttons: [
        {
          text: needsApk ? 'הורדה' : 'הפעלה מחדש',
          handler: () => {
            if (needsApk) {
              window.open(this.apkUrl(), '_system');
            } else {
              void this.apply();
            }
          },
        },
        { text: 'אחר כך', role: 'cancel' },
      ],
    });
    await toast.present();
  }

  private async toast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration: 3000 });
    await toast.present();
  }
}
