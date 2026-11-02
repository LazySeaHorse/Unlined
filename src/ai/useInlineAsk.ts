import { type RefObject, useEffect, useRef, useState } from 'react';
import { asUndoStep } from '@/store/canvasStore';
import { type AskSpec, askFor } from './inlineAsk';
import { useAiReady } from './store';

/**
 * Typing `?` into an empty field asks for its content in words. The field gives way to a plain input (math fields
 * drop spaces), Enter sends the words, and the answer waits faintly in the field's place until Tab or Enter takes
 * it or Escape goes back to the words. Escape again leaves. Nothing of this shows unless on-device AI is ready.
 *
 * A node calls useInlineAsk once with its AskSpec, routes its fields' edits through `trigger`, and wraps each
 * field in an AskSlot. One ask is open per node at a time; `Key` says which of the node's fields it is in (a row
 * index, a cell). Keys are compared with ===, so use a number or a string.
 */

/** Where the ask is: the words being typed (with why the last ones failed), sent, or answered. */
export type AskState<Key, Value> =
  | { phase: 'closed' }
  | { phase: 'typing'; at: Key; words: string; error?: string }
  | { phase: 'running'; at: Key; words: string }
  | { phase: 'ghost'; at: Key; words: string; value: Value };

export interface InlineAskOptions<Context, Key, Value> {
  /** The node's own data, read when the words are sent. */
  context: Context;
  /** Writes an accepted answer into the field at `at`, as one undo step. */
  apply: (value: Value, at: Key) => void;
}

export interface InlineAsk<Key, Value> {
  state: AskState<Key, Value>;
  /**
   * For a field's change handler, with its value before and after the edit. True when the edit was `?` typed into
   * the empty field and an ask opened at `at`: the edit is then dropped, not saved. Always false while on-device
   * AI is not ready, so `?` types as usual.
   */
  trigger: (at: Key, before: string, after: string) => boolean;
  setWords: (words: string) => void;
  submit: () => void;
  accept: () => void;
  /** Escape: from the answer (or the wait for it) back to the words; from the words out. */
  back: () => void;
  close: () => void;
}

const CLOSED = { phase: 'closed' } as const;

const FAILED = {
  invalid: 'Could not turn that into something that fits here. Try other words.',
  unavailable: 'Not available right now.',
};

const abort = (request: RefObject<AbortController | undefined>) => {
  request.current?.abort();
  request.current = undefined;
};

export function useInlineAsk<Context, Answer, Value, Key extends string | number>(
  spec: AskSpec<Context, Answer, Value>,
  options: InlineAskOptions<Context, Key, Value>,
): InlineAsk<Key, Value> {
  const ready = useAiReady();
  const [state, setState] = useState<AskState<Key, Value>>(CLOSED);
  const request = useRef<AbortController>(undefined);

  const cancel = () => abort(request);

  const close = () => {
    cancel();
    setState((s) => (s.phase === 'closed' ? s : CLOSED));
  };

  useEffect(() => () => abort(request), []);
  // Switched off, or the canvas turned read-only, mid-ask.
  useEffect(() => {
    if (ready) return;
    abort(request);
    setState((s) => (s.phase === 'closed' ? s : CLOSED));
  }, [ready]);

  const trigger = (at: Key, before: string, after: string) => {
    if (!ready || before !== '' || after !== '?') return false;
    cancel();
    setState({ phase: 'typing', at, words: '' });
    return true;
  };

  const setWords = (words: string) => {
    if (state.phase === 'closed') return;
    // Editing the words drops an answer that was for the old ones.
    cancel();
    setState({ phase: 'typing', at: state.at, words });
  };

  const submit = () => {
    if (state.phase !== 'typing' || !state.words.trim()) return;
    const { at, words } = state;
    cancel();
    const controller = new AbortController();
    request.current = controller;
    setState({ phase: 'running', at, words });
    void askFor(spec, options.context, words.trim(), controller.signal).then((result) => {
      // Superseded by newer words, Escape, closing or unmounting.
      if (controller.signal.aborted || result.status === 'aborted') return;
      request.current = undefined;
      setState(
        result.status === 'ok'
          ? { phase: 'ghost', at, words, value: result.value }
          : { phase: 'typing', at, words, error: FAILED[result.status] },
      );
    });
  };

  const accept = () => {
    if (state.phase !== 'ghost') return;
    asUndoStep(() => options.apply(state.value, state.at));
    setState(CLOSED);
  };

  const back = () => {
    if (state.phase === 'closed') return;
    if (state.phase === 'typing') return close();
    cancel();
    setState({ phase: 'typing', at: state.at, words: state.words });
  };

  return { state, trigger, setWords, submit, accept, back, close };
}
