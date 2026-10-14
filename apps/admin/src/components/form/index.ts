import { type AnyFormApi, createFormHook } from '@tanstack/react-form';
import { toast } from 'sonner';
import { apiErrorMessage, fieldErrorsFrom } from '@/lib/api-errors';
import { fieldContext, formContext } from './context';
import {
  CheckboxField,
  CheckboxGroupField,
  DateField,
  DateTimeField,
  ErrorList,
  NumberField,
  SelectField,
  SubmitButton,
  SwitchField,
  TextAreaField,
  TextField,
  TimeField,
} from './fields';

export const { useAppForm, withForm, withFieldGroup } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: {
    TextField,
    TextAreaField,
    NumberField,
    TimeField,
    DateField,
    DateTimeField,
    SelectField,
    SwitchField,
    CheckboxGroupField,
    CheckboxField,
    ErrorList,
  },
  formComponents: { SubmitButton },
});

export function applyServerErrors(form: AnyFormApi, error: unknown): boolean {
  let applied = false;
  for (const [name, message] of Object.entries(fieldErrorsFrom(error))) {
    if (!(name in form.fieldInfo)) continue;
    form.setFieldMeta(name, (prev) => ({
      ...prev,
      isTouched: true,
      errorMap: { ...prev.errorMap, onServer: message },
    }));
    applied = true;
  }
  return applied;
}

export function reportSubmitError(form: AnyFormApi, error: unknown, fallback: string): void {
  if (!applyServerErrors(form, error)) toast.error(apiErrorMessage(error, fallback));
}

export { RevealedFields } from './revealed-fields';
export type { SelectOption } from './fields';
