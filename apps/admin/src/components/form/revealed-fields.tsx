import type { ReactNode } from 'react';

/**
 * Fields shown only in some states (guardian fields for a minor). They stay mounted and use the
 * `hidden` attribute instead of conditional rendering: under StrictMode, fields mounted after a
 * form-level validator has run never receive its errors. Hidden inputs are neither focusable nor
 * announced.
 */
export function RevealedFields({
  shown,
  className,
  children,
}: {
  shown: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div hidden={!shown} className={className}>
      {children}
    </div>
  );
}
