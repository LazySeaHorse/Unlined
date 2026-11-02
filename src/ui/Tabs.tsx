import { Tabs as RadixTabs } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Inset between the list's edge and its triggers. */
const LIST_INSET = 'p-[3px]';
/** Trigger height: fill the list, minus 1px so the active border doesn't clip against the list's rounded edge. */
const TRIGGER_H = 'h-[calc(100%-1px)]';

export const Tabs = RadixTabs.Root;

export function TabsList({ className, ...props }: ComponentProps<typeof RadixTabs.List>) {
  return (
    <RadixTabs.List
      className={cn(
        'flex h-9 items-center justify-center rounded-xl bg-surface-2 text-muted',
        LIST_INSET,
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof RadixTabs.Trigger>) {
  return (
    <RadixTabs.Trigger
      className={cn(
        'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-transparent px-2 py-1 font-medium text-sm transition-colors hover:text-fg disabled:pointer-events-none disabled:opacity-50 data-[state=active]:border-border data-[state=active]:bg-surface data-[state=active]:text-fg [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
        TRIGGER_H,
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('flex-1 outline-none', className)} {...props} />;
}
