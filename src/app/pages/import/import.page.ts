import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActionSheetController,
  IonButton,
  IonButtons,
  IonContent,
  IonFooter,
  IonHeader,
  IonIcon,
  IonListHeader,
  IonNote,
  IonText,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { basket, chevronDown, close } from 'ionicons/icons';
import { filter, firstValueFrom, map } from 'rxjs';
import { HouseholdService, TodoListService } from '../../core';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  SHOPPING_LIST,
  TodoList,
  UNIT_LABELS,
  Unit,
  isShopping,
  listLabel,
  parseAmount,
} from '../../models';

interface Row {
  name: string;
  amount: string;
  unit: Unit | '';
  /** The recipe's wording when it is in none of the units ("2 כפות"); kept unless an amount is typed. */
  note: string;
  category: string;
}

/**
 * Landing page for the recipe book's "add to shopping list" button. The recipe
 * server redirects here with `#{"recipe": ..., "items": [...]}`; the items are
 * written to your recipe list as the signed-in user (the route guard signs
 * them in first and returns here), so the recipe server never needs Firebase
 * credentials. Nothing is written until the user confirms: anyone can craft
 * such a link, so it must not add to your list just by being opened.
 */
@Component({
  selector: 'app-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonContent,
    IonFooter,
    IonHeader,
    IonIcon,
    IonListHeader,
    IonNote,
    IonText,
    IonTitle,
    IonToolbar,
  ],
  styleUrl: './import.page.scss',
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button (click)="home()">ביטול</ion-button>
        </ion-buttons>
        <ion-title>הוספה לרשימת הקניות</ion-title>
      </ion-toolbar>
    </ion-header>
    <ion-content>
      @if (error()) {
        <div class="ion-padding ion-text-center">
          <ion-text color="danger"><p>{{ error() }}</p></ion-text>
          <ion-button fill="clear" (click)="home()">לרשימות שלי</ion-button>
        </div>
      } @else {
        <div class="intro">
          <ion-note>מהמתכון</ion-note>
          <h2 dir="auto">{{ recipe || 'מתכון' }}</h2>
          <button
            type="button"
            class="target"
            [disabled]="(lists()?.length ?? 0) < 2"
            aria-label="בחירת הרשימה שאליה יתווספו המצרכים"
            (click)="pickList()"
          >
            <ion-icon name="basket" aria-hidden="true"></ion-icon>
            <span>אל</span>
            <b dir="auto">{{ target()?.name ?? newListName }}</b>
            @if ((lists()?.length ?? 0) > 1) {
              <ion-icon name="chevron-down" aria-hidden="true"></ion-icon>
            }
          </button>
        </div>
        @for (group of groups(); track group.category) {
          <ion-list-header>{{ labels[group.category] }}</ion-list-header>
          <div class="card">
            @for (row of group.rows; track row) {
              <div class="line">
                <div class="row">
                  <input class="name" dir="auto" maxlength="200" aria-label="מצרך" [(ngModel)]="row.name" />
                  <input
                    class="amount"
                    inputmode="decimal"
                    maxlength="12"
                    placeholder="כמות"
                    [attr.aria-label]="'כמות ' + row.name"
                    [(ngModel)]="row.amount"
                  />
                  <select class="unit" [attr.aria-label]="'יחידה ' + row.name" [(ngModel)]="row.unit">
                    <option value="">—</option>
                    @for (u of units; track u[0]) {
                      <option [value]="u[0]">{{ u[1] }}</option>
                    }
                  </select>
                  <button type="button" class="remove" [attr.aria-label]="'הסרת ' + row.name" (click)="remove(row)">
                    <ion-icon name="close" aria-hidden="true"></ion-icon>
                  </button>
                </div>
                @if (row.note && !row.amount.trim()) {
                  <p class="note" dir="auto">במתכון: {{ row.note }}</p>
                }
              </div>
            }
          </div>
        } @empty {
          <p class="empty">הסרת את כל המצרכים.</p>
        }
      }
    </ion-content>
    @if (!error()) {
      <ion-footer class="ion-padding">
        <ion-button
          expand="block"
          color="tertiary"
          [disabled]="busy() || !ready() || !count()"
          (click)="run()"
        >
          {{ busy() ? 'מוסיף…' : count() === 1 ? 'הוספת פריט אחד' : 'הוספת ' + count() + ' פריטים' }}
        </ion-button>
      </ion-footer>
    }
  `,
})
export class ImportPage {
  private readonly todoLists = inject(TodoListService);
  private readonly households = inject(HouseholdService);
  private readonly router = inject(Router);
  private readonly actionSheet = inject(ActionSheetController);

  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly labels = CATEGORY_LABELS;
  protected readonly units = Object.entries(UNIT_LABELS) as [Unit, string][];
  protected readonly newListName = `${SHOPPING_LIST} (חדשה)`;
  protected recipe = '';
  protected readonly rows = signal<Row[]>([]);
  protected readonly groups = computed(() =>
    CATEGORIES.map((category) => ({
      category,
      rows: this.rows().filter((r) => r.category === category),
    })).filter((g) => g.rows.length),
  );

  // Both undefined until loaded, so a quick tap cannot create a new list meanwhile.
  protected readonly lists = toSignal(this.todoLists.lists$().pipe(map((all) => all.filter(isShopping))));
  private readonly savedId = toSignal(this.todoLists.recipeListId$());
  private readonly houses = toSignal(this.households.households$(), { initialValue: [] });
  private readonly picked = signal<string | null>(null);
  protected readonly ready = computed(() => this.lists() !== undefined && this.savedId() !== undefined);
  /** The list you picked, else your recipe list, else the household's shopping list, else any. */
  protected readonly target = computed(() => {
    const all = this.lists() ?? [];
    const id = this.picked() ?? this.savedId();
    return all.find((l) => l.id === id) ?? all.find((l) => l.householdId) ?? all.at(0);
  });

  constructor() {
    addIcons({ basket, chevronDown, close });
    try {
      const data = JSON.parse(inject(ActivatedRoute).snapshot.fragment ?? '');
      this.recipe = clip(data.recipe);
      this.rows.set(
        (Array.isArray(data.items) ? data.items : [])
          .slice(0, 100)
          .map((i: Record<string, unknown>) => toRow(clip(i?.['name']), clip(i?.['quantity']), i?.['category']))
          .filter((r: Row) => r.name),
      );
    } catch {
      this.fail('אין מצרכים בקישור הזה.');
      return;
    }
    if (!this.rows().length) {
      this.fail('אין מצרכים בקישור הזה.');
    }
  }

  protected count(): number {
    return this.rows().filter((r) => r.name.trim()).length;
  }

  protected remove(row: Row): void {
    this.rows.update((rows) => rows.filter((r) => r !== row));
  }

  protected home(): void {
    void this.router.navigateByUrl('/home', { replaceUrl: true });
  }

  protected async pickList(): Promise<void> {
    const current = this.target()?.id;
    const sheet = await this.actionSheet.create({
      header: 'לאיזו רשימה יתווספו מצרכים ממתכונים?',
      subHeader: 'הבחירה תישמר להבא',
      buttons: [
        ...(this.lists() ?? []).map((l) => ({
          // A trailing mark: an icon would push this name out of line with the others.
          text: listLabel(l, this.houses()) + (l.id === current ? '  ✓' : ''),
          data: l.id,
        })),
        { text: 'ביטול', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<string>();
    if (data) {
      this.picked.set(data);
    }
  }

  protected async run(): Promise<void> {
    this.busy.set(true);
    try {
      const listId = this.target()?.id ?? (await this.createShoppingList());
      // Wherever recipes went last time is where they go next time.
      if (listId !== this.savedId()) {
        void this.todoLists.setRecipeList(listId).catch(() => undefined);
      }
      const list = (await firstValueFrom(
        this.todoLists.list$(listId).pipe(filter((l) => !!l?.createdAt)),
      )) as TodoList;
      // Same names as lines already on the list are offered for joining there.
      for (const row of this.rows()) {
        const name = row.name.trim();
        if (!name) continue;
        const amount = row.amount.trim();
        // Writes are not awaited: offline they resolve only once synced, and the
        // local cache already shows them on the list.
        void this.todoLists
          .createItem(listId, this.todoLists.newItemId(listId), {
            name,
            description: amount ? [amount, row.unit && UNIT_LABELS[row.unit]].filter(Boolean).join(' ') : row.note,
            category: row.category,
            state: false,
            date: Date.now(),
            listCreatedAt: list.createdAt,
          })
          .catch(() => undefined);
        void this.todoLists.recordHistory(listId, list.createdAt, name, row.category).catch(() => undefined);
      }
      await this.router.navigateByUrl(`/details/${listId}`, { replaceUrl: true });
    } catch {
      this.busy.set(false);
      this.fail('לא הצלחנו להוסיף את המצרכים. נסו שוב.');
    }
  }

  // No shopping list at all: make one in your first household (or a personal one).
  private async createShoppingList(): Promise<string> {
    const [household] = await firstValueFrom(this.households.households$());
    return this.todoLists.createList(SHOPPING_LIST, 'shopping', household ?? null);
  }

  private fail(message: string): void {
    this.error.set(message);
  }
}

// The fragment comes from a link anyone could craft: keep only short strings.
function clip(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function toRow(name: string, quantity: string, category: unknown): Row {
  const amount = parseAmount(quantity);
  return {
    name,
    amount: amount ? String(Math.round(amount.value * 100) / 100) : '',
    unit: amount?.unit ?? '',
    note: amount ? '' : quantity,
    category: (CATEGORIES as readonly string[]).includes(category as string) ? (category as string) : 'Other',
  };
}
