import { CircleQuestionMark, TriangleAlert } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useEffect, useLayoutEffect, useRef } from 'react';
import { type FieldSnapshot, snapshotField } from './askField';
import { Bubble } from './Bubble';
import type { AskState, InlineAsk } from './useInlineAsk';

/** What the slot focuses when it hands back to its field and has no record of where `?` was typed. */
const FIELD = 'math-field, input, textarea, [contenteditable="true"]';

interface AskSlotProps<Key extends string | number, Value> {
  ask: InlineAsk<Key, Value>;
  /** Which of the node's fields this is. Left out when the slot is the only place the node asks from (a field of
   * several lines, where the key is a line; a sheet's formula bar, where it is a cell). */
  at?: Key;
  /** What the request is for, as a hint in the empty box: "Describe the equation". */
  placeholder: string;
  /** The answer as it would look in the field, shown in the bubble until it is accepted. */
  renderGhost: (value: Value) => ReactNode;
  /** The field. It stays exactly as it is while an ask is open, and is focused again when the ask ends by key. */
  children: ReactNode;
}

/**
 * Where a field and its ask (useInlineAsk) meet. The field is never swapped or resized: an open ask is a bubble
 * (Bubble) that hangs flush below it, drawn as one quiet row (the words, the keys) with a line that sweeps while
 * the answer is worked out, then the answer for Tab or Enter to take, or the reason when there is none.
 */
export function AskSlot<Key extends string | number, Value>({
  ask,
  at,
  placeholder,
  renderGhost,
  children,
}: AskSlotProps<Key, Value>) {
  const slot = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const { state } = ask;
  const open = state.phase !== 'closed' && (at === undefined || state.at === at);
  // The field as it was before the `?`, and whether the ask ending should hand focus back to it.
  const snapshot = useRef<FieldSnapshot>(undefined);
  const refocus = useRef(false);
  // The caret goes back where it was after Escape, not after an answer, which changed the text.
  const caret = useRef(false);
  // An answer that went straight into the field (see `review`) ends the wait with the field to carry on in.
  const waiting = useRef(false);
  const wasOpen = useRef(false);

  // Takes a snapshot as `?` goes in: by key, and by input for a keyboard that sends no key (a phone's).
  useEffect(() => {
    const element = slot.current;
    if (!element || !ask.ready) return;
    const note = (event: Event) => {
      const asks =
        event instanceof KeyboardEvent
          ? event.key === '?' || event.key === 'Unidentified'
          : event instanceof InputEvent && event.data === '?';
      // (A keyboard with no keys, a phone's, sends 'Unidentified' and then the input.)
      // Any other key makes an earlier snapshot stale.
      snapshot.current = asks ? snapshotField(event.target) : undefined;
    };
    element.addEventListener('keydown', note, true);
    element.addEventListener('beforeinput', note, true);
    return () => {
      element.removeEventListener('keydown', note, true);
      element.removeEventListener('beforeinput', note, true);
    };
  }, [ask.ready]);

  // A press anywhere but in the bubble puts it away. Heard on the way down, before the canvas can take the press.
  const close = ask.close;
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!(event.target instanceof Element && event.target.closest('.ask-bubble'))) close();
    };
    document.addEventListener('pointerdown', away, true);
    return () => document.removeEventListener('pointerdown', away, true);
  }, [open, close]);

  useLayoutEffect(() => {
    if (open) {
      snapshot.current?.revert();
    } else if (wasOpen.current) {
      if (refocus.current || waiting.current) {
        const restore = snapshot.current;
        if (restore && caret.current) restore.restore();
        else slot.current?.querySelector<HTMLElement>(FIELD)?.focus();
      }
      refocus.current = false;
      caret.current = false;
      snapshot.current = undefined;
    }
    wasOpen.current = open;
  }, [open]);
  useLayoutEffect(() => {
    waiting.current = state.phase === 'running';
  });

  const onKeyDown = (event: KeyboardEvent) => {
    const ghost = state.phase === 'ghost';
    if (event.key === 'Escape') {
      refocus.current = state.phase === 'typing';
      caret.current = refocus.current;
      ask.back();
    } else if (event.key === 'Enter' || (event.key === 'Tab' && ghost)) {
      refocus.current = ghost;
      if (ghost) ask.accept();
      else ask.submit();
    } else if (event.key === 'Tab' && !event.shiftKey) {
      // Focus stays in the bubble: it ends with Escape, or an answer.
    } else {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
  };

  return (
    // data-asking: the node is still being typed in, though focus is in the bubble (see .node-tile in index.css).
    <div ref={slot} className="contents" data-asking={open || undefined}>
      {children}
      {state.phase !== 'closed' && open && (
        <Bubble
          anchor={() => snapshot.current?.anchor?.() ?? slot.current?.firstElementChild}
          label="Ask AI"
          className="ask-surface"
          onOutside={ask.close}
        >
          <AskPanel
            state={state}
            placeholder={placeholder}
            input={input}
            onWords={ask.setWords}
            onKeyDown={onKeyDown}
            ghost={state.phase === 'ghost' ? renderGhost(state.value) : undefined}
          />
        </Bubble>
      )}
    </div>
  );
}

type OpenState<Key, Value> = Exclude<AskState<Key, Value>, { phase: 'closed' }>;

function AskPanel<Key, Value>({
  state,
  placeholder,
  input,
  onWords,
  onKeyDown,
  ghost,
}: {
  state: OpenState<Key, Value>;
  placeholder: string;
  input: React.RefObject<HTMLInputElement | null>;
  onWords: (words: string) => void;
  onKeyDown: (event: KeyboardEvent) => void;
  ghost: ReactNode;
}) {
  // The bubble mounts in a portal after the slot, so the box takes focus as it appears.
  useLayoutEffect(() => input.current?.focus(), [input]);
  const error = state.phase === 'typing' ? state.error : undefined;
  const hints =
    state.phase === 'ghost'
      ? [
          ['Tab', 'insert'],
          ['Esc', 'edit'],
        ]
      : state.phase === 'running'
        ? [['Esc', 'cancel']]
        : [
            ['Enter', error ? 'retry' : 'ask'],
            ['Esc', 'cancel'],
          ];
  return (
    <div className="ask-bubble" data-state={error ? 'failed' : state.phase}>
      {/* A hairline that sweeps with colour while the answer is worked out. */}
      <div aria-hidden className="ask-line" />
      <div className="ask-row">
        <CircleQuestionMark aria-hidden className="ask-icon" />
        <input
          ref={input}
          aria-label="Describe it"
          placeholder={placeholder}
          className="ask-input nodrag nopan nokey"
          data-state={error ? 'failed' : state.phase}
          aria-invalid={error ? true : undefined}
          title={error}
          value={state.words}
          onChange={(event) => onWords(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoComplete="off"
        />
        <span className="ask-keys">
          {hints.map(([key, what]) => (
            <span key={key} className="ask-key" title={what}>
              <kbd>{key}</kbd>
              {/* Named only when there is an answer to take or leave. */}
              {state.phase === 'ghost' ? (
                <span className="ask-key-name"> {what}</span>
              ) : (
                <span className="sr-only"> {what}</span>
              )}
            </span>
          ))}
        </span>
      </div>
      {/* There while the ask is open, so a screen reader reads each change once: the wait, the reason, the answer. */}
      <div role="status" aria-live="polite" className="ask-status">
        {state.phase === 'running' && <p className="sr-only">Thinking…</p>}
        {error && (
          <p className="ask-note ask-error">
            <TriangleAlert aria-hidden className="size-3.5 shrink-0" /> {error}
          </p>
        )}
        {state.phase === 'ghost' && <div className="ask-ghost">{ghost}</div>}
      </div>
    </div>
  );
}
