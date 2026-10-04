import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { map, take } from 'rxjs';
import { AuthService } from './auth.service';

// Carries the requested URL (fragment included) through sign-in, so an invite
// or a recipe import link still lands where it pointed.
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.user$.pipe(
    take(1),
    map((user) =>
      user ? true : router.createUrlTree(['/auth'], { queryParams: { next: state.url } }),
    ),
  );
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.user$.pipe(
    take(1),
    map((user) => (user ? router.createUrlTree(['/home']) : true)),
  );
};
