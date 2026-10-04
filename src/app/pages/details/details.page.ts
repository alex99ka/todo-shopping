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
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonListHeader,
  IonThumbnail,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import { addIcons } from 'ionicons';
import { add, alarm, calendar, ellipsisVertical, flag, trash } from 'ionicons/icons';
import { firstValueFrom, of, shareReplay, switchMap } from 'rxjs';
import {
  AuthService,
  HouseholdService,
  InviteService,
  PhotoService,
  TodoListService,
} from '../../core';
import { CATEGORIES, CATEGORY_LABELS, Household, Item, TodoList, isShopping } from '../../models';
import { AlertService, EmptyListComponent } from '../../shared';
import { ItemDetailsModalComponent } from '../item-details/item-details.modal';

@Component({
  selector: 'app-details',
  templateUrl: './details.page.html',
  styleUrl: './details.page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    IonBackButton,
    IonButton,
    IonButtons,
    IonCheckbox,
    IonContent,
    IonFab,
    IonFabButton,
    IonHeader,
    IonIcon,
    IonItem,
    IonItemOption,
    IonItemOptions,
    IonItemSliding,
    IonLabel,
    IonList,
    IonListHeader,
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

  private readonly photoUrls = signal<Record<string, string>>({});
  private readonly loadingPhotos = new Set<string>();
  private destroyed = false;

  constructor() {
    addIcons({ add, alarm, calendar, ellipsisVertical, flag, trash });
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
    this.removeItem(item).catch(() => this.alert.presentToast('משהו השתבש'));
  }

  protected overdue(item: Item): boolean {
    return !item.state && !!item.dueAt && item.dueAt < startOfDay(Date.now());
  }

  protected dueText(item: Item): string {
    if (!item.dueAt || item.state) {
      return '';
    }
    const days = Math.round((startOfDay(item.dueAt) - startOfDay(Date.now())) / DAY);
    if (days === 0) return 'היום';
    if (days === 1) return 'מחר';
    if (days === -1) return 'אתמול';
    return new Date(item.dueAt).toLocaleDateString('he-IL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });
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
    const done = this.items().filter((i) => i.state);
    const sheet = await this.actionSheet.create({
      header: list.name,
      buttons: [
        { text: 'הזמנת אנשים לרשימה', data: 'invite' },
        ...(owner ? [{ text: 'העברה למשק בית…', data: 'move' }] : []),
        ...(done.length ? [{ text: `ניקוי ${done.length} שסומנו`, data: 'clear' }] : []),
        ...(!owner && list.memberUids.includes(this.uid ?? '')
          ? [{ text: 'עזיבת הרשימה', role: 'destructive', data: 'leave' }]
          : []),
        { text: 'ביטול', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data } = await sheet.onDidDismiss<string>();
    try {
      if (data === 'invite') {
        await this.invites.share('list', list.id, list.name);
      } else if (data === 'move') {
        await this.moveToHousehold(list);
      } else if (data === 'clear') {
        // Not awaited, so it also works offline: the local cache drops them at once.
        done.forEach((i) => this.deleteItem(i));
      } else if (data === 'leave') {
        await this.todoListService.leaveList(list.id);
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      }
    } catch {
      await this.alert.presentToast('משהו השתבש');
    }
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

  // The item goes first: a failed photo delete then leaves an unreferenced object,
  // not a visible item whose photo is missing.
  private async removeItem(item: Item): Promise<void> {
    await this.todoListService.deleteItem(this.listId, item.id);
    if (item.photoPath) {
      await this.photos.removeQuietly(item.photoPath);
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
    await modal.onDidDismiss();
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
