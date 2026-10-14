import { ConflictError } from '../../../kernel/http/errors.js';
import { t } from '../../../kernel/i18n/i18n.js';

export function studentNotActive(): ConflictError {
  return new ConflictError('student_not_active', t('errors.student_not_active'));
}
