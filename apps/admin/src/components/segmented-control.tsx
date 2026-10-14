import { type KeyboardEvent, useRef } from 'react';
import { cn } from '@/lib/utils';

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  const group = useRef<HTMLDivElement>(null);
  const select = (index: number) => {
    const option = options[(index + options.length) % options.length];
    if (!option) return;
    onChange(option.value);
    group.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [options.indexOf(option)]?.focus();
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') select(index + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') select(index - 1);
    else return;
    event.preventDefault();
  };
  return (
    <div
      ref={group}
      role="radiogroup"
      aria-label={label}
      className="bg-muted inline-flex rounded-md p-0.5"
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'focus-visible:ring-ring/50 rounded-sm px-3 py-1 text-sm font-medium outline-none focus-visible:ring-[3px]',
              checked ? 'bg-background shadow-xs' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
