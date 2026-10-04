import { isDevMode } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  PreloadAllModules,
  provideRouter,
  RouteReuseStrategy,
  withPreloading,
  withRouterConfig,
} from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { Capacitor } from '@capacitor/core';
import { IonicRouteStrategy, provideIonicAngular } from '@ionic/angular';
import { defineCustomElements } from '@ionic/pwa-elements/loader';
import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';
import { provideFirebase } from './app/core';

bootstrapApplication(AppComponent, {
  providers: [
    provideIonicAngular(),
    // Angular's default strategy reuses a page when only its route params change.
    { provide: RouteReuseStrategy, useClass: IonicRouteStrategy },
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withRouterConfig({ onSameUrlNavigation: 'reload' }),
    ),
    provideFirebase(),
    // Web only: in the Android app the updater swaps bundles itself, and a
    // service worker caching the old one would fight it.
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !Capacitor.isNativePlatform(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
}).catch((error: unknown) => console.error(error));

// Gives @capacitor/camera a camera and file picker when running in a browser.
void defineCustomElements(window);
