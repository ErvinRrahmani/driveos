import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import type { Contact } from '../domain/contact.js';
import { normalizeContact } from '../domain/contact.js';
import type { AuthErrorCode } from '../domain/errors.js';
import { StatusCodes } from 'http-status-codes';

const STATUS: Record<AuthErrorCode, StatusCodes> = {
  invalid_code: StatusCodes.UNAUTHORIZED,
  code_expired: StatusCodes.UNAUTHORIZED,
  no_account: StatusCodes.FORBIDDEN,
  invalid_refresh_token: StatusCodes.UNAUTHORIZED,
  refresh_reused: StatusCodes.UNAUTHORIZED,
};

export function authError(code: AuthErrorCode): ApiError {
  return new ApiError(STATUS[code], code, t(`errors.${code}`));
}

export function contactOrThrow(raw: string): Contact {
  const contact = normalizeContact(raw);
  if (!contact) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
      issues: [{ path: ['contact'], message: 'Expected an E.164 phone number or an email' }],
    });
  }
  return contact;
}
