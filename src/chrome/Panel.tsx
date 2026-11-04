import type { ComponentPropsWithRef } from 'react';
import { cn } from '@/lib/cn';

/** Floating surface for toolbars and controls over the canvas. */
export function Panel({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return (
    <div
      className={cn(
        'pointer-events-auto flex items-center gap-1 rounded-2xl border border-border bg-surface p-1 shadow-xl',
        className,
      )}
      {...props}
    />
  );
}

export const Divider = ({ className }: { className?: string }) => (
  <div className={cn('mx-1.5 h-6 w-px shrink-0 bg-border', className)} />
);

/**
 * One group of the top bar: a pill on a tonal surface with a hairline edge and no shadow, so the bar's presence
 * comes from its shape and the gaps between its groups.
 */
export function Capsule({ className, ...props }: ComponentPropsWithRef<'div'>) {
  return (
    <div
      className={cn(
        'pointer-events-auto flex h-12 items-center gap-0.5 rounded-full border border-border bg-surface-2 px-1.5',
        className,
      )}
      {...props}
    />
  );
}
