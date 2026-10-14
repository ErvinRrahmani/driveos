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

export function featureNotInPlan(): ApiError {
  return new ApiError(
    StatusCodes.FORBIDDEN,
    'feature_not_in_plan',
    t('errors.feature_not_in_plan'),
  );
}
