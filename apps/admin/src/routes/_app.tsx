import { createFileRoute, redirect } from '@tanstack/react-router';
import { AppShell } from '@/components/app-shell';

export const Route = createFileRoute('/_app')({
  beforeLoad: ({ context, location }) => {
    if (!context.auth.isAuthenticated()) {
      throw redirect({ to: '/login', search: { redirect: location.href } });
    }
  },
  component: AppShell,
});
