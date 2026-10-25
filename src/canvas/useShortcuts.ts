import { useEffect } from 'react';
import { kindForNumberKey } from '@/nodes/catalog';
import { redo, undo, useCanvasStore } from '@/store/canvasStore';
import { cycleFront, selectedStack, stackSelection } from '@/store/stacks';
import { useUiStore } from '@/store/uiStore';
import { editsCanvas, isTextField, isTyping } from './keyboard';
import { useWrapInSection } from './useSections';

/** True inside a menu or dialog, where Delete and Backspace belong to that control. */
const isInOverlay = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[role="menu"], [role="dialog"]') !== null;

export function useShortcuts(readOnly: boolean) {
  const wrapInSection = useWrapInSection();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const ui = useUiStore.getState();

      if (mod && key === 'f') {
        event.preventDefault();
        ui.openSearch();
        return;
      }
      if (key === 'escape' && ui.searchOpen) {
        ui.closeSearch();
        return;
      }
      // Not while a field or menu has the key: the label field's Escape cancels its edit and nothing more.
      if (key === 'escape' && ui.linking && !isTyping(event.target) && !isInOverlay(event.target)) {
        ui.setLinking(false);
        return;
      }
      if (readOnly) return;

      // A draft being typed (a title, an address) keeps its own history until it is committed. Anything else,
      // fields that save as you type and nodes that swallow other canvas keys (a spreadsheet with a cell
      // selected) alike, steps back through the canvas.
      if (mod && (key === 'z' || key === 'y')) {
        if (isTextField(event.target) && !editsCanvas(event.target)) return;
        event.preventDefault();
        if (key === 'y' || event.shiftKey) redo();
        else undo();
        return;
      }
      if (isTyping(event.target)) return;

      if (!mod && !event.altKey && !event.shiftKey) {
        const kind = kindForNumberKey(event.key);
        if (kind) {
          event.preventDefault();
          ui.setTool(kind);
          return;
        }
      }

      if (!mod && !event.altKey && !event.shiftKey && key === 'l') {
        event.preventDefault();
        ui.setLinking(!ui.linking);
        return;
      }

      const canvas = useCanvasStore.getState();
      if ((key === 'delete' || key === 'backspace') && !mod && !isInOverlay(event.target)) {
        canvas.deleteSelected();
      } else if (mod && key === 'd') {
        event.preventDefault();
        canvas.duplicateSelected();
      } else if (mod && event.shiftKey && key === 'g') {
        event.preventDefault();
        stackSelection();
      } else if (mod && key === 'g') {
        event.preventDefault(); // the browser's find-next
        wrapInSection();
      } else if ((key === '[' || key === ']') && !mod && !event.altKey) {
        const stack = selectedStack();
        if (!stack) return;
        event.preventDefault();
        cycleFront(stack, key === ']' ? 1 : -1);
      } else if (mod && key === 'a') {
        event.preventDefault();
        canvas.setSelection(
          () => true,
          () => true,
        );
      } else if (key === 'escape') {
        canvas.setSelection(() => false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readOnly, wrapInSection]);

  useEffect(() => {
    // The browser keeps one undo history for the whole page. Once a field has undone all its own typing,
    // Ctrl+Z goes on into whatever was typed before, elsewhere: a math field's hidden input, which then takes
    // focus and steps back through that node instead. A field's undo only ever touches that field.
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
      const active = document.activeElement;
      if (!(event.target instanceof Node) || !active?.contains(event.target)) event.preventDefault();
    };
    window.addEventListener('beforeinput', onBeforeInput, { capture: true });
    return () => window.removeEventListener('beforeinput', onBeforeInput, { capture: true });
  }, []);
}
