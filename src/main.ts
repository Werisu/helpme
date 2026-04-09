import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt';
import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

/* pt.js = português com BRL; registramos como pt-BR para os pipes no template */
registerLocaleData(localePt, 'pt-BR');

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
