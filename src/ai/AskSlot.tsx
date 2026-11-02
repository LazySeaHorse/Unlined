import { type KeyboardEvent, type ReactNode, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import type { InlineAsk } from './useInlineAsk';

/** What the slot focuses when it hands back to its field. */
const FIELD = 'math-field, input, textarea, [contenteditable="true"]';

interface AskSlotProps<Key extends string | number, Value> {
  ask: InlineAsk<Key, Value>;
  /** Which of the node's fields this is. Left out for a field of several lines, where the key is a line. */
  at?: Key;
  /** The answer as it would look in the field, drawn faintly until it is accepted. */
  renderGhost: (value: Value) => ReactNode;
  /** The field's own layout classes (flex-1, min-w-0, …): the slot takes its place in the layout. */
  className?: string;
  /**
   * For a field of several lines (see askedLine): the field's lines above and below the one asked from, drawn
   * in its place while it gives way. The input then takes just that line and the answer shows under it.
   */
  lines?: { above: ReactNode; below: ReactNode };
  /** The field. It is unmounted while an ask is open here, and focused again when the ask ends by key. */
  children: ReactNode;
}

/**
 * Where a field and its ask (useInlineAsk) take turns. While the ask is open the field gives way to a plain input
 * of the same height, which shimmers while the answer is worked out, shows the answer faintly over itself, and
 * underlines in red, with the reason on hover, when there is none.
 */
export function AskSlot<Key extends string | number, Value>({
  ask,
  at,
  renderGhost,
  className,
  lines,
  children,
}: AskSlotProps<Key, Value>) {
  const slot = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  // The field's height, so the input takes exactly its room. Computed style, as it is exact (offsetHeight rounds)
  // and unscaled by the canvas zoom.
  const fieldHeight = useRef<number>(undefined);
  const measure = () => {
    const element = slot.current;
    if (element) fieldHeight.current = Number.parseFloat(getComputedStyle(element).height) || undefined;
  };
  const refocus = useRef(false);
  const { state } = ask;
  const open = state.phase !== 'closed' && (at === undefined || state.at === at);

  useLayoutEffect(() => {
    if (open) {
      input.current?.focus();
    } else if (refocus.current) {
      refocus.current = false;
      slot.current?.querySelector<HTMLElement>(FIELD)?.focus();
    }
  }, [open]);

  if (!open) {
    return (
      // Measured as a key goes down, before it changes the field (a math field shrinks once its placeholder goes).
      <div ref={slot} className={className} onKeyDownCapture={measure}>
        {children}
      </div>
    );
  }

  const onKeyDown = (event: KeyboardEvent) => {
    const ghost = state.phase === 'ghost';
    if (event.key === 'Escape') {
      refocus.current = state.phase === 'typing';
      ask.back();
    } else if (event.key === 'Enter' || (event.key === 'Tab' && ghost)) {
      refocus.current = ghost;
      if (ghost) ask.accept();
      else ask.submit();
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  const error = state.phase === 'typing' ? state.error : undefined;
  return (
    <div
      ref={slot}
      className={cn('ask-slot', lines && 'ask-lines', className)}
      style={{ minHeight: fieldHeight.current }}
    >
      {lines?.above}
      <input
        ref={input}
        aria-label="Describe it"
        className="ask-input nodrag nopan nokey"
        data-state={error ? 'failed' : state.phase}
        title={error}
        value={state.words}
        onChange={(event) => ask.setWords(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => state.phase === 'typing' && !state.words && ask.close()}
        spellCheck={false}
        autoComplete="off"
      />
      {state.phase === 'ghost' && (
        <div className={cn('ask-ghost', !lines && 'ask-ghost-over')}>{renderGhost(state.value)}</div>
      )}
      {lines?.below}
    </div>
  );
}
