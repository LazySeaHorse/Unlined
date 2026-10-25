import { useEffect } from 'react';
import { kindForNumberKey } from '@/nodes/catalog';
import { redo, undo, useCanvasStore } from '@/store/canvasStore';
import {
  cycleFront,
  openFan,
  pickFromFan,
  selectedStack,
  stackCardIds,
  stackSelection,
} from '@/store/stacks';
import { useUiStore } from '@/store/uiStore';
import { editsCanvas, isTextField, isTyping } from './keyboard';
import { useWrapInSection } from './useSections';

/** A Space press shorter than this is a tap (fan a stack out); held longer, Space is React Flow's pan key. */
const SPACE_TAP_MS = 250;

/** True inside a menu or dialog, where Delete and Backspace belong to that control. */
const isInOverlay = (target: EventTarget | null) =>
  target instanceof Element && target.closest('[role="menu"], [role="dialog"]') !== null;

export function useShortcuts(readOnly: boolean) {
  const wrapInSection = useWrapInSection();
  useEffect(() => {
    let spaceAt: number | undefined;

    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      const key = event.key.toLowerCase();
      const ui = useUiStore.getState();

      if (key === ' ' && !mod && !event.repeat && !isTyping(event.target)) spaceAt = performance.now();

      // Cards spread out: arrows move along them, Enter shows the one highlighted, Escape folds them up.
      if (ui.fanned && !isTyping(event.target)) {
        const cards = stackCardIds(ui.fanned);
        if (key === 'arrowleft' || key === 'arrowright') {
          event.preventDefault();
          const step = key === 'arrowright' ? 1 : -1;
          ui.setFanFocus(Math.max(0, Math.min(cards.length - 1, ui.fanFocus + step)));
          return;
        }
        if (key === 'enter' && cards[ui.fanFocus]) {
          event.preventDefault();
          pickFromFan(ui.fanned, cards[ui.fanFocus]);
          return;
        }
        if (key === 'escape') {
          ui.closeFan();
          return;
        }
      }

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
    // A tap of Space fans the selected stack out, or folds the fanned one up, like Quick Look.
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== ' ') return;
      const tapped = spaceAt !== undefined && performance.now() - spaceAt < SPACE_TAP_MS;
      spaceAt = undefined;
      if (!tapped || isTyping(event.target)) return;
      const ui = useUiStore.getState();
      if (ui.fanned) ui.closeFan();
      else {
        const stack = selectedStack();
        if (stack) openFan(stack);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
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
