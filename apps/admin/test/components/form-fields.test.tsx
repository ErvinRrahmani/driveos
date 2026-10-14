import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { applyServerErrors, useAppForm } from '../../src/components/form';
import { renderWithProviders } from '../support/providers';

const schema = z.object({
  name: z.string().trim().min(1, 'validation.required'),
  minutes: z.number({ error: 'validation.number' }).int().min(5, 'validation.min'),
  kind: z.enum(['lesson', 'exam']),
  opens: z.string().regex(/^\d{2}:\d{2}$/, 'validation.time'),
  active: z.boolean(),
});
type Values = z.input<typeof schema>;

function TestForm({
  onSubmit,
  serverError,
}: {
  onSubmit: (values: Values) => void;
  serverError?: unknown;
}) {
  const form = useAppForm({
    defaultValues: {
      name: '',
      minutes: 45,
      kind: 'lesson',
      opens: '08:00',
      active: true,
    } as Values,
    validators: { onChange: schema, onSubmit: schema },
    onSubmit: ({ value }) => {
      if (serverError) applyServerErrors(form, serverError);
      else onSubmit(value);
    },
  });
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppField name="name">{(field) => <field.TextField label="Name" />}</form.AppField>
      <form.AppField name="minutes">
        {(field) => <field.NumberField label="Minutes" />}
      </form.AppField>
      <form.AppField name="kind">
        {(field) => (
          <field.SelectField
            label="Kind"
            options={[
              { value: 'lesson', label: 'Lesson' },
              { value: 'exam', label: 'Exam' },
            ]}
          />
        )}
      </form.AppField>
      <form.AppField name="opens">{(field) => <field.TimeField label="Opens" />}</form.AppField>
      <form.AppField name="active">{(field) => <field.SwitchField label="Active" />}</form.AppField>
      <form.AppForm>
        <form.SubmitButton label="Save" />
      </form.AppForm>
    </form>
  );
}

describe('form field components', () => {
  it('shows translated inline errors from the zod schema and blocks submit', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TestForm onSubmit={onSubmit} />);
    const minutes = screen.getByLabelText('Minutes');
    await userEvent.clear(minutes);
    await userEvent.type(minutes, '3');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('This field is required.')).toBeTruthy();
    expect(screen.getByText('The value is too small.')).toBeTruthy();
    expect(screen.getByLabelText('Name').getAttribute('aria-invalid')).toBe('true');
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits typed values from every field kind', async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<TestForm onSubmit={onSubmit} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Night drive');
    await userEvent.clear(screen.getByLabelText('Minutes'));
    await userEvent.type(screen.getByLabelText('Minutes'), '90');
    await userEvent.selectOptions(screen.getByLabelText('Kind'), 'exam');
    await userEvent.clear(screen.getByLabelText('Opens'));
    await userEvent.type(screen.getByLabelText('Opens'), '09:30');
    await userEvent.click(screen.getByRole('switch', { name: 'Active' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Night drive',
      minutes: 90,
      kind: 'exam',
      opens: '09:30',
      active: false,
    });
  });

  it('shows 400 validation_error details inline next to the field', async () => {
    const serverError = {
      error: {
        code: 'validation_error',
        message: 'The request is invalid.',
        details: { issues: [{ path: ['name'], message: 'Name is already used' }] },
      },
    };
    renderWithProviders(<TestForm onSubmit={vi.fn()} serverError={serverError} />);
    await userEvent.type(screen.getByLabelText('Name'), 'Mitte');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Name is already used')).toBeTruthy();
    await userEvent.type(screen.getByLabelText('Name'), '2');
    expect(screen.queryByText('Name is already used')).toBeNull();
  });
});
