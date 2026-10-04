import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'home' },
  {
    path: 'auth',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/auth.page').then((m) => m.AuthPage),
  },
  {
    path: 'home',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/home/home.page').then((m) => m.HomePage),
  },
  {
    path: 'details/:listId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/details/details.page').then((m) => m.DetailsPage),
  },
  {
    path: 'households',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/households/households.page').then((m) => m.HouseholdsPage),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
  },
  {
    path: 'join/:inviteId',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/join/join.page').then((m) => m.JoinPage),
  },
  {
    // The recipe book's "add to shopping list" button lands here.
    path: 'import',
    canActivate: [authGuard],
    loadComponent: () => import('./pages/import/import.page').then((m) => m.ImportPage),
  },
  { path: '**', redirectTo: 'home' },
];
