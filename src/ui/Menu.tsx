import { Check, ChevronRight, type LucideIcon } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import {
  type ComponentProps,
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/cn';
import { growFromRow, shrinkToRow } from '@/motion/morph';

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
/** A rows × columns picker inside a menu: a grid to sweep over and click, and boxes to type the size into. */
export interface MenuSize {
  size: {
    /** The grid's extent, and the most the boxes accept. */
    max: { rows: number; columns: number };
    onPick: (rows: number, columns: number) => void;
  };
}
export type MenuEntry = MenuItem | MenuSub | MenuField | MenuSize | { separator: true } | { heading: string };

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-surface-2';
const panelClass =
  'pop relative z-50 w-60 rounded-2xl border border-border bg-surface p-1.5 text-fg shadow-2xl';
const separatorClass = 'mx-1.5 my-1 h-px bg-border';

/** What the rows of one level of a menu need from the menu around them. */
interface Level {
  close?: () => void;
  /** A deeper level is open over this one, so its rows are out of play. */
  covered: boolean;
  openSub: (label: string, row: HTMLElement, fromKeys: boolean) => void;
}

function renderEntries(entries: MenuEntry[], level: Level): ReactNode {
  return entries.map((entry, i) => {
    if ('field' in entry)
      // biome-ignore lint/suspicious/noArrayIndexKey: static list, a field has no identity.
      return <FieldRow key={i} {...entry.field} close={level.close} />;
    if ('size' in entry)
      // biome-ignore lint/suspicious/noArrayIndexKey: static list, a picker has no identity.
      return <SizeRow key={i} {...entry.size} close={level.close} />;
    if ('separator' in entry)
      // biome-ignore lint/suspicious/noArrayIndexKey: static list, separators have no identity.
      return <DropdownMenu.Separator key={i} className={separatorClass} />;
    if ('heading' in entry)
      return (
        <DropdownMenu.Label key={entry.heading} className="px-2.5 pt-2 pb-1 text-xs font-medium text-muted">
          {entry.heading}
        </DropdownMenu.Label>
      );
    const Icon = entry.icon;
    if ('items' in entry)
      return (
        <DropdownMenu.Item
          key={entry.label}
          disabled={level.covered}
          aria-haspopup="menu"
          className={itemClass}
          // Opening keeps the menu up. A click from the keyboard has detail 0.
          onSelect={(event) => event.preventDefault()}
          onClick={(event) => level.openSub(entry.label, event.currentTarget, event.detail === 0)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight') level.openSub(entry.label, event.currentTarget, true);
          }}
        >
          {Icon && <Icon className="size-4 shrink-0 text-muted" />}
          {entry.label}
          <ChevronRight className="ml-auto size-4 text-muted" />
        </DropdownMenu.Item>
      );
    return (
      <DropdownMenu.Item
        key={entry.label}
        disabled={entry.disabled || level.covered}
        onSelect={entry.onSelect}
        className={cn(
          itemClass,
          entry.disabled && 'opacity-40',
          entry.danger && 'text-danger data-[highlighted]:bg-danger/10',
        )}
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
      </DropdownMenu.Item>
    );
  });
}

/**
 * The content of one level. While it is covered it dims and a sheet over it takes the pointer: a pointer crossing
 * it on the way somewhere highlights nothing, and a click on it only goes back.
 */
function LevelBody({
  covered,
  onBack,
  children,
}: {
  covered: boolean;
  onBack: () => void;
  children: ReactNode;
}) {
  return (
    <div
      data-covered={covered || undefined}
      aria-hidden={covered || undefined}
      className="relative flex min-h-0 flex-col transition-opacity duration-(--dur) data-[covered]:opacity-50 motion-reduce:transition-none"
    >
      {children}
      {covered && (
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onBack}
          className="absolute -inset-1.5 cursor-default"
        />
      )}
    </div>
  );
}

interface OpenSub {
  id: number;
  label: string;
  row: HTMLElement;
  fromKeys: boolean;
  closing: boolean;
}

/** A submenu: grows out of the row that opened it, and that row becomes its header. */
function SubPanel({
  open,
  sub,
  menu,
  level,
  onBack,
  onCoveredBack,
  onClosed,
}: {
  open: OpenSub;
  sub: MenuSub;
  menu: RefObject<HTMLDivElement | null>;
  level: Level;
  onBack: (fromKeys: boolean) => void;
  onCoveredBack: () => void;
  onClosed: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const { row, fromKeys, closing } = open;

  useLayoutEffect(() => {
    if (!panel.current || !header.current) return;
    growFromRow(row, panel.current, header.current);
    if (!fromKeys) menu.current?.focus();
    else
      (
        list.current?.querySelector<HTMLElement>('[role^="menuitem"]:not([data-disabled])') ?? header.current
      ).focus();
  }, [row, fromKeys, menu]);

  const closed = useEffectEvent(onClosed);
  useEffect(() => {
    if (closing && panel.current && header.current)
      void shrinkToRow(row, panel.current, header.current).then(closed);
  }, [closing, row]);

  const Icon = sub.icon;
  return (
    <div
      ref={panel}
      role="menu"
      aria-label={sub.label}
      data-closing={closing || undefined}
      className="group/panel absolute z-10 flex overflow-hidden rounded-2xl border border-border bg-surface text-fg shadow-2xl data-[closing]:pointer-events-none"
    >
      <div className="flex shrink-0 flex-col p-1.5">
        <LevelBody covered={level.covered} onBack={onCoveredBack}>
          <DropdownMenu.Item
            ref={header}
            aria-label="Back"
            disabled={level.covered}
            className={cn(itemClass, 'shrink-0')}
            onSelect={(event) => event.preventDefault()}
            onClick={(event) => onBack(event.detail === 0)}
          >
            {Icon && <Icon className="size-4 shrink-0 text-muted" />}
            {sub.label}
            <ChevronRight className="ml-auto size-4 rotate-90 text-muted transition-[rotate] duration-(--dur) ease-spring group-data-[closing]/panel:rotate-0 starting:rotate-0 motion-reduce:transition-none" />
          </DropdownMenu.Item>
          <DropdownMenu.Separator className={cn(separatorClass, 'shrink-0')} />
          <div ref={list} className="min-h-0 overflow-y-auto">
            {renderEntries(sub.items, level)}
          </div>
        </LevelBody>
      </div>
    </div>
  );
}

type MenuContentProps = Omit<ComponentProps<typeof DropdownMenu.Content>, 'children'> & {
  items: MenuEntry[];
  /** Rendered above the items. */
  header?: ReactNode;
  close?: () => void;
};

/** The body of every menu in the app: its items, and the submenus open over them, each one a click deeper. */
export function MenuContent({ items, header, close, className, ...props }: MenuContentProps) {
  const menu = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const [stack, setStack] = useState<OpenSub[]>([]);

  const levelAt = (depth: number): Level => ({
    close,
    covered: stack[depth] !== undefined && !stack[depth].closing,
    openSub: (label, row, fromKeys) => {
      const open = { id: nextId.current++, label, row, fromKeys, closing: false };
      setStack((current) => [...current.slice(0, depth), open]);
    },
  });
  /** Closes the submenu opened from level `depth`, and any above it. */
  const backTo = (depth: number, fromKeys: boolean) => {
    (fromKeys ? stack[depth].row : menu.current)?.focus();
    setStack((current) => current.map((open, i) => (i >= depth ? { ...open, closing: true } : open)));
  };
  const backOne = (event: { preventDefault: () => void }) => {
    const top = stack.findLastIndex((open) => !open.closing);
    if (top < 0) return;
    event.preventDefault();
    backTo(top, true);
  };

  let entries = items;
  const panels: ReactNode[] = [];
  for (const [depth, open] of stack.entries()) {
    const sub = entries.find((entry): entry is MenuSub => 'items' in entry && entry.label === open.label);
    if (!sub) break;
    entries = sub.items;
    panels.push(
      <SubPanel
        key={open.id}
        open={open}
        sub={sub}
        menu={menu}
        level={levelAt(depth + 1)}
        onBack={(fromKeys) => backTo(depth, fromKeys)}
        onCoveredBack={() => backTo(depth + 1, false)}
        onClosed={() => setStack((current) => current.filter(({ id }) => id !== open.id))}
      />,
    );
  }

  const root = levelAt(0);
  return (
    <DropdownMenu.Content
      {...props}
      ref={menu}
      className={cn(panelClass, className)}
      onEscapeKeyDown={backOne}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') backOne(event);
      }}
    >
      <LevelBody covered={root.covered} onBack={() => backTo(0, false)}>
        {header}
        {renderEntries(items, root)}
      </LevelBody>
      {panels}
    </DropdownMenu.Content>
  );
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

/** The row for a MenuSize. The grid is 6 across at most; the boxes reach `max`. Keys stay in the boxes except Escape. */
function SizeRow({ max, onPick, close }: MenuSize['size'] & { close?: () => void }) {
  const [over, setOver] = useState<{ rows: number; columns: number }>();
  const [error, setError] = useState<string>();
  const shown = { rows: Math.min(max.rows, 6), columns: Math.min(max.columns, 6) };
  const pick = (rows: number, columns: number) => {
    onPick(rows, columns);
    close?.();
  };
  return (
    <div className="px-2.5 py-1.5">
      <fieldset
        className="m-0 grid min-w-0 gap-1 border-0 p-0"
        style={{ gridTemplateColumns: `repeat(${shown.columns}, minmax(0, 1fr))` }}
        onMouseLeave={() => setOver(undefined)}
      >
        {Array.from({ length: shown.rows * shown.columns }, (_, i) => {
          const row = Math.floor(i / shown.columns) + 1;
          const column = (i % shown.columns) + 1;
          const lit = over && row <= over.rows && column <= over.columns;
          return (
            <button
              key={`${row}-${column}`}
              type="button"
              aria-label={`${row} × ${column}`}
              onMouseEnter={() => setOver({ rows: row, columns: column })}
              onFocus={() => setOver({ rows: row, columns: column })}
              onClick={() => pick(row, column)}
              className={cn(
                'aspect-square cursor-pointer rounded border border-border',
                lit ? 'border-accent bg-accent/30' : 'bg-surface-2',
              )}
            />
          );
        })}
      </fieldset>
      <p className="mt-1.5 text-center text-xs text-muted tabular-nums">
        {over ? `${over.rows} × ${over.columns}` : 'Rows × columns'}
      </p>
      <form
        className="mt-1.5 flex items-center gap-1.5"
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const rows = Number(data.get('rows'));
          const columns = Number(data.get('columns'));
          const ok = (n: number, most: number) => Number.isInteger(n) && n >= 1 && n <= most;
          if (ok(rows, max.rows) && ok(columns, max.columns)) pick(rows, columns);
          else setError(`Rows up to ${max.rows}, columns up to ${max.columns}.`);
        }}
      >
        {(['rows', 'columns'] as const).map((name, i) => (
          <Fragment key={name}>
            {i > 0 && <span className="text-xs text-muted">×</span>}
            <input
              name={name}
              type="number"
              inputMode="numeric"
              min={1}
              max={max[name]}
              autoComplete="off"
              placeholder={name === 'rows' ? 'Rows' : 'Cols'}
              aria-label={name === 'rows' ? 'Rows' : 'Columns'}
              onChange={() => setError(undefined)}
              onKeyDown={(event) => event.key !== 'Escape' && event.stopPropagation()}
              className="min-w-0 flex-1 rounded-lg border border-border bg-surface-2 px-2 py-1 font-mono text-xs outline-none placeholder:text-muted/70 focus:border-accent"
            />
          </Fragment>
        ))}
        <button
          type="submit"
          className="cursor-pointer rounded-lg border border-border bg-surface-2 px-2 py-1 text-xs hover:bg-surface"
        >
          Insert
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
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
        <MenuContent align={align} sideOffset={8} className={className} items={items} header={header} />
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
