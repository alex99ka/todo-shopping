import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  ActionSheetController,
  IonContent,
  IonFab,
  IonFabButton,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonNote,
  IonSearchbar,
  IonSpinner,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  basket,
  checkboxOutline,
  create,
  exit,
  home,
  lockClosed,
  people,
  personAdd,
  trash,
} from 'ionicons/icons';
import { catchError, combineLatest, firstValueFrom, map, of, switchMap } from 'rxjs';
import { AuthService, HouseholdService, InviteService, TodoListService } from '../../core';
import { Household, Item, ListKind, SHOPPING_LIST, TodoList, isShopping } from '../../models';

interface Summary {
  open: number;
  overdue: number;
  today: number;
  total: number;
}

const DAY = 24 * 60 * 60 * 1000;
const SEEDED_KEY = 'starter-lists-created';
import { AlertService, EmptyListComponent, NavBarComponent } from '../../shared';

interface Section {
  id: string;
  title: string;
  icon: string;
  lists: TodoList[];
}

@Component({
  selector: 'app-home',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.page.html',
  styleUrl: './home.page.scss',
  imports: [
    FormsModule,
    IonContent,
    IonFab,
    IonFabButton,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonListHeader,
    IonNote,
    IonSearchbar,
    IonSpinner,
    NavBarComponent,
    EmptyListComponent,
  ],
})
export class HomePage {
  private readonly router = inject(Router);
  private readonly todoListService = inject(TodoListService);
  private readonly householdService = inject(HouseholdService);
  private readonly invites = inject(InviteService);
  private readonly alert = inject(AlertService);
  private readonly actionSheet = inject(ActionSheetController);

  protected readonly uid = inject(AuthService).uid;
  protected readonly lists = toSignal(this.todoListService.lists$());
  /** What is waiting in each list, so the home screen answers "anything to do?". */
  protected readonly summaries = toSignal(
    this.todoListService.lists$().pipe(
      switchMap((lists) => {
        const ready = lists.filter((l) => l.createdAt);
        return ready.length
          ? combineLatest(
              ready.map((l) =>
                this.todoListService.items$(l.id, l.createdAt).pipe(
                  map((items) => [l.id, summarize(items)] as const),
                  catchError(() => of([l.id, null] as const)),
                ),
              ),
            )
          : of([]);
      }),
      map((pairs) => Object.fromEntries(pairs) as Record<string, Summary | null>),
    ),
    { initialValue: {} as Record<string, Summary | null> },
  );
  protected readonly households = toSignal(this.householdService.households$(), {
    initialValue: [],
  });
  protected readonly searchBarHidden = signal(true);
  protected readonly search = signal('');

  // Personal lists first, then one section per household, each sorted by name.
  protected readonly sections = computed<Section[]>(() => {
    const term = this.search().trim().toLowerCase();
    // Shopping lists first, then tasks, each by name.
    const lists = (this.lists() ?? [])
      .filter((l) => l.name.toLowerCase().includes(term))
      .sort(
        (a, b) => Number(isShopping(b)) - Number(isShopping(a)) || a.name.localeCompare(b.name, 'he'),
      );
    const households = [...this.households()].sort((a, b) => a.name.localeCompare(b.name, 'he'));
    const known = new Set(households.map((h) => h.id));
    const sections: Section[] = [
      {
        id: '',
        title: 'אישי',
        icon: 'lock-closed',
        lists: lists.filter((l) => !l.householdId),
      },
      {
        // Filed under someone else's household and shared with you directly.
        id: 'shared',
        title: 'שותפו איתך',
        icon: 'people',
        lists: lists.filter((l) => l.householdId && !known.has(l.householdId)),
      },
      ...households.map((h) => ({
        id: h.id,
        title: h.name,
        icon: 'home',
        lists: lists.filter((l) => l.householdId === h.id),
      })),
    ];
    return sections.filter((s) => s.lists.length);
  });

  constructor() {
    addIcons({ add, basket, checkboxOutline, create, exit, home, lockClosed, people, personAdd, trash });
    void this.createStarterLists();
  }

  protected summaryText(list: TodoList): { text: string; late: boolean } {
    const s = this.summaries()[list.id];
    if (!s) return { text: isShopping(list) ? 'קניות' : 'משימות', late: false };
    if (!s.total) return { text: 'ריקה', late: false };
    if (isShopping(list)) {
      return { text: s.open ? `${s.open} לקנות` : 'הכול בסל', late: false };
    }
    const parts = [s.overdue && `${s.overdue} באיחור`, s.today && `${s.today} היום`].filter(Boolean);
    if (parts.length) return { text: parts.join(' · '), late: s.overdue > 0 };
    return { text: s.open ? `${s.open} פתוחות` : 'הכול בוצע', late: false };
  }

  /**
   * A new user starts with a shopping list and a task list instead of an empty
   * screen. Only when the server confirms there is nothing (the local cache can be
   * empty on a new device) and you are in no household, and only once per device.
   */
  private async createStarterLists(): Promise<void> {
    try {
      if (localStorage.getItem(SEEDED_KEY)) return;
    } catch {
      return;
    }
    if (!navigator.onLine) return;
    try {
      const [none, households] = await Promise.all([
        this.todoListService.hasNoListsOnServer(),
        firstValueFrom(this.householdService.households$()),
      ]);
      localStorage.setItem(SEEDED_KEY, '1');
      if (none && !households.length) {
        await this.todoListService.createList(SHOPPING_LIST, 'shopping');
        await this.todoListService.createList('משימות', 'todo');
      }
    } catch {
      return;
    }
  }

  protected toggleSearchBar(): void {
    this.searchBarHidden.update((hidden) => !hidden);
  }

  protected readonly isShopping = isShopping;

  protected goToDetails(todoList: TodoList): void {
    void this.router.navigate(['/details', todoList.id]);
  }

  protected invite(todoList: TodoList): void {
    this.invites
      .share('list', todoList.id, todoList.name)
      .catch(() => this.alert.presentToast('לא הצלחנו ליצור הזמנה'));
  }

  protected async addList(): Promise<void> {
    const sheet = await this.actionSheet.create({
      header: 'איזו רשימה?',
      buttons: [
        { text: 'רשימת קניות — לפי מחלקות בסופר', icon: 'basket', data: 'shopping' },
        { text: 'רשימת משימות — עם תאריכי יעד ותזכורות', icon: 'checkbox-outline', data: 'todo' },
        { text: 'ביטול', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data: kind } = await sheet.onDidDismiss<ListKind>();
    if (kind !== 'shopping' && kind !== 'todo') {
      return;
    }
    const shopping = kind === 'shopping';
    void this.alert.createAlert({
      title: shopping ? 'רשימת קניות חדשה' : 'רשימת משימות חדשה',
      inputs: [
        shopping
          ? { name: 'name', value: SHOPPING_LIST }
          : { name: 'name', placeholder: 'למשל: סידורים לסופ״ש' },
      ],
      yesText: 'המשך',
      yesToastCatch: 'משהו השתבש',
      yesFunction: async (data) => {
        const name = (data?.['name'] ?? '').trim();
        if (!name) {
          return;
        }
        const household = await this.pickHousehold();
        if (household === undefined) {
          return;
        }
        const id = await this.todoListService.createList(name, kind, household);
        await this.router.navigate(['/details', id]);
      },
    });
  }

  /** null = personal, undefined = cancelled. Skips the question when there is no household. */
  private async pickHousehold(): Promise<Household | null | undefined> {
    const households = this.households();
    if (!households.length) {
      return null;
    }
    const sheet = await this.actionSheet.create({
      header: 'מי יראה את הרשימה?',
      buttons: [
        ...households.map((h) => ({ text: `משק הבית: ${h.name}`, data: h })),
        { text: 'רק אני (אישי)', data: null },
        { text: 'ביטול', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data, role } = await sheet.onDidDismiss<Household | null>();
    return role === 'cancel' || role === 'backdrop' ? undefined : (data ?? null);
  }

  protected deleteList(todoList: TodoList): void {
    void this.alert.createAlert({
      title: 'למחוק את הרשימה?',
      message: `"${todoList.name}" וכל מה שבה יימחקו אצל כולם.`,
      yesText: 'מחיקה',
      yesToastThen: 'הרשימה נמחקה',
      yesToastCatch: 'משהו השתבש',
      yesFunction: () => this.todoListService.deleteList(todoList.id),
    });
  }

  protected leaveList(todoList: TodoList): void {
    void this.alert.createAlert({
      title: 'לעזוב את הרשימה?',
      message: `לא תראו יותר את "${todoList.name}".`,
      yesText: 'עזיבה',
      yesToastThen: 'עזבת את הרשימה',
      yesToastCatch: 'אפשר לעזוב רק רשימה שהצטרפת אליה ישירות',
      yesFunction: () => this.todoListService.leaveList(todoList.id),
    });
  }

  protected renameList(todoList: TodoList): void {
    void this.alert.createAlert({
      title: 'שינוי שם',
      inputs: [{ name: 'name', value: todoList.name }],
      yesText: 'שמירה',
      yesToastThen: 'השם שונה',
      yesToastCatch: 'משהו השתבש',
      yesFunction: (data) =>
        this.todoListService.renameList(todoList.id, (data?.['name'] ?? '').trim() || todoList.name),
    });
  }
}

function summarize(items: Item[]): Summary {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime();
  const open = items.filter((i) => !i.state);
  return {
    total: items.length,
    open: open.length,
    overdue: open.filter((i) => i.dueAt && i.dueAt < start).length,
    today: open.filter((i) => i.dueAt && i.dueAt >= start && i.dueAt < start + DAY).length,
  };
}
