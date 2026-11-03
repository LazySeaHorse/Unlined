import { type ReactNode, useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { type CompleteField, type FieldReader, readField } from './completeField';
import type { InlineComplete } from './useInlineComplete';

interface CompleteSlotProps<Key extends string | number> {
  complete: InlineComplete<Key>;
  /** Which of the node's fields this is. */
  at: Key;
  /** Reads the field; textareas, inputs and math fields by default. A code editor brings its own. */
  read?: FieldReader;
  /**
   * For a math field, which shows the waiting line under itself: what to draw, given the field's LaTeX with the
   * continuation in it and the caret's offset after it (see lineAt for a field of several lines).
   */
  renderGhost?: (text: string, caret: number) => ReactNode;
  /** Classes for that line under the field. */
  className?: string;
  /** The field, and an AskSlot around it when the node has one. */
  children: ReactNode;
}

/**
 * Where a field takes Tab completion (useInlineComplete). It has no box of its own: it hears the field's keys
 * before the field does, marks the field while the line is worked out, and draws the waiting line.
 */
export function CompleteSlot<Key extends string | number>({
  complete,
  at,
  read = readField,
  renderGhost,
  className,
  children,
}: CompleteSlotProps<Key>) {
  const { state } = complete;
  const mine = state.phase !== 'closed' && state.at === at ? state : undefined;
  const element = mine?.field.element;
  const running = mine?.phase === 'running';
  const ghost = mine?.phase === 'ghost' ? mine : undefined;

  useLayoutEffect(() => {
    if (!element || !running) return;
    element.dataset.completing = '';
    return () => {
      delete element.dataset.completing;
    };
  }, [element, running]);

  const draw = ghost && typeof ghost.field.ghost === 'function' ? ghost.field.ghost : undefined;
  const drawn = ghost?.text;
  useLayoutEffect(() => {
    if (!draw) return;
    draw(drawn);
    return () => draw(undefined);
  }, [draw, drawn]);

  const below = ghost?.field.ghost === 'below' && renderGhost;
  return (
    <div
      className="contents"
      onKeyDownCapture={complete.ready ? (event) => complete.keyDown(at, event, read) : undefined}
      onBlurCapture={mine ? complete.drop : undefined}
      onPointerDownCapture={mine ? complete.drop : undefined}
    >
      {children}
      {ghost?.field.ghost === 'caret' && <CaretGhost field={ghost.field} text={ghost.text} />}
      {below && (
        <div className={cn('complete-ghost', className)} aria-hidden>
          {below(
            ghost.field.before + ghost.text + ghost.field.after,
            ghost.field.before.length + ghost.text.length,
          )}
        </div>
      )}
    </div>
  );
}

/** What a copy of a textarea or input must share with it for its text to lay out the same. */
const LAYOUT = [
  'box-sizing',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'letter-spacing',
  'line-height',
  'tab-size',
  'text-indent',
  'text-transform',
  'word-spacing',
  'overflow-wrap',
  'word-break',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
];

/**
 * The waiting line over a textarea or input, at its caret: a copy of the field laid out the same, its text up to
 * the caret unseen and the line after it, faint, over the text it would push along.
 */
function CaretGhost({ field: { element, before }, text }: { field: CompleteField; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const copy = ref.current;
    const parent = copy?.offsetParent;
    if (!copy || !(parent instanceof HTMLElement)) return;
    const style = getComputedStyle(element);
    for (const name of LAYOUT) copy.style.setProperty(name, style.getPropertyValue(name));
    copy.style.whiteSpace = element instanceof HTMLInputElement ? 'pre' : 'pre-wrap';
    // Faint by its colour, not its opacity, so its background hides the text it lies over.
    const line = copy.lastElementChild as HTMLElement;
    line.style.color = `color-mix(in srgb, ${style.color} 50%, transparent)`;
    line.style.backgroundColor = style.backgroundColor;
    // Placed by its box on screen, scaled back by the canvas zoom.
    const box = element.getBoundingClientRect();
    const origin = parent.getBoundingClientRect();
    const scale = origin.width / parent.offsetWidth || 1;
    copy.style.left = `${(box.left - origin.left) / scale - parent.clientLeft}px`;
    copy.style.top = `${(box.top - origin.top) / scale - parent.clientTop}px`;
    copy.style.width = `${element.offsetWidth}px`;
    copy.style.height = `${element.offsetHeight}px`;
    copy.scrollTop = element.scrollTop;
    copy.scrollLeft = element.scrollLeft;
  });
  return (
    <div ref={ref} className="complete-copy" aria-hidden>
      {before}
      <span>{text}</span>
    </div>
  );
}
