import {
  EnvironmentProviders,
  InjectionToken,
  makeEnvironmentProviders,
} from '@angular/core';
import { FirebaseApp, initializeApp } from 'firebase/app';
import { Auth, getAuth } from 'firebase/auth';
import {
  Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';
import { FirebaseStorage, getStorage } from 'firebase/storage';
import { environment } from '../../environments/environment';

export const FIREBASE_APP = new InjectionToken<FirebaseApp>('firebase.app');
export const FIREBASE_AUTH = new InjectionToken<Auth>('firebase.auth');
export const FIRESTORE = new InjectionToken<Firestore>('firebase.firestore');
export const FIREBASE_STORAGE = new InjectionToken<FirebaseStorage>('firebase.storage');

export function provideFirebase(): EnvironmentProviders {
  return makeEnvironmentProviders([
    {
      provide: FIREBASE_APP,
      useFactory: () => initializeApp(environment.firebase),
    },
    {
      provide: FIREBASE_AUTH,
      useFactory: (app: FirebaseApp) => getAuth(app),
      deps: [FIREBASE_APP],
    },
    {
      provide: FIRESTORE,
      // Cached on disk (IndexedDB): lists open and edits queue while offline,
      // and sync when the connection comes back.
      useFactory: (app: FirebaseApp) =>
        initializeFirestore(app, {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        }),
      deps: [FIREBASE_APP],
    },
    {
      provide: FIREBASE_STORAGE,
      useFactory: (app: FirebaseApp) => getStorage(app),
      deps: [FIREBASE_APP],
    },
  ]);
}
