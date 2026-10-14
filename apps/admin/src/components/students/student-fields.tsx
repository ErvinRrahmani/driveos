import { useTranslation } from 'react-i18next';
import type { z } from 'zod';
import { withFieldGroup } from '@/components/form';
import { optionalDate, optionalText, requiredDate, requiredText } from '@/lib/form-schemas';

/** The student details both "New student" and "Convert to student" ask for. */
export const studentDetailsShape = {
  dateOfBirth: requiredDate(),
  examLanguage: requiredText(35),
  testDate: optionalDate(),
  area: optionalText(100),
  pickupAddress: optionalText(500),
};

export interface StudentDetailsValues {
  dateOfBirth: string;
  examLanguage: string;
  testDate: string;
  area: string;
  pickupAddress: string;
}

export const STUDENT_DETAILS_DEFAULTS: StudentDetailsValues = {
  dateOfBirth: '',
  examLanguage: 'en',
  testDate: '',
  area: '',
  pickupAddress: '',
};

/** Maps the group onto top-level form fields of the same name. */
export const STUDENT_DETAILS_FIELDS = {
  dateOfBirth: 'dateOfBirth',
  examLanguage: 'examLanguage',
  testDate: 'testDate',
  area: 'area',
  pickupAddress: 'pickupAddress',
} as const;

type StudentDetailsOutput = z.output<z.ZodObject<typeof studentDetailsShape>>;

/** The API body for the parsed details: empty optional fields are left out. */
export function studentDetailsBody(value: StudentDetailsOutput) {
  const { testDate, area, pickupAddress, dateOfBirth, examLanguage } = value;
  return {
    dateOfBirth,
    examLanguage,
    ...(testDate && { testDate }),
    ...(area && { area }),
    ...(pickupAddress && { pickupAddress }),
  };
}

export const StudentDetailsFields = withFieldGroup({
  defaultValues: STUDENT_DETAILS_DEFAULTS,
  render: function StudentDetailsFieldsRender({ group }) {
    const { t } = useTranslation();
    return (
      <>
        <div className="grid grid-cols-2 gap-4">
          <group.AppField name="dateOfBirth">
            {(field) => <field.DateField label={t('students.dateOfBirth')} />}
          </group.AppField>
          <group.AppField name="testDate">
            {(field) => <field.DateField label={t('students.testDate')} />}
          </group.AppField>
        </div>
        <group.AppField name="examLanguage">
          {(field) => <field.TextField label={t('students.examLanguage')} />}
        </group.AppField>
        <group.AppField name="area">
          {(field) => <field.TextField label={t('students.area')} />}
        </group.AppField>
        <group.AppField name="pickupAddress">
          {(field) => <field.TextField label={t('students.pickupAddress')} />}
        </group.AppField>
      </>
    );
  },
});
