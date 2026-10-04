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
import { add, alarm, ellipsisVertical, trash } from 'ionicons/icons';
import { firstValueFrom, of, shareReplay, switchMap } from 'rxjs';
import {
  AuthService,
  HouseholdService,
  InviteService,
  PhotoService,
  TodoListService,
} from '../../core';
import { CATEGORIES, Household, Item, SHOPPING_LIST, TodoList } from '../../models';
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

  protected readonly shopping = computed(() => this.todoList()?.name === SHOPPING_LIST);

  protected readonly remaining = computed(() => this.items().filter((i) => !i.state).length);

  // The shopping list reads in aisle order with what is still to buy on top;
  // any other list is one run, open tasks first, oldest first.
  protected readonly groups = computed(() => {
    const items = this.items();
    if (!this.shopping()) {
      const sorted = [...items].sort((a, b) => Number(a.state) - Number(b.state) || a.date - b.date);
      return sorted.length ? [{ category: '', items: sorted }] : [];
    }
    const order = (c?: string) => {
      const i = CATEGORIES.indexOf((c ?? 'Other') as (typeof CATEGORIES)[number]);
      return i < 0 ? CATEGORIES.length : i;
    };
    const sorted = [...items].sort(
      (a, b) => order(a.category) - order(b.category) || Number(a.state) - Number(b.state),
    );
    const groups: { category: string; items: Item[] }[] = [];
    for (const item of sorted) {
      const category = item.category ?? 'Other';
      const last = groups.at(-1);
      if (last?.category === category) {
        last.items.push(item);
      } else {
        groups.push({ category, items: [item] });
      }
    }
    return groups;
  });

  private readonly photoUrls = signal<Record<string, string>>({});
  private readonly loadingPhotos = new Set<string>();
  private destroyed = false;

  constructor() {
    addIcons({ add, alarm, ellipsisVertical, trash });
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
    this.removeItem(item).catch(() => this.alert.presentToast('Something wrong happened'));
  }

  protected reminderText(item: Item): string {
    if (!item.remindAt || item.state) {
      return '';
    }
    return new Date(item.remindAt).toLocaleString(undefined, {
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
        { text: 'Invite people to this list', data: 'invite' },
        ...(owner ? [{ text: 'Move to household…', data: 'move' }] : []),
        ...(done.length ? [{ text: `Clear ${done.length} checked`, data: 'clear' }] : []),
        ...(!owner && list.memberUids.includes(this.uid ?? '')
          ? [{ text: 'Leave list', role: 'destructive', data: 'leave' }]
          : []),
        { text: 'Cancel', role: 'cancel' },
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
        await Promise.all(done.map((i) => this.removeItem(i)));
      } else if (data === 'leave') {
        await this.todoListService.leaveList(list.id);
        await this.router.navigateByUrl('/home', { replaceUrl: true });
      }
    } catch {
      await this.alert.presentToast('Something wrong happened');
    }
  }

  private async moveToHousehold(list: TodoList): Promise<void> {
    const households = await firstValueFrom(this.households.households$());
    const sheet = await this.actionSheet.create({
      header: 'Who should see this list?',
      buttons: [
        ...households.map((h) => ({ text: `Household: ${h.name}`, data: h })),
        { text: 'Only me and invited people', data: null },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data, role } = await sheet.onDidDismiss<Household | null>();
    if (role !== 'cancel' && role !== 'backdrop' && (data?.id ?? null) !== (list.householdId ?? null)) {
      await this.todoListService.setHousehold(list.id, data ?? null);
      await this.alert.presentToast('List moved');
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
