import type { LessonType } from '@driveos/shared';
import { ApiError } from '../../../kernel/http/api-error.js';
import { t } from '../../../kernel/i18n/i18n.js';
import { type LessonTypeRules, lessonTypeIssues } from '../domain/lesson-type.js';
import type { lessonTypes } from './schema.js';
import { StatusCodes } from 'http-status-codes';

export function toLessonType(row: typeof lessonTypes.$inferSelect): LessonType {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    licenceClass: row.licenceClass,
    minutes: row.minutes,
    creditMinutes: row.creditMinutes,
    requiresVehicle: row.requiresVehicle,
    requiresEntitlement: row.requiresEntitlement,
    active: row.active,
  };
}

export function assertLessonTypeRules(type: LessonTypeRules): void {
  const issues = lessonTypeIssues(type);
  if (issues.length > 0) {
    throw new ApiError(StatusCodes.BAD_REQUEST, 'validation_error', t('errors.validation'), {
      issues,
    });
  }
}
