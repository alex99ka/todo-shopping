import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonMenuButton,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, create, exit, personAdd, trash } from 'ionicons/icons';
import { AuthService, HouseholdService, InviteService } from '../../core';
import { Household } from '../../models';
import { AlertService, EmptyListComponent } from '../../shared';

@Component({
  selector: 'app-households',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFab,
    IonFabButton,
    IonHeader,
    IonIcon,
    IonItem,
    IonLabel,
    IonList,
    IonMenuButton,
    IonNote,
    IonTitle,
    IonToolbar,
    EmptyListComponent,
  ],
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start"><ion-menu-button></ion-menu-button></ion-buttons>
        <ion-title>Households</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>
        <ion-note>
          Everyone in a household sees every list filed under it. Lists you keep out of a
          household stay private to you and whoever you invite to that list.
        </ion-note>
      </p>
      <ion-list>
        @for (h of households(); track h.id) {
          <ion-item>
            <ion-label>
              <h2>{{ h.name }}</h2>
              <p>
                {{ h.memberUids.length }} {{ h.memberUids.length === 1 ? 'member' : 'members' }}
                {{ h.ownerUid === uid ? '· you own it' : '' }}
              </p>
            </ion-label>
            <ion-button slot="end" fill="clear" aria-label="Invite" (click)="invite(h)">
              <ion-icon slot="icon-only" name="person-add"></ion-icon>
            </ion-button>
            @if (h.ownerUid === uid) {
              <ion-button slot="end" fill="clear" color="medium" aria-label="Rename" (click)="rename(h)">
                <ion-icon slot="icon-only" name="create"></ion-icon>
              </ion-button>
              <ion-button slot="end" fill="clear" color="danger" aria-label="Delete" (click)="remove(h)">
                <ion-icon slot="icon-only" name="trash"></ion-icon>
              </ion-button>
            } @else {
              <ion-button slot="end" fill="clear" color="danger" aria-label="Leave" (click)="leave(h)">
                <ion-icon slot="icon-only" name="exit"></ion-icon>
              </ion-button>
            }
          </ion-item>
        } @empty {
          <app-empty-list
            icon="home"
            h1Text="No household yet"
            h3Text="Create one and invite the people you live with."
            h3TextSecond=""
          />
        }
      </ion-list>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button aria-label="New household" (click)="create()">
          <ion-icon name="add"></ion-icon>
        </ion-fab-button>
      </ion-fab>
    </ion-content>
  `,
})
export class HouseholdsPage {
  private readonly service = inject(HouseholdService);
  private readonly invites = inject(InviteService);
  private readonly alert = inject(AlertService);

  protected readonly uid = inject(AuthService).uid;
  protected readonly households = toSignal(this.service.households$(), { initialValue: [] });

  constructor() {
    addIcons({ add, create, exit, personAdd, trash });
  }

  protected create(): void {
    void this.alert.createAlert({
      title: 'New household',
      inputs: [{ name: 'name', placeholder: 'e.g. Home' }],
      yesText: 'Create',
      yesToastThen: 'Household created',
      yesToastCatch: 'Something wrong happened',
      yesFunction: (data) => this.service.create((data?.['name'] ?? '').trim() || 'Home'),
    });
  }

  protected invite(h: Household): void {
    this.invites
      .share('household', h.id, h.name)
      .catch(() => this.alert.presentToast('Could not create the invite'));
  }

  protected rename(h: Household): void {
    void this.alert.createAlert({
      title: 'Rename household',
      inputs: [{ name: 'name', value: h.name }],
      yesText: 'Save',
      yesToastThen: 'Household renamed',
      yesToastCatch: 'Something wrong happened',
      yesFunction: (data) => this.service.rename(h.id, (data?.['name'] ?? '').trim() || h.name),
    });
  }

  protected leave(h: Household): void {
    void this.alert.createAlert({
      title: 'Leave household?',
      message: `You will no longer see the lists filed under "${h.name}".`,
      yesText: 'Leave',
      yesToastThen: 'You left the household',
      yesToastCatch: 'Something wrong happened',
      yesFunction: () => this.service.leave(h.id),
    });
  }

  protected remove(h: Household): void {
    void this.alert.createAlert({
      title: 'Delete household?',
      message: 'Its lists are kept, but only their own members will still see them.',
      yesText: 'Delete',
      yesToastThen: 'Household deleted',
      yesToastCatch: 'Something wrong happened',
      yesFunction: () => this.service.delete(h.id),
    });
  }
}
