import {
  ApplicationConfig,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { sessionInitializer } from './core/initializers/session.initializer';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideIonicAngular({
      mode: 'md',
      backButtonText: 'Indietro',
    }),
    // L'ordine conta: authInterceptor inietta il token,
    // errorInterceptor intercetta il 401 che ne puo' derivare.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    // Deve stare PRIMA di provideRouter: ripristina la sessione
    // mentre il router e' ancora fermo.
    provideAppInitializer(sessionInitializer),
    provideRouter(routes),
  ],
};
