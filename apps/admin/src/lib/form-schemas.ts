import { z } from 'zod';

export const requiredText = (max: number) =>
  z.string().trim().min(1, 'validation.required').max(max, 'validation.max');

export const requiredNumber = () => z.number({ error: 'validation.required' });

export const integerIn = (min: number, max: number) =>
  requiredNumber().int('validation.integer').min(min, 'validation.min').max(max, 'validation.max');

export function numberInput(inner: z.ZodNumber) {
  return inner.nullable().transform((value, ctx) => {
    if (value !== null) return value;
    ctx.addIssue({ code: 'custom', message: 'validation.required' });
    return z.NEVER;
  });
}

export const timeOfDay = () => z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.time');

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export const requiredDate = () =>
  z.string().min(1, 'validation.required').regex(ISO_DATE, 'validation.date');

export const optionalDate = () =>
  z.string().refine((value) => value === '' || ISO_DATE.test(value), 'validation.date');

export const optionalText = (max: number) => z.string().trim().max(max, 'validation.max');

export const requiredId = () =>
  z
    .string()
    .nullable()
    .refine((value) => !!value, { message: 'validation.required' });

const E164 = /^\+[1-9]\d{6,14}$/;

/** An E.164 phone number (`+4915550000000`) or an empty field. */
export const optionalPhone = () =>
  z
    .string()
    .trim()
    .refine((value) => value === '' || E164.test(value), 'validation.phone');

/** An `https://` address of at most `max` characters, or an empty field. */
export const optionalHttpsUrl = (max: number) =>
  z
    .string()
    .trim()
    .max(max, 'validation.max')
    .refine(
      (value) => value === '' || (/^https:\/\//.test(value) && URL.canParse(value)),
      'validation.httpsUrl',
    );

/** Turns an empty optional text field into `null` for the API. */
export const emptyToNull = (value: string): string | null => value.trim() || null;
