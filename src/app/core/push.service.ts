import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { ToastController } from '@ionic/angular';
import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { AuthService } from './auth.service';
import { FIREBASE_APP, FIRESTORE } from './firebase.providers';

const ENABLED_KEY = 'push-enabled';

/**
 * Registers this device for push (reminders, list changes, new versions) by
 * saving its FCM token under users/{uid}/tokens. The notifier service on the
 * Pi does the sending, so this needs no paid Firebase plan.
 */
@Injectable({ providedIn: 'root' })
export class PushService {
  private readonly db = inject(FIRESTORE);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly toastCtrl = inject(ToastController);
  private token = '';
  private listening = false;

  readonly enabled = signal(readFlag());
  readonly supported = signal(true);

  constructor() {
    // The plugin's web side calls getMessaging() on load, which needs the app first.
    inject(FIREBASE_APP);
  }

  /** On each sign-in: wire up taps once, refresh the token if this device opted in. */
  async start(): Promise<void> {
    const { isSupported } = await FirebaseMessaging.isSupported();
    this.supported.set(isSupported);
    if (!isSupported) {
      return;
    }
    if (!this.listening) {
      this.listening = true;
      await this.listen();
    }
    if (this.enabled() && (await FirebaseMessaging.checkPermissions()).receive === 'granted') {
      await this.register().catch(() => undefined);
    }
  }

  private async listen(): Promise<void> {
    await FirebaseMessaging.addListener('notificationReceived', ({ notification }) => {
      void this.toastCtrl
        .create({ message: notification.title ?? notification.body ?? '', duration: 4000 })
        .then((t) => t.present());
    });
    await FirebaseMessaging.addListener('notificationActionPerformed', ({ notification }) => {
      const path = (notification.data as Record<string, string> | undefined)?.['path'];
      if (path?.startsWith('/') && !path.startsWith('//')) {
        void this.router.navigateByUrl(path);
      }
    });
  }

  /** Must run from a tap: browsers only show the permission prompt for a user gesture. */
  async enable(): Promise<boolean> {
    const { receive } = await FirebaseMessaging.requestPermissions();
    if (receive !== 'granted') {
      return false;
    }
    await this.register();
    this.setFlag(true);
    return true;
  }

  async disable(): Promise<void> {
    this.setFlag(false);
    await this.forget();
  }

  /** Before sign-out, so a shared device stops getting the last user's pushes. */
  async forget(): Promise<void> {
    const uid = this.auth.uid;
    if (uid && this.token) {
      await deleteDoc(doc(this.db, 'users', uid, 'tokens', this.token)).catch(() => undefined);
    }
    await FirebaseMessaging.deleteToken().catch(() => undefined);
    this.token = '';
  }

  private async register(): Promise<void> {
    const uid = this.auth.uid;
    if (!uid) {
      return;
    }
    const { token } = await FirebaseMessaging.getToken();
    this.token = token;
    await setDoc(doc(this.db, 'users', uid, 'tokens', token), {
      platform: Capacitor.getPlatform(),
      updatedAt: serverTimestamp(),
    });
  }

  private setFlag(on: boolean): void {
    this.enabled.set(on);
    try {
      localStorage.setItem(ENABLED_KEY, on ? '1' : '');
    } catch {
      // Private mode: the switch just will not survive a restart.
    }
  }
}

function readFlag(): boolean {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
}
