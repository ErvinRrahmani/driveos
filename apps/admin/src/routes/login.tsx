import { createFileRoute, redirect } from '@tanstack/react-router';
import { z } from 'zod';
import { LoginFlow } from '@/components/login/login-flow';
import { safeRedirect } from '@/lib/redirect';

const loginSearchSchema = z.object({
  redirect: z.string().max(2000).optional().catch(undefined),
});

export const Route = createFileRoute('/login')({
  validateSearch: (search) => loginSearchSchema.parse(search),
  beforeLoad: ({ context, search }) => {
    if (context.auth.isAuthenticated()) throw redirect({ href: safeRedirect(search.redirect) });
  },
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  return <LoginFlow redirectTo={safeRedirect(search.redirect)} />;
}
