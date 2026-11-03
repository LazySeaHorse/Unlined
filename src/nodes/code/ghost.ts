import { Decoration, EditorView, StateEffect, StateField, WidgetType } from '@uiw/react-codemirror';
import type { FieldReader } from '@/ai/completeField';

/** Tab completion in the code editor (see useInlineComplete): the editor read at its caret, and the line drawn there. */

const setGhost = StateEffect.define<{ at: number; text: string } | null>();

class GhostWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: GhostWidget) {
    return other.text === this.text;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'complete-ghost';
    span.textContent = this.text;
    return span;
  }
}

/** The editor extension that draws the waiting line, faint, at the caret; an edit drops it. */
export const ghostText = StateField.define({
  create: () => Decoration.none,
  update: (ghost, tr) => {
    for (const effect of tr.effects) {
      if (!effect.is(setGhost)) continue;
      if (!effect.value) return Decoration.none;
      const widget = Decoration.widget({ widget: new GhostWidget(effect.value.text), side: 1 });
      return Decoration.set(widget.range(effect.value.at));
    }
    return tr.docChanged ? Decoration.none : ghost;
  },
  provide: (field) => EditorView.decorations.from(field),
});

/** The editor a key went down in, at its caret. */
export const readCodeEditor: FieldReader = (target) => {
  const dom = target instanceof Element ? target.closest<HTMLElement>('.cm-editor') : null;
  const view = dom && EditorView.findFromDOM(dom);
  const caret = view?.state.selection.main;
  if (!view || !caret?.empty || view.state.readOnly) return undefined;
  const { doc } = view.state;
  return {
    element: view.dom,
    before: doc.sliceString(0, caret.head),
    after: doc.sliceString(caret.head),
    insert: (text) => {
      const at = view.state.selection.main.head;
      view.dispatch({
        changes: { from: at, insert: text },
        selection: { anchor: at + text.length },
        userEvent: 'input.complete',
      });
    },
    ghost: (text) => {
      if (view.dom.isConnected)
        view.dispatch({ effects: setGhost.of(text === undefined ? null : { at: caret.head, text }) });
    },
  };
};
