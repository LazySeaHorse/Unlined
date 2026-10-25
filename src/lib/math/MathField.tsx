import { type Keybinding, MathfieldElement } from 'mathlive';
import 'mathlive/fonts.css';
import { Sigma, Type } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { WithTooltip } from '@/ui/Button';
import { registerMathField } from './fields';
import { inkBackground, inkColor } from './ink';
import { flattenDisplaylines } from './normalize';

// Fonts come from the bundled CSS above; no keyboard click sounds.
MathfieldElement.fontsDirectory = null;
MathfieldElement.soundsDirectory = null;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'math-field': DetailedHTMLProps<HTMLAttributes<MathfieldElement>, MathfieldElement>;
    }
  }
}

interface MathFieldProps {
  value: string;
  onChange?: (latex: string) => void;
  readOnly?: boolean;
  /** Shift+Enter inserts a line break. */
  multiline?: boolean;
  placeholder?: string;
  /** While focused and empty, shows a button that switches the field between math and text (the `"` key). */
  modeToggle?: boolean;
  /** The node whose context menu acts on this field (canvas/mathMenu.ts): a node's one field, not a cell's. */
  menuNodeId?: string;
  className?: string;
}

/** React wrapper around MathLive's `<math-field>` web component. */
export function MathField({
  value,
  onChange,
  readOnly = false,
  multiline = false,
  placeholder,
  modeToggle = false,
  menuNodeId,
  className,
}: MathFieldProps) {
  const ref = useRef<MathfieldElement>(null);
  const [focused, setFocused] = useState(false);
  const [textMode, setTextMode] = useState(false);
  const emitChange = useEffectEvent((latex: string) => onChange?.(flattenDisplaylines(latex)));

  useEffect(() => {
    const field = ref.current;
    // MathLive's parser throws on nested \displaylines (see normalize.ts), so the field takes LaTeX flattened,
    // as it gives it (emitChange), whatever wrote it: an import, the AI, a sync. Like with like, or the caret jumps.
    const latex = flattenDisplaylines(value);
    if (!field || flattenDisplaylines(field.value) === latex) return;
    try {
      // The value is LaTeX, read as math whatever mode the caret was left in: left in text (the end of a
      // `\text{…}`), MathLive would type the new LaTeX in as literal characters.
      field.setValue(latex, { silenceNotifications: true, mode: 'math' });
    } catch (error) {
      // A value MathLive cannot parse must not take the whole canvas down with this one node.
      console.error('Could not load math into the field', error);
    }
  }, [value]);

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.readOnly = readOnly;
    field.mathVirtualKeyboardPolicy = 'manual';
    // The canvas context menu replaces MathLive's (see canvas/mathMenu.ts).
    field.menuItems = [];
    if (placeholder) field.placeholder = placeholder;
  }, [readOnly, placeholder]);

  useEffect(() => {
    const field = ref.current;
    if (field && menuNodeId) return registerMathField(menuNodeId, field);
  }, [menuNodeId]);

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    const colorMap = field.colorMap;
    const backgroundColorMap = field.backgroundColorMap;
    field.colorMap = (name) => inkColor(name) ?? colorMap(name);
    field.backgroundColorMap = (name) => inkBackground(name) ?? backgroundColorMap(name);
    // Undo is the canvas's (canvas-history): one history for every edit, in the order they were made.
    const command = (k: Keybinding) => (Array.isArray(k.command) ? k.command[0] : k.command);
    field.keybindings = field.keybindings.filter((k) => command(k) !== 'undo' && command(k) !== 'redo');
  }, []);

  useEffect(() => {
    const field = ref.current;
    if (!field) return;
    const handleInput = () => emitChange(field.value);
    // Typing in a field selects its node (NodeShell), so Escape hands the keys back to it (Ctrl+D, Ctrl+C...).
    const node = () => field.closest<HTMLElement>('.react-flow__node');
    const syncMode = () => setTextMode(field.mode === 'text');
    const handleBlur = () => setFocused(false);
    const handleFocus = () => {
      setFocused(true);
      syncMode();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && field.mode !== 'latex') {
        event.preventDefault();
        event.stopPropagation();
        node()?.focus();
        return;
      }
      if (multiline && event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        field.executeCommand(['insert', '\\\\']);
      }
    };
    field.addEventListener('input', handleInput);
    field.addEventListener('focus', handleFocus);
    field.addEventListener('blur', handleBlur);
    field.addEventListener('mode-change', syncMode);
    field.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      field.removeEventListener('input', handleInput);
      field.removeEventListener('focus', handleFocus);
      field.removeEventListener('blur', handleBlur);
      field.removeEventListener('mode-change', syncMode);
      field.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [multiline]);

  const field = (
    <math-field ref={ref} className={cn('nodrag nopan nowheel nokey canvas-history', className)} />
  );
  if (!modeToggle) return field;

  const toggleMode = () => {
    const el = ref.current;
    if (!el) return;
    el.mode = el.mode === 'text' ? 'math' : 'text';
    setTextMode(el.mode === 'text');
    el.focus();
  };
  const showToggle = focused && !readOnly && value === '';
  // nodrag/nopan/nowheel/nokey stop React Flow from treating interaction with the field as canvas input.
  return (
    <div className="relative">
      {field}
      {showToggle && (
        <WithTooltip label={`${textMode ? 'Text' : 'Math'} mode. Press " to switch`}>
          <button
            type="button"
            aria-label={textMode ? 'Switch to math mode' : 'Switch to text mode'}
            // Keep the caret in the field: a mousedown on a button would take focus away.
            onMouseDown={(event) => event.preventDefault()}
            onClick={toggleMode}
            className="nodrag nopan absolute top-1/2 right-1 flex size-5 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md text-muted hover:bg-accent/10"
          >
            {textMode ? <Type className="size-3.5" /> : <Sigma className="size-3.5" />}
          </button>
        </WithTooltip>
      )}
    </div>
  );
}
