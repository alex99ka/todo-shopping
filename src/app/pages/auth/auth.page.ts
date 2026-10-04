import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { IonButton, IonContent, IonIcon, LoadingController } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { logoGoogle } from 'ionicons/icons';
import { AuthService } from '../../core';

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
  private readonly next = inject(ActivatedRoute).snapshot.queryParamMap.get('next') ?? '';

  constructor() {
    addIcons({ logoGoogle });
  }

  protected async signInGoogle(): Promise<void> {
    // Opening the Google popup has to happen in the click's own frame, before the
    // loader is awaited, or the browser treats it as unrequested and blocks it.
    const signIn = this.auth.signInGoogle();
    signIn.catch(() => undefined);

    const loading = await this.loadingCtrl.create({ message: 'Please wait...' });
    await loading.present();
    try {
      await signIn;
    } catch {
      await loading.dismiss();
      return;
    }
    await loading.dismiss();
    // Only same-app paths: '//evil.example' would be an open redirect.
    const safe = this.next.startsWith('/') && !this.next.startsWith('//');
    await this.router.navigateByUrl(safe ? this.next : '/home');
  }
}
