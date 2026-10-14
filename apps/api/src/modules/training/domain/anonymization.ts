export const ANONYMIZED_STUDENT_NAME = 'Anonymized student';
export const ANONYMIZED_BIRTH_DATE = '1900-01-01';

export interface AnonymizedStudentFields {
  userId: null;
  fullName: string;
  dateOfBirth: string;
  testDate: null;
  area: null;
  pickupAddress: null;
  pickupLat: null;
  pickupLng: null;
  status: 'anonymized';
}

export function anonymizedStudentFields(): AnonymizedStudentFields {
  return {
    userId: null,
    fullName: ANONYMIZED_STUDENT_NAME,
    dateOfBirth: ANONYMIZED_BIRTH_DATE,
    testDate: null,
    area: null,
    pickupAddress: null,
    pickupLat: null,
    pickupLng: null,
    status: 'anonymized',
  };
}
