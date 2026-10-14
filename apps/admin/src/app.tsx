import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { I18nextProvider } from 'react-i18next';
import { Toaster } from '@/components/ui/sonner';
import { i18n } from './i18n';
import type { AppServices } from './lib/services';
import type { AppRouter } from './router';

export function App({ router, services }: { router: AppRouter; services: AppServices }) {
  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={services.queryClient}>
        <RouterProvider router={router} />
        <Toaster position="top-right" />
      </QueryClientProvider>
    </I18nextProvider>
  );
}
