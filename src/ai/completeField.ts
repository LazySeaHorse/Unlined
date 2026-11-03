import type { MathfieldElement } from 'mathlive';

/**
 * A field as Tab completion (useInlineComplete) sees it: its text either side of the caret, a way to put a
 * continuation in at the caret, and where the continuation shows while it waits. Read from the field's own DOM, so
 * a node needs no code of its own for it: its change handler saves what `insert` puts in, as it would typing.
 */
export interface CompleteField {
  element: HTMLElement;
  before: string;
  after: string;
  /** Puts `text` in at the caret, through the field's own change handler, and leaves the caret after it. */
  insert: (text: string) => void;
  /**
   * Where the waiting continuation shows: over the field at its caret (a textarea, an input), under it (a math
   * field, see CompleteSlot), or drawn by the field itself (a code editor), which is told the text, or none.
   */
  ghost: 'caret' | 'below' | ((text: string | undefined) => void);
}

/** Reads the field a key went down in; undefined when it is not one to complete (a selection, read-only). */
export type FieldReader = (target: EventTarget | null) => CompleteField | undefined;

/** Textareas, text inputs and math fields; not an ask's own input (AskSlot). */
export const readField: FieldReader = (target) => {
  if (!(target instanceof HTMLElement) || target.classList.contains('ask-input')) return undefined;
  if (target instanceof HTMLTextAreaElement || (target instanceof HTMLInputElement && target.type === 'text'))
    return textControl(target);
  if (target.tagName === 'MATH-FIELD') return mathField(target as MathfieldElement);
  return undefined;
};

function textControl(field: HTMLTextAreaElement | HTMLInputElement): CompleteField | undefined {
  const { value, selectionStart: start, selectionEnd: end } = field;
  if (field.readOnly || field.disabled || start === null || start !== end) return undefined;
  return {
    element: field,
    before: value.slice(0, start),
    after: value.slice(start),
    ghost: 'caret',
    insert: (text) => {
      const at = field.selectionStart ?? field.value.length;
      // Set past React's own setter, so that the input event below reaches the field's onChange.
      const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(field), 'value')?.set;
      const next = field.value.slice(0, at) + text + field.value.slice(at);
      setter?.call(field, next);
      field.dispatchEvent(new Event('input', { bubbles: true }));
      // Once React has rendered the edit, which puts the caret at the end.
      const caret = at + text.length;
      queueMicrotask(() => field.value === next && field.setSelectionRange(caret, caret));
    },
  };
}

/** Stands in for the caret while a math field's LaTeX is read: a symbol nobody types. */
const MARK = '\\maltese';

/**
 * A math field's LaTeX either side of the caret. MathLive gives offsets into its own tree, not the LaTeX, so a mark
 * is put in at the caret, silently, the LaTeX read and the field set back as it was.
 */
function mathField(field: MathfieldElement): CompleteField | undefined {
  if (field.readOnly || field.mode === 'latex' || !field.selectionIsCollapsed) return undefined;
  const { value, position } = field;
  let marked: string;
  try {
    field.insert(MARK, { silenceNotifications: true, format: 'latex', mode: 'math' });
    marked = field.value;
  } finally {
    field.setValue(value, { silenceNotifications: true });
    field.position = position;
  }
  const at = marked.indexOf(MARK);
  if (at < 0 || marked.indexOf(MARK, at + 1) >= 0) return undefined;
  return {
    element: field,
    before: marked.slice(0, at),
    after: marked.slice(at + MARK.length),
    ghost: 'below',
    insert: (text) => {
      field.insert(text, { silenceNotifications: true, format: 'latex', mode: 'math' });
      // Reported now, not a tick later as MathLive would, so the edit is the caller's undo step (see MathField).
      field.dispatchEvent(new Event('input'));
    },
  };
}
