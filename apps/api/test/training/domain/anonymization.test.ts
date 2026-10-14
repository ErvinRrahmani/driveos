import { describe, expect, it } from 'vitest';
import {
  ANONYMIZED_BIRTH_DATE,
  ANONYMIZED_STUDENT_NAME,
  anonymizedStudentFields,
} from '../../../src/modules/training/domain/anonymization.js';

describe('anonymizedStudentFields', () => {
  it('clears name, date of birth, addresses, test date and the user link and marks the student anonymized', () => {
    expect(anonymizedStudentFields()).toEqual({
      userId: null,
      fullName: ANONYMIZED_STUDENT_NAME,
      dateOfBirth: ANONYMIZED_BIRTH_DATE,
      testDate: null,
      area: null,
      pickupAddress: null,
      pickupLat: null,
      pickupLng: null,
      status: 'anonymized',
    });
  });

  it('uses a fixed, obviously fake birth date because the column is not null', () => {
    expect(ANONYMIZED_BIRTH_DATE).toBe('1900-01-01');
    expect(ANONYMIZED_STUDENT_NAME).toBe('Anonymized student');
  });
});
