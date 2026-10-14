import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative w-full">
      <select
        data-slot="native-select"
        className={cn(
          'border-input flex h-9 w-full appearance-none rounded-md border bg-transparent py-1 pr-8 pl-3 text-base shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
          'aria-invalid:ring-destructive/20 aria-invalid:border-destructive',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export { NativeSelect };
