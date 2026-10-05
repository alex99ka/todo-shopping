import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { StatusBar, Style } from '@capacitor/status-bar';
import {
  IonApp,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonMenu,
  IonMenuToggle,
  IonRouterOutlet,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { home, listCircle, logOut, settings } from 'ionicons/icons';
import { AuthService, PushService, UpdateService } from './core';
import { AlertService } from './shared';
import { CustomAlert } from './models';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
  imports: [
    IonApp,
    IonMenu,
    IonHeader,
    IonContent,
    IonItem,
    IonIcon,
    IonLabel,
    IonMenuToggle,
    IonRouterOutlet,
    RouterLink,
    RouterLinkActive,
  ],
})
export class AppComponent {
  private readonly auth = inject(AuthService);
  private readonly alert = inject(AlertService);
  private readonly router = inject(Router);
  private readonly push = inject(PushService);

  protected readonly user = toSignal(this.auth.user$, { initialValue: null });

  constructor() {
    addIcons({ listCircle, home, settings, logOut });
    void this.prepareNativeChrome();
    inject(UpdateService).start();
    // Re-register this device's push token whenever someone signs in.
    this.auth.user$.subscribe((user) => {
      if (user) {
        void this.push.start().catch(() => undefined);
      }
    });
  }

  protected confirmSignOut(): void {
    const alert: CustomAlert = {
      title: 'להתנתק?',
      message: 'המכשיר הזה יפסיק לקבל התראות עבור החשבון.',
      yesText: 'התנתקות',
      yesToastThen: 'התנתקת',
      yesToastCatch: 'משהו השתבש',
      yesFunction: () => this.signOut(),
    };
    void this.alert.createAlert(alert);
  }

  private async signOut(): Promise<void> {
    await this.push.forget();
    await this.auth.signOut();
    await this.router.navigate(['/auth']);
  }

  private async prepareNativeChrome(): Promise<void> {
    if (!Capacitor.isNativePlatform()) {
      return;
    }
    // setBackgroundColor is Android-only and rejects elsewhere; the original app
    // only ever shipped an Android build.
    // Light app: white status bar with dark icons (Style.Light means dark content).
    await StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#ffffff' });
    }
    await SplashScreen.hide();
  }
}
