export interface LessonTypeRules {
  kind: 'lesson' | 'exam';
  requiresEntitlement: 'exam_car' | null;
}

export interface FieldIssue {
  path: string[];
  message: string;
}

export function lessonTypeIssues(type: LessonTypeRules): FieldIssue[] {
  if (type.kind === 'exam' && type.requiresEntitlement !== 'exam_car') {
    return [
      {
        path: ['requiresEntitlement'],
        message: 'An exam lesson type requires the exam_car entitlement',
      },
    ];
  }
  return [];
}
