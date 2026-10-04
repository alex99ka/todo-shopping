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
        <ion-title>משקי בית</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content class="ion-padding">
      <p>
        <ion-note>
          כל מי שבמשק הבית רואה את כל הרשימות שמשויכות אליו. רשימה שלא משויכת למשק בית
          נשארת פרטית — רק לך ולמי שהזמנת אליה.
        </ion-note>
      </p>
      <ion-list>
        @for (h of households(); track h.id) {
          <ion-item>
            <ion-label>
              <h2>{{ h.name }}</h2>
              <p>
                {{ h.memberUids.length === 1 ? 'חבר אחד' : h.memberUids.length + ' חברים' }}
                {{ h.ownerUid === uid ? '· בבעלותך' : '' }}
              </p>
            </ion-label>
            <ion-button slot="end" fill="clear" aria-label="הזמנה" (click)="invite(h)">
              <ion-icon slot="icon-only" name="person-add"></ion-icon>
            </ion-button>
            @if (h.ownerUid === uid) {
              <ion-button slot="end" fill="clear" color="medium" aria-label="שינוי שם" (click)="rename(h)">
                <ion-icon slot="icon-only" name="create"></ion-icon>
              </ion-button>
              <ion-button slot="end" fill="clear" color="danger" aria-label="מחיקה" (click)="remove(h)">
                <ion-icon slot="icon-only" name="trash"></ion-icon>
              </ion-button>
            } @else {
              <ion-button slot="end" fill="clear" color="danger" aria-label="עזיבה" (click)="leave(h)">
                <ion-icon slot="icon-only" name="exit"></ion-icon>
              </ion-button>
            }
          </ion-item>
        } @empty {
          <app-empty-list
            icon="home"
            h1Text="אין עדיין משק בית"
            h3Text="צרו אחד והזמינו את מי שגר איתכם."
            h3TextSecond=""
          />
        }
      </ion-list>
      <ion-fab slot="fixed" vertical="bottom" horizontal="end">
        <ion-fab-button aria-label="משק בית חדש" (click)="create()">
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
      title: 'משק בית חדש',
      inputs: [{ name: 'name', placeholder: 'למשל: הבית' }],
      yesText: 'יצירה',
      yesToastThen: 'משק הבית נוצר',
      yesToastCatch: 'משהו השתבש',
      yesFunction: (data) => this.service.create((data?.['name'] ?? '').trim() || 'הבית'),
    });
  }

  protected invite(h: Household): void {
    this.invites
      .share('household', h.id, h.name)
      .catch(() => this.alert.presentToast('לא הצלחנו ליצור הזמנה'));
  }

  protected rename(h: Household): void {
    void this.alert.createAlert({
      title: 'שינוי שם',
      inputs: [{ name: 'name', value: h.name }],
      yesText: 'שמירה',
      yesToastThen: 'השם שונה',
      yesToastCatch: 'משהו השתבש',
      yesFunction: (data) => this.service.rename(h.id, (data?.['name'] ?? '').trim() || h.name),
    });
  }

  protected leave(h: Household): void {
    void this.alert.createAlert({
      title: 'לעזוב את משק הבית?',
      message: `לא תראו יותר את הרשימות של "${h.name}".`,
      yesText: 'עזיבה',
      yesToastThen: 'עזבת את משק הבית',
      yesToastCatch: 'משהו השתבש',
      yesFunction: () => this.service.leave(h.id),
    });
  }

  protected remove(h: Household): void {
    void this.alert.createAlert({
      title: 'למחוק את משק הבית?',
      message: 'הרשימות שלו נשמרות, אבל רק מי שהוזמן אליהן ישירות ימשיך לראות אותן.',
      yesText: 'מחיקה',
      yesToastThen: 'משק הבית נמחק',
      yesToastCatch: 'משהו השתבש',
      yesFunction: () => this.service.delete(h.id),
    });
  }
}
