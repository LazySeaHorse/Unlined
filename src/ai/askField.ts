import { EditorView } from '@codemirror/view';
import type { MathfieldElement } from 'mathlive';

/**
 * A field as it was just before `?` was typed into it, for an ask (AskSlot). The `?` is not the field's to keep:
 * the node drops it, but a field that holds its own text (MathLive, CodeMirror) still has it. The snapshot puts
 * that right, and puts the caret back where it was when the ask ends without an answer.
 */
export interface FieldSnapshot {
  /** The field is as it was, without the `?`. For a field the node's own state controls (a textarea, an input),
   * React does that itself, so there is nothing to do. */
  revert: () => void;
  /** Focuses the field, with its caret where it was. */
  restore: () => void;
  /** Where the bubble hangs, when that is the line the `?` was typed on rather than the whole field. */
  anchor?: () => { getBoundingClientRect: () => DOMRect } | undefined;
}

export function snapshotField(target: EventTarget | null): FieldSnapshot | undefined {
  if (!(target instanceof HTMLElement)) return undefined;
  if (
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLInputElement && target.type === 'text')
  ) {
    const { selectionStart: caret } = target;
    return {
      revert: () => {},
      restore: () => {
        target.focus();
        if (caret !== null) target.setSelectionRange(caret, caret);
      },
    };
  }
  if (target.tagName === 'MATH-FIELD') return mathSnapshot(target as MathfieldElement);
  const dom = target.closest<HTMLElement>('.cm-editor');
  const view = dom && EditorView.findFromDOM(dom);
  return view ? codeSnapshot(view) : undefined;
}

function mathSnapshot(field: MathfieldElement): FieldSnapshot {
  const { value, position } = field;
  return {
    revert: () => {
      if (field.value !== value) field.setValue(value, { silenceNotifications: true, mode: 'math' });
      field.position = position;
    },
    restore: () => {
      field.focus();
      field.position = position;
    },
  };
}

function codeSnapshot(view: EditorView): FieldSnapshot {
  const doc = view.state.doc.toString();
  const { head } = view.state.selection.main;
  return {
    revert: () => {
      const now = view.state.doc.toString();
      // Just the one character typed, if it is still there; anything else is the person's, and stays.
      if (
        now.length === doc.length + 1 &&
        now[head] === '?' &&
        now.slice(0, head) + now.slice(head + 1) === doc
      )
        view.dispatch({ changes: { from: head, to: head + 1 }, selection: { anchor: head } });
    },
    // The line's own box, as wide as the editor.
    anchor: () => {
      const line = view.coordsAtPos(Math.min(head, view.state.doc.length));
      if (!line) return undefined;
      const { left, right } = view.dom.getBoundingClientRect();
      return {
        getBoundingClientRect: () => new DOMRect(left, line.top, right - left, line.bottom - line.top),
      };
    },
    restore: () => {
      view.focus();
      const length = view.state.doc.length;
      view.dispatch({ selection: { anchor: Math.min(head, length) } });
    },
  };
}
