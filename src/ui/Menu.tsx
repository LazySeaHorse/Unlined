import { Check, ChevronRight, type LucideIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  /** CSS colour drawn as a dot in place of the icon. */
  swatch?: string;
  /** Marks the current choice in a list of options. */
  checked?: boolean;
  /** Right-aligned hint, e.g. a keyboard shortcut. */
  hint?: string;
  disabled?: boolean;
  danger?: boolean;
}
export interface MenuSub {
  label: string;
  items: MenuEntry[];
  icon?: LucideIcon;
}
/** A text box inside a menu. `onSubmit` returns an error to show under it, or nothing to accept and close. */
export interface MenuField {
  field: {
    /** Fixed text in front of what is typed, e.g. the row being operated on. */
    prefix: string;
    placeholder?: string;
    hint?: string;
    /** What a screen reader calls the box; defaults to "Operation on" and the prefix. */
    label?: string;
    /** Takes the caret when the menu opens (default). Only one field in a menu should. */
    autoFocus?: boolean;
    onSubmit: (text: string) => string | undefined;
  };
}
export type MenuEntry = MenuItem | MenuSub | MenuField | { separator: true } | { heading: string };

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2 data-[disabled]:opacity-40';
export const panelClass =
  'pop z-50 w-60 rounded-2xl border border-border bg-surface p-1.5 text-fg shadow-2xl';

/** The parts of a Radix menu that dropdown and context menus have in common. */
type Parts = Pick<
  typeof DropdownMenu,
  'Item' | 'Separator' | 'Label' | 'Sub' | 'SubTrigger' | 'SubContent' | 'Portal'
>;

/** Renders menu entries with the given Radix parts, so every menu in the app looks and behaves alike. */
export function renderEntries(parts: Parts, entries: MenuEntry[], close?: () => void): ReactNode {
  return entries.map((entry, i) => {
    if ('field' in entry)
      // biome-ignore lint/suspicious/noArrayIndexKey: static list, a field has no identity.
      return <FieldRow key={i} {...entry.field} close={close} />;
    if ('separator' in entry)
      // biome-ignore lint/suspicious/noArrayIndexKey: static list, separators have no identity.
      return <parts.Separator key={i} className="mx-1.5 my-1 h-px bg-border" />;
    if ('heading' in entry)
      return (
        <parts.Label key={entry.heading} className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted">
          {entry.heading}
        </parts.Label>
      );
    const Icon = entry.icon;
    if ('items' in entry)
      return (
        <parts.Sub key={entry.label}>
          <parts.SubTrigger className={cn(itemClass, 'data-[state=open]:bg-surface-2')}>
            {Icon && <Icon className="size-4 shrink-0 text-muted" />}
            {entry.label}
            <ChevronRight className="ml-auto size-4 text-muted" />
          </parts.SubTrigger>
          <parts.Portal>
            <parts.SubContent sideOffset={6} alignOffset={-6} className={panelClass}>
              {renderEntries(parts, entry.items, close)}
            </parts.SubContent>
          </parts.Portal>
        </parts.Sub>
      );
    return (
      <parts.Item
        key={entry.label}
        disabled={entry.disabled}
        onSelect={entry.onSelect}
        className={cn(itemClass, entry.danger && 'text-danger data-[highlighted]:bg-danger/10')}
      >
        {entry.swatch ? (
          <span
            className="size-4 shrink-0 rounded-full border border-fg/20"
            style={{ backgroundColor: entry.swatch }}
          />
        ) : (
          Icon && <Icon className="size-4 shrink-0 text-muted" />
        )}
        {entry.label}
        {entry.checked && <Check className="ml-auto size-4 text-muted" />}
        {entry.hint && <span className="ml-auto text-xs text-muted">{entry.hint}</span>}
      </parts.Item>
    );
  });
}

/** The row for a MenuField. Keys stay in the box (Radix would use them to move through items), except Escape. */
function FieldRow({
  prefix,
  placeholder,
  hint,
  label,
  autoFocus = true,
  onSubmit,
  close,
}: MenuField['field'] & { close?: () => void }) {
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  // Radix focuses the menu itself as it opens; take the caret after that.
  useEffect(() => {
    if (!autoFocus) return;
    const timer = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, [autoFocus]);
  return (
    <form
      className="px-2.5 py-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        const text = new FormData(event.currentTarget).get('text') as string;
        const problem = text.trim() ? onSubmit(text) : undefined;
        setError(problem);
        if (!problem && text.trim()) close?.();
      }}
    >
      <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2 py-1 focus-within:border-accent">
        <span className="shrink-0 font-mono text-xs font-semibold text-muted">{prefix}</span>
        <input
          ref={input}
          name="text"
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          aria-label={label ?? `Operation on ${prefix}`}
          onChange={() => setError(undefined)}
          onKeyDown={(event) => event.key !== 'Escape' && event.stopPropagation()}
          className="min-w-0 flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted/70"
        />
      </div>
      {error ? (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1 text-xs text-muted">{hint}</p>
      )}
    </form>
  );
}

interface MenuProps {
  trigger: ReactNode;
  items: MenuEntry[];
  /** Rendered above the items, e.g. who or what the menu belongs to. */
  header?: ReactNode;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

export function Menu({ trigger, items, header, align = 'start', className }: MenuProps) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={8} className={cn(panelClass, className)}>
          {header}
          {renderEntries(DropdownMenu, items)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
