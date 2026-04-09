import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    loadChildren: () => import('@helpme/feature').then((m) => m.featureRoutes),
  },
];
