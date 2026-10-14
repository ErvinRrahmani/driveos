import { createFileRoute, notFound, useRouter } from '@tanstack/react-router';
import { StatusCodes } from 'http-status-codes';
import {
  PublicPage,
  PublicPageFailure,
  PublicPageLoading,
  PublicPageNotFound,
} from '@/components/public-page/public-page';

/** Statuses the API answers for a slug that has no published page (or is not a valid slug). */
const NO_PAGE: readonly number[] = [StatusCodes.NOT_FOUND, StatusCodes.BAD_REQUEST];

/** The school's public enrolment page. Outside `_app`: no session, and no bearer token is sent. */
export const Route = createFileRoute('/s/$slug')({
  loader: async ({ context, params }) => {
    const { data, response } = await context.publicApi.fetchClient.GET(
      '/v1/public/schools/{slug}',
      { params: { path: { slug: params.slug } } },
    );
    if (NO_PAGE.includes(response.status)) throw notFound();
    if (!data) throw new Error(`Public page request failed with ${response.status}`);
    return data;
  },
  component: PublicSchoolRoute,
  pendingComponent: PublicPageLoading,
  notFoundComponent: PublicPageNotFound,
  errorComponent: PublicSchoolError,
});

function PublicSchoolRoute() {
  return <PublicPage page={Route.useLoaderData()} />;
}

function PublicSchoolError() {
  const router = useRouter();
  return <PublicPageFailure onRetry={() => void router.invalidate()} />;
}
