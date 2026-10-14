import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';

export function chatReadOnly(): ApiError {
  return new ApiError(StatusCodes.FORBIDDEN, 'chat_read_only', t('errors.chat_read_only'));
}

export function forbidden(): ApiError {
  return new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'));
}
