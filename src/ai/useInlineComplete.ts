import { type RefObject, useEffect, useRef, useState } from 'react';
import { asUndoStep } from '@/store/canvasStore';
import type { CompleteField, FieldReader } from './completeField';
import { type CompleteSpec, completeFor } from './inlineAsk';
import { useAiReady } from './store';

/**
 * Tab in a field asks for the rest of the line at the caret. While it is worked out the field shimmers; then the
 * line waits faintly until Tab takes it, as one undo step. Escape, any other key, a click, leaving the field or a
 * change to the node drops it. One that does not pass the spec's check never shows. Nothing of this happens
 * unless on-device AI is ready, nor in an empty field: Tab is then Tab.
 *
 * A node calls useInlineComplete once with its CompleteSpec and wraps each field in a CompleteSlot. `Key` says which
 * of the node's fields a completion is in, as for useInlineAsk.
 */

export type CompleteState<Key> =
  | { phase: 'closed' }
  | { phase: 'running'; at: Key; field: CompleteField }
  | { phase: 'ghost'; at: Key; field: CompleteField; text: string };

export interface InlineCompleteOptions<Context, Key> {
  /** The node's data: a waiting line is dropped when it changes. */
  data: unknown;
  /** What the node tells the model besides the field's text up to the caret, read when Tab is pressed. */
  context: (at: Key) => Context;
}

/** What keyDown needs of a keyboard event. */
type KeyEvent = Pick<
  KeyboardEvent,
  'key' | 'shiftKey' | 'ctrlKey' | 'altKey' | 'metaKey' | 'target' | 'preventDefault' | 'stopPropagation'
>;

export interface InlineComplete<Key> {
  state: CompleteState<Key>;
  ready: boolean;
  /** For a field's keydown, before the field has it: Tab asks or accepts, any other key drops what waits. */
  keyDown: (at: Key, event: KeyEvent, read: FieldReader) => void;
  drop: () => void;
}

const CLOSED = { phase: 'closed' } as const;
const MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock']);

const abort = (request: RefObject<AbortController | undefined>) => {
  request.current?.abort();
  request.current = undefined;
};

const consume = (event: KeyEvent) => {
  event.preventDefault();
  event.stopPropagation();
};

export function useInlineComplete<Context, Key extends string | number>(
  spec: CompleteSpec<Context>,
  options: InlineCompleteOptions<Context, Key>,
): InlineComplete<Key> {
  const ready = useAiReady();
  const [state, setState] = useState<CompleteState<Key>>(CLOSED);
  const request = useRef<AbortController>(undefined);

  const drop = () => {
    abort(request);
    setState((s) => (s.phase === 'closed' ? s : CLOSED));
  };

  useEffect(() => () => abort(request), []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: drops whenever either changes.
  useEffect(drop, [ready, options.data]);

  const start = (at: Key, field: CompleteField) => {
    abort(request);
    const controller = new AbortController();
    request.current = controller;
    setState({ phase: 'running', at, field });
    void completeFor(spec, options.context(at), field.before, field.after, controller.signal).then(
      (result) => {
        if (controller.signal.aborted) return;
        request.current = undefined;
        // A line that does not fit, or none in time, shows nothing: Tab did nothing.
        setState(result.status === 'ok' ? { phase: 'ghost', at, field, text: result.value } : CLOSED);
      },
    );
  };

  const keyDown = (at: Key, event: KeyEvent, read: FieldReader) => {
    const here = state.phase !== 'closed' && state.at === at;
    if (event.key === 'Tab' && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey) {
      if (here) {
        // Tab again while it is worked out waits for it.
        consume(event);
        if (state.phase !== 'ghost') return;
        const { field, text } = state;
        setState(CLOSED);
        asUndoStep(() => field.insert(text));
        return;
      }
      const field = ready ? read(event.target) : undefined;
      if (!field || !(field.before + field.after).trim()) return;
      consume(event);
      start(at, field);
      return;
    }
    if (MODIFIERS.has(event.key) || state.phase === 'closed') return;
    drop();
    if (event.key === 'Escape') consume(event);
  };

  return { state, ready, keyDown, drop };
}
