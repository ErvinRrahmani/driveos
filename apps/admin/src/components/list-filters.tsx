import { type ReactNode, useEffect, useEffectEvent, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useStudentOptions } from '@/hooks/use-scheduling-options';

export function FilterBar({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-4">{children}</div>;
}

export function SelectFilter({
  label,
  value,
  allLabel,
  options,
  onChange,
  className = 'w-48',
}: {
  label: string;
  value: string | undefined;
  allLabel: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string | undefined) => void;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={`grid gap-2 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      <NativeSelect
        id={id}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function StudentFilter({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const students = useStudentOptions('');
  return (
    <SelectFilter
      label={t('filters.student')}
      allLabel={t('filters.allStudents')}
      value={value}
      options={students.options}
      onChange={onChange}
      className="w-56"
    />
  );
}

export function DateRangeFilter({
  from,
  to,
  onChange,
}: {
  from: string | undefined;
  to: string | undefined;
  onChange: (patch: { from?: string | undefined; to?: string | undefined }) => void;
}) {
  const { t } = useTranslation();
  const fromId = useId();
  const toId = useId();
  const invalid = from !== undefined && to !== undefined && from > to;
  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={fromId}>{t('filters.from')}</Label>
        <Input
          id={fromId}
          type="date"
          className="w-40"
          value={from ?? ''}
          max={to}
          aria-invalid={invalid}
          onChange={(event) => onChange({ from: event.target.value || undefined })}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={toId}>{t('filters.to')}</Label>
        <Input
          id={toId}
          type="date"
          className="w-40"
          value={to ?? ''}
          min={from}
          aria-invalid={invalid}
          onChange={(event) => onChange({ to: event.target.value || undefined })}
        />
      </div>
      {invalid && (
        <p role="alert" className="text-destructive basis-full text-sm">
          {t('filters.rangeInvalid')}
        </p>
      )}
    </>
  );
}

const TEXT_DEBOUNCE_MS = 300;

export function TextFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  const [text, setText] = useState(value ?? '');
  const commit = useEffectEvent((next: string | undefined) => onChange(next));
  useEffect(() => {
    const next = text.trim() || undefined;
    if (next === value) return;
    const timer = setTimeout(() => commit(next), TEXT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, value]);
  return (
    <div className="grid w-56 gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={text} onChange={(event) => setText(event.target.value)} />
    </div>
  );
}

export function MonthFilter({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
}) {
  const id = useId();
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="month"
        className="w-44"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value || undefined)}
      />
    </div>
  );
}
