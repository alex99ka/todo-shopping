import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonItem,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { filter, firstValueFrom } from 'rxjs';
import { HouseholdService, TodoListService } from '../../core';
import { CATEGORIES, SHOPPING_LIST, TodoList } from '../../models';

interface Incoming {
  name: string;
  quantity: string;
  category: string;
}

/**
 * Landing page for the recipe book's "add to shopping list" button. The recipe
 * server redirects here with `#{"recipe": ..., "items": [...]}`; the items are
 * written to the Shopping list as the signed-in user (the route guard signs
 * them in first and returns here), so the recipe server never needs Firebase
 * credentials. Nothing is written until the user confirms: anyone can craft
 * such a link, so it must not add to your list just by being opened.
 */
@Component({
  selector: 'app-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonItem,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  styles: `
    .recipe { margin: 16px 20px 0; }
    .recipe h2 { margin: 0; }
    ion-list-header { font-family: var(--app-font-heading); color: var(--ion-color-primary-shade); }
  `,
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-button (click)="home()">Cancel</ion-button>
        </ion-buttons>
        <ion-title>Add to shopping list</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (error()) {
        <div class="ion-padding ion-text-center">
          <ion-text color="danger"><p>{{ error() }}</p></ion-text>
          <ion-button fill="clear" (click)="home()">Go to my lists</ion-button>
        </div>
      } @else {
        <div class="recipe">
          <ion-note>From the recipe</ion-note>
          <h2 dir="auto">{{ recipe || 'Recipe' }}</h2>
        </div>
        @for (group of groups(); track group.category) {
          <ion-list-header>{{ group.category }}</ion-list-header>
          <ion-list inset>
            @for (item of group.items; track $index) {
              <ion-item>
                <ion-label dir="auto">{{ item.name }}</ion-label>
                @if (item.quantity) {
                  <ion-note slot="end" dir="auto">{{ item.quantity }}</ion-note>
                }
              </ion-item>
            }
          </ion-list>
        }
      }
    </ion-content>
    @if (!error()) {
      <ion-footer class="ion-padding">
        <ion-button expand="block" [disabled]="busy()" (click)="run()">
          {{ busy() ? 'Adding…' : 'Add ' + items.length + ' items' }}
        </ion-button>
      </ion-footer>
    }
  `,
})
export class ImportPage {
  private readonly lists = inject(TodoListService);
  private readonly households = inject(HouseholdService);
  private readonly router = inject(Router);

  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected recipe = '';
  protected items: Incoming[] = [];
  protected readonly groups = computed(() =>
    CATEGORIES.map((category) => ({
      category,
      items: this.items.filter((i) => i.category === category),
    })).filter((g) => g.items.length),
  );

  constructor() {
    try {
      const data = JSON.parse(inject(ActivatedRoute).snapshot.fragment ?? '');
      this.recipe = clip(data.recipe);
      this.items = (Array.isArray(data.items) ? data.items : [])
        .slice(0, 100)
        .map((i: Record<string, unknown>) => ({
          name: clip(i?.['name']),
          quantity: clip(i?.['quantity']),
          category: (CATEGORIES as readonly string[]).includes(i?.['category'] as string)
            ? (i['category'] as string)
            : 'Other',
        }))
        .filter((i: Incoming) => i.name);
    } catch {
      this.fail('That link has no ingredients in it.');
      return;
    }
    if (!this.items.length) {
      this.fail('That link has no ingredients in it.');
    }
  }

  protected home(): void {
    void this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  protected async run(): Promise<void> {
    this.busy.set(true);
    try {
      const listId = await this.shoppingListId();
      const list = (await firstValueFrom(
        this.lists.list$(listId).pipe(filter((l) => !!l?.createdAt)),
      )) as TodoList;
      const existing = await firstValueFrom(this.lists.items$(listId, list.createdAt));
      const note = (i: Incoming) => [i.quantity, this.recipe].filter(Boolean).join(' · ');

      // Something already on the list and not yet bought gets this recipe's
      // amount appended instead of a second line for the same thing.
      for (const item of this.items) {
        const same = existing.find(
          (e) => !e.state && e.name.trim().toLowerCase() === item.name.toLowerCase(),
        );
        if (same) {
          const { name, state, date } = same;
          const description = [same.description, note(item)].filter(Boolean).join('; ');
          await this.lists.updateItem(listId, same.id, { name, state, date, description });
        } else {
          await this.lists.createItem(listId, this.lists.newItemId(listId), {
            name: item.name,
            description: note(item),
            category: item.category,
            state: false,
            date: Date.now(),
            listCreatedAt: list.createdAt,
          });
        }
      }
      await this.router.navigateByUrl(`/details/${listId}`, { replaceUrl: true });
    } catch {
      this.busy.set(false);
      this.fail('Could not add the ingredients. Try again.');
    }
  }

  // The household's Shopping list if there is one (that is the one everybody
  // shops from), else your own; created in your first household when missing.
  private async shoppingListId(): Promise<string> {
    const all = (await firstValueFrom(this.lists.lists$())).filter((l) => l.name === SHOPPING_LIST);
    const found = all.find((l) => l.householdId) ?? all[0];
    if (found) {
      return found.id;
    }
    const [household] = await firstValueFrom(this.households.households$());
    return this.lists.createList(SHOPPING_LIST, household ?? null);
  }

  private fail(message: string): void {
    this.error.set(message);
  }
}

// The fragment comes from a link anyone could craft: keep only short strings.
function clip(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}
