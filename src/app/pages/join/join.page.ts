import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonContent,
  IonHeader,
  IonSpinner,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { InviteService } from '../../core';
import { Invite } from '../../models';

@Component({
  selector: 'app-join',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonButton, IonContent, IonHeader, IonSpinner, IonText, IonTitle, IonToolbar],
  template: `
    <ion-header>
      <ion-toolbar color="primary"><ion-title>Invitation</ion-title></ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding ion-text-center">
      @if (error()) {
        <ion-text color="danger"><p>{{ error() }}</p></ion-text>
        <ion-button fill="clear" (click)="go('/home')">Go to my lists</ion-button>
      } @else if (invite(); as inv) {
        <h2>Join {{ inv.kind === 'list' ? 'the list' : 'the household' }} "{{ inv.targetName }}"?</h2>
        @if (inv.kind === 'household') {
          <p>You will see every list filed under this household.</p>
        }
        <ion-button [disabled]="busy()" (click)="join(inv)">Join</ion-button>
        <ion-button fill="clear" (click)="go('/home')">Not now</ion-button>
      } @else {
        <ion-spinner></ion-spinner>
      }
    </ion-content>
  `,
})
export class JoinPage {
  private readonly invites = inject(InviteService);
  private readonly router = inject(Router);
  private readonly inviteId = inject(ActivatedRoute).snapshot.paramMap.get('inviteId') ?? '';

  protected readonly invite = signal<Invite | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  constructor() {
    void this.invites.get(this.inviteId).then(
      (inv) => (inv ? this.invite.set(inv) : this.error.set('This invitation does not exist.')),
      () => this.error.set('This invitation does not exist.'),
    );
  }

  protected async join(inv: Invite): Promise<void> {
    this.busy.set(true);
    try {
      await this.go(await this.invites.join(this.inviteId, inv));
    } catch {
      // The rules refuse an invite older than 7 days.
      this.error.set('This invitation has expired. Ask for a new link.');
    }
  }

  protected go(url: string): Promise<boolean> {
    return this.router.navigateByUrl(url, { replaceUrl: true });
  }
}
