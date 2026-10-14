import { StatusCodes } from 'http-status-codes';
import { ApiError } from '../../../kernel/http/api-error.js';
import { ConflictError } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';

export function forbidden(): ApiError {
  return new ApiError(StatusCodes.FORBIDDEN, 'forbidden', t('errors.forbidden'));
}

export function alreadySigned(): ConflictError {
  return new ConflictError('already_signed', t('errors.already_signed'));
}

export function templateInactive(): ConflictError {
  return new ConflictError('contract_template_inactive', t('errors.contract_template_inactive'));
}

export function uploadIncomplete(): ConflictError {
  return new ConflictError('upload_incomplete', t('errors.upload_incomplete'));
}

export function documentNotReady(): ConflictError {
  return new ConflictError('document_not_ready', t('errors.document_not_ready'));
}
