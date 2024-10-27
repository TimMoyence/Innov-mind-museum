import { Routes } from '@angular/router';
import { TabsPage } from './tabs.page';

export const routes: Routes = [
  {
    path: 'museum-IA',
    component: TabsPage,
    children: [
      {
        path: 'text',
        loadComponent: () =>
          import('../views/iamuseum/iamuseum.component'),
      },
    ],
  },
  {
    path: '',
    redirectTo: '/museum-IA/text',
    pathMatch: 'full',
  },
];
