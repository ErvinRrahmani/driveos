import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { StatusCodes } from 'http-status-codes';

export type IdentityErrorCode =
  | 'invitation_expired'
  | 'invitation_used'
  | 'membership_disabled'
  | 'contact_conflict'
  | 'owner_required'
  | 'last_owner';

const STATUS: Record<IdentityErrorCode, StatusCodes> = {
  invitation_expired: StatusCodes.GONE,
  invitation_used: StatusCodes.CONFLICT,
  membership_disabled: StatusCodes.CONFLICT,
  contact_conflict: StatusCodes.CONFLICT,
  owner_required: StatusCodes.FORBIDDEN,
  last_owner: StatusCodes.CONFLICT,
};

export function identityError(code: IdentityErrorCode): ApiError {
  return new ApiError(STATUS[code], code, t(`errors.${code}`));
}

export function invalidField(path: (string | number)[], message: string): ApiError {
  return new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
    issues: [{ path, message }],
  });
}
