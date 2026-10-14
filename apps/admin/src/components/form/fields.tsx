import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { useFormContext } from './context';
import { useFieldUi } from './use-field-ui';

interface BaseFieldProps {
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

function FieldMessages({
  id,
  messages,
  description,
  descriptionId,
}: {
  id: string;
  messages: string[];
  description?: string;
  descriptionId: string;
}) {
  return (
    <>
      {description && (
        <p id={descriptionId} className="text-muted-foreground text-xs">
          {description}
        </p>
      )}
      {messages.length > 0 && (
        <div id={id} className="text-destructive space-y-0.5 text-sm">
          {messages.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
    </>
  );
}

function describedBy(
  ui: { invalid: boolean; errorId: string; descriptionId: string },
  description?: string,
) {
  const ids = [description ? ui.descriptionId : null, ui.invalid ? ui.errorId : null].filter(
    Boolean,
  );
  return ids.length ? ids.join(' ') : undefined;
}

export function TextField({
  label,
  description,
  disabled,
  className,
  type = 'text',
  autoComplete,
  placeholder,
  inputMode,
}: BaseFieldProps & {
  type?: 'text' | 'email' | 'tel';
  autoComplete?: string;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'tel';
}) {
  const ui = useFieldUi<string | null>();
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={ui.id}>{label}</Label>
      <Input
        id={ui.id}
        name={ui.field.name}
        type={type}
        value={ui.field.state.value ?? ''}
        onChange={(event) => ui.change(event.target.value)}
        onBlur={ui.field.handleBlur}
        autoComplete={autoComplete}
        placeholder={placeholder}
        inputMode={inputMode}
        disabled={disabled}
        aria-invalid={ui.invalid}
        aria-describedby={describedBy(ui, description)}
      />
      <FieldMessages {...ui} id={ui.errorId} description={description} />
    </div>
  );
}

export function TextAreaField({
  label,
  description,
  disabled,
  className,
  rows = 3,
  submitOnModEnter = false,
}: BaseFieldProps & { rows?: number; submitOnModEnter?: boolean }) {
  const ui = useFieldUi<string>();
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={ui.id}>{label}</Label>
      <textarea
        id={ui.id}
        name={ui.field.name}
        rows={rows}
        value={ui.field.state.value}
        onChange={(event) => ui.change(event.target.value)}
        onBlur={ui.field.handleBlur}
        onKeyDown={(event) => {
          if (submitOnModEnter && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }
        }}
        disabled={disabled}
        aria-invalid={ui.invalid}
        aria-describedby={describedBy(ui, description)}
        className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
      />
      <FieldMessages {...ui} id={ui.errorId} description={description} />
    </div>
  );
}

export function NumberField({
  label,
  description,
  disabled,
  className,
  step,
  min,
  max,
}: BaseFieldProps & { step?: number; min?: number; max?: number }) {
  const ui = useFieldUi<number | null>();
  const value = ui.field.state.value;
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={ui.id}>{label}</Label>
      <Input
        id={ui.id}
        name={ui.field.name}
        type="number"
        inputMode="decimal"
        step={step}
        min={min}
        max={max}
        value={value === null || Number.isNaN(value) ? '' : value}
        onChange={(event) =>
          ui.change(event.target.value === '' ? null : event.target.valueAsNumber)
        }
        onBlur={ui.field.handleBlur}
        disabled={disabled}
        aria-invalid={ui.invalid}
        aria-describedby={describedBy(ui, description)}
      />
      <FieldMessages {...ui} id={ui.errorId} description={description} />
    </div>
  );
}

export function TimeField(props: BaseFieldProps) {
  return <NativeInputField {...props} type="time" />;
}

function NativeInputField({
  label,
  description,
  disabled,
  className,
  type,
  min,
  max,
}: BaseFieldProps & { type: 'time' | 'date' | 'datetime-local'; min?: string; max?: string }) {
  const ui = useFieldUi<string>();
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={ui.id}>{label}</Label>
      <Input
        id={ui.id}
        name={ui.field.name}
        type={type}
        min={min}
        max={max}
        value={ui.field.state.value}
        onChange={(event) => ui.change(event.target.value)}
        onBlur={ui.field.handleBlur}
        disabled={disabled}
        aria-invalid={ui.invalid}
        aria-describedby={describedBy(ui, description)}
      />
      <FieldMessages {...ui} id={ui.errorId} description={description} />
    </div>
  );
}

export function DateField(props: BaseFieldProps & { min?: string; max?: string }) {
  return <NativeInputField {...props} type="date" />;
}

export function DateTimeField(props: BaseFieldProps) {
  return <NativeInputField {...props} type="datetime-local" />;
}

export function CheckboxField({ label, description, disabled, className }: BaseFieldProps) {
  const ui = useFieldUi<boolean>();
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <div className="flex items-start gap-2">
        <Checkbox
          id={ui.id}
          name={ui.field.name}
          checked={ui.field.state.value}
          onCheckedChange={(checked) => ui.change(checked === true)}
          onBlur={ui.field.handleBlur}
          disabled={disabled}
          aria-invalid={ui.invalid}
          aria-describedby={describedBy(ui, description)}
        />
        <Label htmlFor={ui.id} className="leading-4">
          {label}
        </Label>
      </div>
      <FieldMessages {...ui} id={ui.errorId} description={description} />
    </div>
  );
}

export function ErrorList() {
  const ui = useFieldUi<unknown>();
  return ui.messages.length > 0 ? (
    <div className="text-destructive space-y-0.5 text-sm">
      {ui.messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
    </div>
  ) : null;
}

export interface SelectOption {
  value: string;
  label: string;
}

export function SelectField({
  label,
  description,
  disabled,
  className,
  options,
  emptyLabel,
}: BaseFieldProps & { options: readonly SelectOption[]; emptyLabel?: string }) {
  const ui = useFieldUi<string | null>();
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <Label htmlFor={ui.id}>{label}</Label>
      <NativeSelect
        id={ui.id}
        name={ui.field.name}
        value={ui.field.state.value ?? ''}
        onChange={(event) =>
          ui.change(
            event.target.value === '' && emptyLabel !== undefined ? null : event.target.value,
          )
        }
        onBlur={ui.field.handleBlur}
        disabled={disabled}
        aria-invalid={ui.invalid}
        aria-describedby={describedBy(ui, description)}
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
      <FieldMessages {...ui} id={ui.errorId} description={description} />
    </div>
  );
}

export function SwitchField({ label, description, disabled, className }: BaseFieldProps) {
  const ui = useFieldUi<boolean>();
  return (
    <div className={cn('grid content-start gap-2', className)}>
      <div className="flex items-center justify-between gap-4">
        <Label htmlFor={ui.id}>{label}</Label>
        <Switch
          id={ui.id}
          name={ui.field.name}
          checked={ui.field.state.value}
          onCheckedChange={(checked) => ui.change(checked)}
          onBlur={ui.field.handleBlur}
          disabled={disabled}
          aria-invalid={ui.invalid}
          aria-describedby={describedBy(ui, description)}
        />
      </div>
      <FieldMessages {...ui} id={ui.errorId} description={description} />
    </div>
  );
}

export function CheckboxGroupField({
  label,
  description,
  disabled,
  className,
  options,
}: BaseFieldProps & { options: readonly SelectOption[] }) {
  const ui = useFieldUi<string[]>();
  const selected = ui.field.state.value;
  const toggle = (value: string, checked: boolean) =>
    ui.change(checked ? [...selected, value] : selected.filter((item) => item !== value));
  return (
    <fieldset
      className={cn('grid content-start gap-2', className)}
      aria-invalid={ui.invalid}
      aria-describedby={describedBy(ui, description)}
    >
      <legend className="mb-2 text-sm font-medium">{label}</legend>
      <div className="flex flex-wrap gap-4">
        {options.map((option) => {
          const optionId = `${ui.id}-${option.value}`;
          return (
            <div key={option.value} className="flex items-center gap-2">
              <Checkbox
                id={optionId}
                checked={selected.includes(option.value)}
                onCheckedChange={(checked) => toggle(option.value, checked === true)}
                disabled={disabled}
              />
              <Label htmlFor={optionId} className="font-normal">
                {option.label}
              </Label>
            </div>
          );
        })}
      </div>
      <FieldMessages {...ui} id={ui.errorId} description={description} />
    </fieldset>
  );
}

export function SubmitButton({ label, children }: { label: string; children?: ReactNode }) {
  const form = useFormContext();
  const { t } = useTranslation();
  return (
    <form.Subscribe selector={(state) => state.isSubmitting}>
      {(isSubmitting) => (
        <Button type="submit" disabled={isSubmitting}>
          {children}
          {isSubmitting ? t('common.saving') : label}
        </Button>
      )}
    </form.Subscribe>
  );
}
