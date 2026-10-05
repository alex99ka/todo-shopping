import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import {
  ActionSheetController,
  IonBackButton,
  IonButton,
  IonButtons,
  IonCheckbox,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonProgressBar,
  IonThumbnail,
  IonTitle,
  IonToolbar,
  ModalController,
  ToastController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import {
  add,
  alarm,
  basket,
  calendar,
  checkboxOutline,
  ellipsisHorizontal,
  ellipsisVertical,
  flag,
  send,
  trash,
} from 'ionicons/icons';
import { firstValueFrom, of, shareReplay, switchMap } from 'rxjs';
import {
  AuthService,
  HouseholdService,
  InviteService,
  PhotoService,
  TodoListService,
} from '../../core';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  Household,
  Item,
  TodoList,
  guessAisle,
  isShopping,
} from '../../models';
import { AlertService, EmptyListComponent } from '../../shared';
import { ItemDetailsModalComponent } from '../item-details/item-details.modal';

@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrl: './details.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonBackButton,
    IonButton,
    IonButtons,
    IonCheckbox,
    IonContent,
    IonFab,
    IonFabButton,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonListHeader,
    IonProgressBar,
    IonThumbnail,
    IonTitle,
    IonToolbar,
    EmptyListComponent,
  ],
})
export class DetailsPage {
  private readonly todoListService = inject(TodoListService);
  private readonly photos = inject(PhotoService);
  private readonly alert = inject(AlertService);
  private readonly modalCtrl = inject(ModalController);
  private readonly toastCtrl = inject(ToastController);
  private readonly actionSheet = inject(ActionSheetController);
  private readonly households = inject(HouseholdService);
  private readonly invites = inject(InviteService);
  private readonly router = inject(Router);
  private readonly uid = inject(AuthService).uid;

  private readonly listId = inject(ActivatedRoute).snapshot.paramMap.get('listId') ?? '';
  private readonly list$ = this.todoListService
    .list$(this.listId)
    .pipe(shareReplay({ bufferSize: 1, refCount: true }));

  protected readonly todoList = toSignal(this.list$, { initialValue: null });
  protected readonly items = toSignal(
    this.list$.pipe(
      switchMap((list) =>
        list ? this.todoListService.items$(this.listId, list.createdAt) : of<Item[]>([]),
      ),
    ),
    { initialValue: [] },
  );

  protected readonly shopping = computed(() => {
    const list = this.todoList();
    return !!list && isShopping(list);
  });

  protected readonly remaining = computed(() => this.items().filter((i) => !i.state).length);
  protected readonly progress = computed(() => {
    const total = this.items().length;
    return total ? (total - this.remaining()) / total : 0;
  });

  // Shopping: what is still to buy in aisle order, then everything already in
  // the basket. Tasks: by deadline (overdue, today, later, none), then done.
  protected readonly groups = computed(() => {
    const items = this.items();
    const open = items.filter((i) => !i.state);
    const done = items.filter((i) => i.state);
    const groups: { key: string; title: string; items: Item[] }[] = [];
    if (this.shopping()) {
      const aisle = (i: Item) =>
        (CATEGORIES as readonly string[]).includes(i.category ?? '') ? i.category : 'Other';
      for (const category of CATEGORIES) {
        const inAisle = open.filter((i) => aisle(i) === category);
        groups.push({ key: category, title: CATEGORY_LABELS[category], items: byName(inAisle) });
      }
      groups.push({ key: 'done', title: 'בסל', items: byName(done) });
    } else {
      const today = startOfDay(Date.now());
      const tomorrow = today + DAY;
      const due = (i: Item) => i.dueAt ?? Infinity;
      const sorted = [...open].sort((a, b) => due(a) - due(b) || rank(a) - rank(b) || a.date - b.date);
      groups.push(
        { key: 'overdue', title: 'באיחור', items: sorted.filter((i) => due(i) < today) },
        { key: 'today', title: 'היום', items: sorted.filter((i) => due(i) >= today && due(i) < tomorrow) },
        { key: 'later', title: 'בהמשך', items: sorted.filter((i) => i.dueAt && due(i) >= tomorrow) },
        { key: 'none', title: 'ללא תאריך יעד', items: sorted.filter((i) => !i.dueAt) },
        { key: 'done', title: 'בוצעו', items: [...done].sort((a, b) => b.date - a.date) },
      );
    }
    return groups.filter((g) => g.items.length);
  });

  protected readonly quickName = signal('');

  private readonly photoUrls = signal<Record<string, string>>({});
  private readonly loadingPhotos = new Set<string>();
  private destroyed = false;

  constructor() {
    addIcons({
      add,
      alarm,
      basket,
      calendar,
      checkboxOutline,
      ellipsisHorizontal,
      ellipsisVertical,
      flag,
      send,
      trash,
    });
    effect(() => {
      const wanted = this.photoPaths(this.items());
      untracked(() => this.syncPhotos(wanted));
    });
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      Object.values(this.photoUrls()).forEach((url) => URL.revokeObjectURL(url));
    });
  }

  protected photoUrl(item: Item): string | undefined {
    return item.photoPath ? this.photoUrls()[item.photoPath] : undefined;
  }

  protected addItem(): void {
    void this.openItemModal();
  }

  protected updateItem(item: Item): void {
    void this.openItemModal(item);
  }

  protected toggleItem(item: Item): void {
    const { name, description, date } = item;
    void this.todoListService.updateItem(this.listId, item.id, {
      name,
      description,
      date,
      state: !item.state,
    });
  }

  protected deleteItem(item: Item): void {
    void this.removeItems([item], `"${item.name}" נמחק`);
  }

  /**
   * Type and press Enter: no editor. A shopping item lands in the aisle it had the
   * last time, else the one its name suggests; the toast says which.
   */
  protected quickAdd(): void {
    const name = this.quickName().trim();
    const list = this.todoList();
    if (!name || !list?.createdAt) {
      return;
    }
    const same = this.items().find((i) => i.name.trim() === name && i.category);
    const category = this.shopping() ? (same?.category ?? guessAisle(name)) : undefined;
    void this.todoListService
      .createItem(this.listId, this.todoListService.newItemId(this.listId), {
        name,
        state: false,
        description: '',
        date: Date.now(),
        listCreatedAt: list.createdAt,
        ...(category && { category }),
      })
      .catch(() => this.alert.presentToast('ההוספה נכשלה'));
    this.quickName.set('');
    if (category) {
      void this.toast(`נוסף ל"${CATEGORY_LABELS[category] ?? category}"`, 1500);
    }
  }

  /** The ⋯ on a section heading: tick off, put back or empty the whole section. */
  protected async groupMenu(group: { key: string; title: string; items: Item[] }): Promise<void> {
    const n = group.items.length;
    const done = group.key === 'done';
    const sheet = await this.actionSheet.create({
      header: `${group.title} · ${n}`,
      buttons: [
        done
          ? { text: 'החזרת הכול לרשימה', data: 'uncheck' }
          : { text: this.shopping() ? 'סימון הכול כנקנה' : 'סימון הכול כבוצע', data: 'check' },
        { text: n === 1 ? 'מחיקת הפריט' : `ריקון — מחיקת ${n} הפריטים`, role: 'destructive', data: 'empty' },
        { text: 'ביטול', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<string>();
    if (data === 'check' || data === 'uncheck') {
      void this.todoListService
        .setItemsState(this.listId, group.items, data === 'check')
        .catch(() => this.alert.presentToast('משהו השתבש'));
    } else if (data === 'empty') {
      void this.removeItems(group.items, `"${group.title}" רוקנה`);
    }
  }

  /**
   * Deletes at once and offers undo instead of asking first: quicker, and nothing is
   * lost. Photos go only once the undo window has passed.
   */
  private async removeItems(items: Item[], message: string): Promise<void> {
    if (!items.length) {
      return;
    }
    void this.todoListService
      .deleteItems(this.listId, items)
      .catch(() => this.alert.presentToast('המחיקה נכשלה'));
    const toast = await this.toastCtrl.create({
      message,
      duration: 5000,
      buttons: [{ text: 'ביטול', role: 'undo' }],
    });
    await toast.present();
    const { role } = await toast.onDidDismiss();
    if (role === 'undo') {
      void this.todoListService
        .restoreItems(this.listId, items)
        .catch(() => this.alert.presentToast('השחזור נכשל'));
    } else {
      items.forEach((i) => i.photoPath && void this.photos.removeQuietly(i.photoPath));
    }
  }

  private async toast(message: string, duration: number): Promise<void> {
    const toast = await this.toastCtrl.create({ message, duration });
    await toast.present();
  }

  /** Drives the deadline chip's colour; the chip's text says the same in words. */
  protected dueTone(item: Item): 'late' | 'today' | '' {
    const today = startOfDay(Date.now());
    if (!item.dueAt || item.state) return '';
    if (item.dueAt < today) return 'late';
    return item.dueAt < today + DAY ? 'today' : '';
  }

  protected dueText(item: Item): string {
    if (!item.dueAt || item.state) {
      return '';
    }
    const days = Math.round((startOfDay(item.dueAt) - startOfDay(Date.now())) / DAY);
    if (days === 0) return 'היום';
    if (days === 1) return 'מחר';
    if (days === -1) return 'אתמול';
    const date = new Date(item.dueAt).toLocaleDateString('he-IL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
    return days < 0 ? `באיחור · ${date}` : date;
  }

  protected reminderText(item: Item): string {
    if (!item.remindAt || item.state) {
      return '';
    }
    return new Date(item.remindAt).toLocaleString('he-IL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  protected async openMenu(): Promise<void> {
    const list = this.todoList();
    if (!list) {
      return;
    }
    const owner = list.ownerUid === this.uid;
    const all = this.items();
    const done = all.filter((i) => i.state);
    const sheet = await this.actionSheet.create({
      header: list.name,
      buttons: [
        { text: 'הזמנת אנשים לרשימה', data: 'invite' },
        ...(owner
          ? [
              { text: 'שינוי שם', data: 'rename' },
              { text: 'העברה למשק בית…', data: 'move' },
            ]
          : []),
        ...(done.length ? [{ text: `ניקוי ${done.length} שסומנו`, data: 'clear' }] : []),
        ...(all.length ? [{ text: 'ריקון הרשימה', role: 'destructive', data: 'empty' }] : []),
        ...(!owner && list.memberUids.includes(this.uid ?? '')
          ? [{ text: 'עזיבת הרשימה', role: 'destructive', data: 'leave' }]
          : []),
        ...(owner ? [{ text: 'מחיקת הרשימה', role: 'destructive', data: 'delete' }] : []),
        { text: 'ביטול', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<string>();
    try {
      if (data === 'invite') {
        await this.invites.share('list', list.id, list.name);
      } else if (data === 'rename') {
        this.renameList(list);
      } else if (data === 'delete') {
        this.deleteList(list);
      } else if (data === 'move') {
        await this.moveToHousehold(list);
      } else if (data === 'clear') {
        void this.removeItems(done, `${done.length} נוקו`);
      } else if (data === 'empty') {
        void this.removeItems(all, 'הרשימה רוקנה');
      } else if (data === 'leave') {
        await this.todoListService.leaveList(list.id);
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      }
    } catch {
      await this.alert.presentToast('משהו השתבש');
    }
  }

  // Swiping a list on the home screen does the same; these are the non-swipe way.
  private renameList(list: TodoList): void {
    void this.alert.createAlert({
      title: 'שינוי שם',
      inputs: [{ name: 'name', value: list.name }],
      yesText: 'שמירה',
      yesToastThen: 'השם שונה',
      yesToastCatch: 'משהו השתבש',
      yesFunction: (data) =>
        this.todoListService.renameList(list.id, (data?.['name'] ?? '').trim() || list.name),
    });
  }

  private deleteList(list: TodoList): void {
    void this.alert.createAlert({
      title: 'למחוק את הרשימה?',
      message: `"${list.name}" וכל מה שבה יימחקו אצל כולם.`,
      yesText: 'מחיקה',
      yesToastCatch: 'משהו השתבש',
      yesFunction: async () => {
        void this.todoListService.deleteList(list.id).catch(() => undefined);
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      },
    });
  }

  private async moveToHousehold(list: TodoList): Promise<void> {
    const households = await firstValueFrom(this.households.households$());
    const sheet = await this.actionSheet.create({
      header: 'מי יראה את הרשימה?',
      buttons: [
        ...households.map((h) => ({ text: `משק הבית: ${h.name}`, data: h })),
        { text: 'רק אני ומי שהוזמן', data: null },
        { text: 'ביטול', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data, role } = await sheet.onDidDismiss<Household | null>();
    if (role !== 'cancel' && role !== 'backdrop' && (data?.id ?? null) !== (list.householdId ?? null)) {
      await this.todoListService.setHousehold(list.id, data ?? null);
      await this.alert.presentToast('הרשימה הועברה');
    }
  }

  private photoPaths(items: Item[]): Set<string> {
    return new Set(items.flatMap((item) => (item.photoPath ? [item.photoPath] : [])));
  }

  private syncPhotos(wanted: Set<string>): void {
    const current = this.photoUrls();
    const stale = Object.keys(current).filter((path) => !wanted.has(path));
    if (stale.length > 0) {
      stale.forEach((path) => URL.revokeObjectURL(current[path]));
      this.photoUrls.set(
        Object.fromEntries(Object.entries(current).filter(([path]) => wanted.has(path))),
      );
    }
    for (const path of wanted) {
      if (!current[path] && !this.loadingPhotos.has(path)) {
        void this.loadPhoto(path);
      }
    }
  }

  private async loadPhoto(path: string): Promise<void> {
    this.loadingPhotos.add(path);
    try {
      const url = await this.photos.objectUrl(path);
      if (this.destroyed || !this.photoPaths(this.items()).has(path)) {
        URL.revokeObjectURL(url);
        return;
      }
      this.photoUrls.update((urls) => ({ ...urls, [path]: url }));
    } catch {
      return;
    } finally {
      this.loadingPhotos.delete(path);
    }
  }

  private async openItemModal(item?: Item): Promise<void> {
    const list: TodoList | null = this.todoList();
    if (!list) {
      return;
    }
    const modal = await this.modalCtrl.create({
      component: ItemDetailsModalComponent,
      componentProps: {
        listId: this.listId,
        listCreatedAt: list.createdAt,
        item,
        shopping: this.shopping(),
      },
    });
    await modal.present();
    // The editor's delete button hands back here, so it gets the same undo.
    const { role } = await modal.onDidDismiss();
    if (role === 'delete' && item) {
      this.deleteItem(item);
    }
  }
}

const DAY = 24 * 60 * 60 * 1000;
const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

function rank(item: Item): number {
  return PRIORITY_RANK[item.priority ?? 'normal'];
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function byName(items: Item[]): Item[] {
  return [...items].sort((a, b) => a.name.localeCompare(b.name, 'he'));
}
