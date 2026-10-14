import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';

export function studentNotActive(): ConflictError {
  return new ConflictError('student_not_active', t('errors.student_not_active'));
}

export function leadAlreadyConverted(): ConflictError {
  return new ConflictError('lead_already_converted', t('errors.lead_already_converted'));
}

/** The lead changed since the client loaded it (`PATCH /v1/leads/{id}` with `version`). */
export function leadVersionConflict(serverVersion: number): ConflictError {
  return new ConflictError('version_conflict', t('errors.lead_version_conflict'), {
    serverVersion,
  });
}

export function featureNotInPlan(): ApiError {
  return new ApiError(
    StatusCodes.FORBIDDEN,
    'feature_not_in_plan',
    t('errors.feature_not_in_plan'),
  );
}
