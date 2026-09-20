import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { roleGuard } from './core/guards/role.guard';
import {
  firstAccessGuard,
  requiresFirstAccessGuard,
} from './core/guards/first-access.guard';

export const routes: Routes = [
  {
    /*
     * Pagina di download, raggiungibile solo con il link diretto:
     * nessun menu vi rimanda. Serve finche' l'app non e' sul Play Store.
     *
     * Senza guardie: chi arriva qui non ha ancora l'app, quindi
     * non e' autenticato.
     */
    path: 'scarica',
    loadComponent: () =>
      import('./features/download/download.page').then((m) => m.DownloadPage),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'primo-accesso',
    canActivate: [authGuard, requiresFirstAccessGuard],
    loadComponent: () =>
      import('./features/auth/first-access/first-access.page').then(
        (m) => m.FirstAccessPage
      ),
  },
  {
    path: 'cliente',
    canActivate: [authGuard, firstAccessGuard, roleGuard('CLIENT')],
    loadComponent: () =>
      import('./features/client/tabs/client-tabs.page').then((m) => m.ClientTabsPage),
    children: [
      {
        path: 'home',
        loadComponent: () =>
          import('./features/client/home/home.page').then((m) => m.ClientHomePage),
      },
      {
        path: 'scheda',
        loadComponent: () =>
          import('./features/client/workout/workout.page').then(
            (m) => m.ClientWorkoutPage
          ),
      },
      {
        path: 'storico',
        loadComponent: () =>
          import('./features/client/history/history.page').then(
            (m) => m.ClientHistoryPage
          ),
      },
      {
        path: 'palestra',
        loadComponent: () =>
          import('./features/client/gym/gym.page').then((m) => m.ClientGymPage),
      },
      {
        path: 'profilo',
        loadComponent: () =>
          import('./features/client/profile/profile.page').then(
            (m) => m.ClientProfilePage
          ),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
    ],
  },
  {
    path: 'istruttore',
    canActivate: [authGuard, firstAccessGuard, roleGuard('TRAINER')],
    loadComponent: () =>
      import('./features/trainer/tabs/trainer-tabs.page').then(
        (m) => m.TrainerTabsPage
      ),
    children: [
      {
        path: 'home',
        loadComponent: () =>
          import('./features/trainer/home/home.page').then((m) => m.TrainerHomePage),
      },
      {
        path: 'clienti',
        loadComponent: () =>
          import('./features/trainer/clients/list/client-list.page').then(
            (m) => m.ClientListPage
          ),
      },
      {
        path: 'clienti/nuovo',
        loadComponent: () =>
          import('./features/trainer/clients/create/client-create.page').then(
            (m) => m.ClientCreatePage
          ),
      },
      {
        path: 'clienti/:id',
        loadComponent: () =>
          import('./features/trainer/clients/detail/client-detail.page').then(
            (m) => m.ClientDetailPage
          ),
      },
      {
        path: 'clienti/:id/schede',
        loadComponent: () =>
          import('./features/trainer/workouts/workout-list.page').then(
            (m) => m.WorkoutListPage
          ),
      },
      {
        path: 'palestra',
        loadComponent: () =>
          import('./features/trainer/gym/trainer-gym.page').then(
            (m) => m.TrainerGymPage
          ),
      },
      {
        path: 'profilo',
        loadComponent: () =>
          import('./features/trainer/profile/profile.page').then(
            (m) => m.TrainerProfilePage
          ),
      },
      {
        path: 'esercizi',
        loadComponent: () =>
          import('./features/trainer/exercises/exercise-list.page').then(
            (m) => m.ExerciseListPage
          ),
      },
      { path: '', redirectTo: 'home', pathMatch: 'full' },
      {
        path: 'schede-rapide',
        loadComponent: () =>
          import('./features/trainer/templates/template-list.page').then(
            (m) => m.TemplateListPage
          ),
      },
      {
        path: 'schede-rapide/nuova',
        loadComponent: () =>
          import('./features/trainer/workouts/workout-builder.page').then(
            (m) => m.WorkoutBuilderPage
          ),
      },
      {
        path: 'schede-rapide/:templateId/modifica',
        loadComponent: () =>
          import('./features/trainer/workouts/workout-builder.page').then(
            (m) => m.WorkoutBuilderPage
          ),
      },
      {
        path: 'schede/nuova/:clientId',
        loadComponent: () =>
          import('./features/trainer/workouts/workout-builder.page').then(
            (m) => m.WorkoutBuilderPage
          ),
      },
      {
        // Modifica di una scheda esistente. Il cliente viene ricavato dalla
        // scheda stessa: passarlo anche nell'indirizzo sarebbe ridondante
        // e permetterebbe combinazioni incoerenti.
        path: 'schede/:workoutId/modifica',
        loadComponent: () =>
          import('./features/trainer/workouts/workout-builder.page').then(
            (m) => m.WorkoutBuilderPage
          ),
      },
    ],
  },
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'login',
  },
  {
    path: '**',
    redirectTo: 'login',
  },
];
