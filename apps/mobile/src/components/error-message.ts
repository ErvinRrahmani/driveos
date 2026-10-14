import type { TFunction } from 'i18next';
import { type ApiFailure, NETWORK_ERROR } from '../lib/api-errors';

export function errorMessage(t: TFunction, failure: ApiFailure): string {
  if (failure.code === NETWORK_ERROR) return t('errors.network');
  return failure.message ?? t('errors.generic');
}
