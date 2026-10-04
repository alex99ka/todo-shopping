import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, LoadingController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoGoogle } from 'ionicons/icons';
import { AuthService } from '../../core';
import { AlertService } from '../../shared';

@Component({
  selector: 'app-auth',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth.page.html',
  styleUrl: './auth.page.scss',
  imports: [IonContent, IonButton, IonIcon],
})
export class AuthPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly loadingCtrl = inject(LoadingController);
  private readonly alert = inject(AlertService);
  private readonly next = inject(ActivatedRoute).snapshot.queryParamMap.get('next') ?? '';

  constructor() {
    addIcons({ logoGoogle });
  }

  protected async signInGoogle(): Promise<void> {
    // Opening the Google popup has to happen in the click's own frame, before the
    // loader is awaited, or the browser treats it as unrequested and blocks it.
    const signIn = this.auth.signInGoogle();
    signIn.catch(() => undefined);

    const loading = await this.loadingCtrl.create({ message: 'רק רגע…' });
    await loading.present();
    try {
      await signIn;
    } catch (e) {
      await loading.dismiss();
      // Closing the popup is a choice, not an error; anything else must be visible.
      const code = (e as { code?: string }).code ?? '';
      if (!/popup-closed|cancelled-popup|canceled/.test(code)) {
        await this.alert.presentToast(`הכניסה נכשלה (${code || 'שגיאה'}). נסו שוב.`);
      }
      return;
    }
    await loading.dismiss();
    // Only same-app paths: '//evil.example' would be an open redirect.
    const safe = this.next.startsWith('/') && !this.next.startsWith('//');
    await this.router.navigateByUrl(safe ? this.next : '/home');
  }
}
