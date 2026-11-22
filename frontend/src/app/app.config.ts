import {
  ApplicationConfig,
  LOCALE_ID,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeIt from '@angular/common/locales/it';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideIonicAngular } from '@ionic/angular/standalone';

import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { sessionInitializer } from './core/initializers/session.initializer';

// Date e numeri all'italiana nei template: "domenica 15 novembre", "62,5".
registerLocaleData(localeIt);

export const appConfig: ApplicationConfig = {
  providers: [
    { provide: LOCALE_ID, useValue: 'it' },
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
