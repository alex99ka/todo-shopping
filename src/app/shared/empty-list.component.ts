import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IonIcon } from '@ionic/angular';
import { addIcons } from 'ionicons';
import { basket, home, listCircle, notifications, people } from 'ionicons/icons';

@Component({
  selector: 'app-empty-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IonIcon],
  styles: `
    :host { display: block; padding: 48px 24px; text-align: center; }
    .badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 88px; height: 88px; border-radius: 50%;
      background: var(--app-primary-soft); color: var(--ion-color-primary);
      font-size: 44px; margin-bottom: 16px;
    }
    h2 { margin: 0 0 6px; font-size: 1.15rem; }
    p { margin: 0; color: var(--ion-color-medium-shade); line-height: 1.5; }
  `,
  template: `
    <span class="badge"><ion-icon [name]="icon()" aria-hidden="true"></ion-icon></span>
    @if (h1Text()) {
      <h2>{{ h1Text() }}</h2>
    }
    <p>
      {{ h3Text() }}
      @if (h3TextSecond()) {
        <br />{{ h3TextSecond() }}
      }
    </p>
  `,
})
export class EmptyListComponent {
  readonly icon = input('notifications');
  readonly h1Text = input('');
  readonly h3Text = input('');
  readonly h3TextSecond = input('');

  constructor() {
    addIcons({ basket, home, listCircle, notifications, people });
  }
}
