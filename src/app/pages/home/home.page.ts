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
import { add, basket, create, exit, home, lockClosed, people, personAdd, trash } from 'ionicons/icons';
import { AuthService, HouseholdService, InviteService, TodoListService } from '../../core';
import { CustomAlert, Household, SHOPPING_LIST, TodoList } from '../../models';
import { DateCreatedPipe } from '../../pipes';
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
    DateCreatedPipe,
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
  protected readonly households = toSignal(this.householdService.households$(), {
    initialValue: [],
  });
  protected readonly searchBarHidden = signal(true);
  protected readonly search = signal('');

  // Personal lists first, then one section per household, each sorted by name.
  protected readonly sections = computed<Section[]>(() => {
    const term = this.search().trim().toLowerCase();
    const lists = (this.lists() ?? [])
      .filter((l) => l.name.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
    const households = [...this.households()].sort((a, b) => a.name.localeCompare(b.name));
    const known = new Set(households.map((h) => h.id));
    const sections: Section[] = [
      {
        id: '',
        title: 'Personal',
        icon: 'lock-closed',
        lists: lists.filter((l) => !l.householdId),
      },
      {
        // Filed under someone else's household and shared with you directly.
        id: 'shared',
        title: 'Shared with you',
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
    addIcons({ add, basket, create, exit, home, lockClosed, people, personAdd, trash });
  }

  protected toggleSearchBar(): void {
    this.searchBarHidden.update((hidden) => !hidden);
  }

  protected isShopping(list: TodoList): boolean {
    return list.name === SHOPPING_LIST;
  }

  protected goToDetails(todoList: TodoList): void {
    void this.router.navigate(['/details', todoList.id]);
  }

  protected invite(todoList: TodoList): void {
    this.invites
      .share('list', todoList.id, todoList.name)
      .catch(() => this.alert.presentToast('Could not create the invite'));
  }

  protected addList(): void {
    const alert: CustomAlert = {
      title: 'New list',
      message: `Name it "${SHOPPING_LIST}" to get grocery categories and recipe imports.`,
      inputs: [{ name: 'name', placeholder: 'e.g. Weekend chores' }],
      noText: 'Cancel',
      yesText: 'Next',
      yesToastCatch: 'Something wrong happened',
      yesFunction: async (data) => {
        const name = (data?.['name'] ?? '').trim();
        if (!name) {
          return;
        }
        const household = await this.pickHousehold();
        if (household === undefined) {
          return;
        }
        const id = await this.todoListService.createList(name, household);
        await this.router.navigate(['/details', id]);
      },
    };
    void this.alert.createAlert(alert);
  }

  /** null = personal, undefined = cancelled. Skips the question when there is no household. */
  private async pickHousehold(): Promise<Household | null | undefined> {
    const households = this.households();
    if (!households.length) {
      return null;
    }
    const sheet = await this.actionSheet.create({
      header: 'Who should see this list?',
      buttons: [
        ...households.map((h) => ({ text: `Household: ${h.name}`, data: h })),
        { text: 'Only me (personal)', data: null },
        { text: 'Cancel', role: 'cancel' },
      ],
    });
    await sheet.present();
    const { data, role } = await sheet.onDidDismiss<Household | null>();
    return role === 'cancel' || role === 'backdrop' ? undefined : (data ?? null);
  }

  protected deleteList(todoList: TodoList): void {
    void this.alert.createAlert({
      title: 'Delete list?',
      message: `"${todoList.name}" and everything on it will be removed for everyone.`,
      noText: 'Cancel',
      yesText: 'Delete',
      yesToastThen: 'List deleted',
      yesToastCatch: 'Something wrong happened',
      yesFunction: () => this.todoListService.deleteList(todoList.id),
    });
  }

  protected leaveList(todoList: TodoList): void {
    void this.alert.createAlert({
      title: 'Leave list?',
      message: `You will no longer see "${todoList.name}".`,
      noText: 'Cancel',
      yesText: 'Leave',
      yesToastThen: 'You left the list',
      yesToastCatch: 'You can only leave lists you joined directly',
      yesFunction: () => this.todoListService.leaveList(todoList.id),
    });
  }

  protected renameList(todoList: TodoList): void {
    void this.alert.createAlert({
      title: 'Rename list',
      inputs: [{ name: 'name', value: todoList.name }],
      noText: 'Cancel',
      yesText: 'Save',
      yesToastThen: 'List renamed',
      yesToastCatch: 'Something wrong happened',
      yesFunction: (data) =>
        this.todoListService.renameList(todoList.id, (data?.['name'] ?? '').trim() || todoList.name),
    });
  }
}
