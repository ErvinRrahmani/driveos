import { Redirect } from 'expo-router';
import { resolveDestination } from '../src/lib/route-group';
import { useAuthState } from '../src/lib/session';
import { LoadingState } from '../src/ui';

export default function Index() {
  const destination = resolveDestination(useAuthState());
  if (destination === null) return <LoadingState />;
  return <Redirect href={destination} />;
}
