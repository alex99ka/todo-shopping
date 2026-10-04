import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  IonButton,
  IonButtons,
  IonCheckbox,
  IonCol,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonItem,
  IonRow,
  IonSelect,
  IonSelectOption,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ModalController,
} from '@ionic/angular';
import type { Timestamp } from 'firebase/firestore';
import { addIcons } from 'ionicons';
import { camera, close, image as imageIcon, mic } from 'ionicons/icons';
import { PhotoService, TodoListService } from '../../core';
import {
  CATEGORIES,
  CATEGORY_LABELS,
  Item,
  ItemChanges,
  PRIORITY_LABELS,
  Priority,
  newItem,
} from '../../models';
import { AlertService, MediaService, SpeechService } from '../../shared';

type VoiceField = 'name' | 'description';

@Component({
  selector: 'app-item-details-modal',
  templateUrl: './item-details.modal.html',
  styleUrl: './item-details.modal.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IonButton,
    IonButtons,
    IonCheckbox,
    IonCol,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonItem,
    IonRow,
    IonSelect,
    IonSelectOption,
    IonTextarea,
    IonTitle,
    IonToolbar,
  ],
})
export class ItemDetailsModalComponent implements OnInit {
  /** Assigned by ModalController through componentProps, so these stay plain fields. */
  listId = '';
  listCreatedAt?: Timestamp;
  item?: Item;
  shopping = false;

  protected readonly categories = CATEGORIES;
  protected readonly categoryLabels = CATEGORY_LABELS;
  protected readonly priorities = Object.entries(PRIORITY_LABELS) as [Priority, string][];
  protected readonly category = signal('Other');
  protected readonly priority = signal<Priority>('normal');
  /** 'YYYY-MM-DD', as <input type="date"> wants it. */
  protected readonly dueAt = signal('');
  /** 'YYYY-MM-DDTHH:mm' in local time, as <input type="datetime-local"> wants it. */
  protected readonly remindAt = signal('');

  protected readonly name = signal('');
  protected readonly description = signal('');
  protected readonly state = signal(false);
  protected readonly pendingPhoto = signal('');
  protected readonly existingPhoto = signal('');
  protected readonly image = computed(() => this.pendingPhoto() || this.existingPhoto());

  private date = 0;
  private itemId = '';

  private readonly modalCtrl = inject(ModalController);
  private readonly todoLists = inject(TodoListService);
  private readonly photos = inject(PhotoService);
  private readonly alert = inject(AlertService);
  private readonly media = inject(MediaService);
  private readonly speech = inject(SpeechService);

  constructor() {
    addIcons({ camera, close, image: imageIcon, mic });
    inject(DestroyRef).onDestroy(() => {
      const url = this.existingPhoto();
      if (url) {
        URL.revokeObjectURL(url);
      }
    });
  }

  ngOnInit(): void {
    const seed = this.item ?? newItem();
    this.name.set(seed.name);
    this.description.set(seed.description);
    this.state.set(seed.state);
    this.category.set(this.item?.category ?? 'Other');
    this.remindAt.set(this.item?.remindAt ? toLocalInput(this.item.remindAt) : '');
    this.dueAt.set(this.item?.dueAt ? toLocalInput(this.item.dueAt).slice(0, 10) : '');
    this.priority.set(this.item?.priority ?? 'normal');
    this.date = seed.date;
    this.itemId = this.item?.id ?? this.todoLists.newItemId(this.listId);
    const path = this.item?.photoPath;
    if (path) {
      void this.photos.objectUrl(path).then((url) => this.existingPhoto.set(url));
    }
  }

  protected async addItem(): Promise<void> {
    await this.save(null, this.shopping ? 'נוסף' : 'המשימה נוספה');
  }

  protected async updateItem(): Promise<void> {
    if (this.item) {
      await this.save(this.item, 'נשמר');
    }
  }

  protected async takePicture(): Promise<void> {
    const picture = await this.media.takePicture();
    if (picture) {
      this.pendingPhoto.set(picture);
    }
  }

  protected async pickFromLibrary(): Promise<void> {
    const picture = await this.media.pickFromLibrary();
    if (picture) {
      this.pendingPhoto.set(picture);
    }
  }

  protected async inputVoice(field: VoiceField): Promise<void> {
    if (!(await this.speech.isReady())) {
      await this.alert.presentToast('הקלטה קולית זמינה רק באפליקציה');
      return;
    }
    const text = await this.speech.listen();
    if (!text) {
      return;
    }
    if (field === 'name') {
      this.name.set(text);
    } else {
      this.description.set(text);
    }
  }

  protected async dismiss(changed: boolean): Promise<void> {
    await this.modalCtrl.dismiss(changed);
  }

  // Firestore and Storage share no transaction: upload to a fresh object, write the
  // item once, and remove the new object if that write fails.
  private async save(existing: Item | null, successToast: string): Promise<void> {
    const listCreatedAt = this.listCreatedAt;
    if (!listCreatedAt) {
      // A list created offline gets its server timestamp only once it syncs.
      await this.alert.presentToast('הרשימה עוד לא סונכרנה. נסו שוב כשיש חיבור.');
      return;
    }
    const changes: ItemChanges = {
      name: this.name(),
      state: this.state(),
      description: this.description(),
      // A new item is dated when saved, not when this editor opened: the notifier
      // finds new items by date, so a stale one could slip under its cursor.
      date: existing ? this.date : Date.now(),
      ...(this.shopping && { category: this.category() }),
    };
    if (!this.shopping) {
      // 'YYYY-MM-DD' alone parses as UTC; with a time it is local midnight.
      changes.dueAt = this.dueAt() ? new Date(`${this.dueAt()}T00:00`).getTime() : null;
      changes.priority = this.priority();
      const at = this.remindAt() ? new Date(this.remindAt()).getTime() : null;
      // Only touch the reminder when it changed, so editing the text of an item
      // whose reminder already fired does not fire it again.
      if (at !== (existing?.remindAt ?? null)) {
        changes.remindAt = at;
        changes.reminded = false;
      }
    }
    const pending = this.pendingPhoto();
    if (!pending) {
      // No upload: write without waiting for the server, so saving works offline
      // (Firestore keeps the write and syncs it later).
      const write = existing
        ? this.todoLists.updateItem(this.listId, existing.id, changes)
        : this.todoLists.createItem(this.listId, this.itemId, { ...changes, listCreatedAt });
      write.catch(() => this.alert.presentToast('השמירה נכשלה'));
      await this.alert.presentToast(successToast);
      await this.dismiss(true);
      return;
    }
    let uploaded: string | undefined;
    try {
      if (pending) {
        uploaded = await this.photos.upload(this.listId, listCreatedAt, this.itemId, pending);
        changes.photoPath = uploaded;
      }
      if (existing) {
        await this.todoLists.updateItem(this.listId, existing.id, changes);
      } else {
        await this.todoLists.createItem(this.listId, this.itemId, { ...changes, listCreatedAt });
      }
    } catch {
      if (uploaded) {
        await this.photos.removeQuietly(uploaded);
      }
      await this.alert.presentToast('משהו השתבש');
      return;
    }
    if (uploaded && existing?.photoPath) {
      await this.photos.removeQuietly(existing.photoPath);
    }
    await this.alert.presentToast(successToast);
    await this.dismiss(true);
  }
}

function toLocalInput(ms: number): string {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
}
