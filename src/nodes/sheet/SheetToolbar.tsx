import { useState } from 'react';
import { AskSlot } from '@/ai/AskSlot';
import { CompleteSlot } from '@/ai/CompleteSlot';
import type { InlineAsk } from '@/ai/useInlineAsk';
import type { InlineComplete } from '@/ai/useInlineComplete';
import { cn } from '@/lib/cn';
import type { SheetFormula } from './ask';

const field = 'min-w-0 flex-1 rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-fg';

/**
 * Name box and formula bar for the active cell, sized for the node's header. Edits land on the cell that
 * was active when typing began, even if the grid has moved on by the time the box loses focus.
 */
export function FormulaBar({
  label,
  cell,
  value,
  readOnly,
  onCommit,
  ask,
  complete,
}: {
  label: string;
  /** The active cell (`B5`), which an edit or an ask is for; empty when there is none. */
  cell: string;
  value: string;
  readOnly: boolean;
  onCommit: (text: string) => void;
  /** Typing `?` into the empty bar asks for a formula in words, for the active cell. */
  ask: InlineAsk<string, SheetFormula>;
  /** Tab asks for the rest of the bar at the caret, for the active cell. */
  complete: InlineComplete<string>;
}) {
  const [draft, setDraft] = useState<{ label: string; text: string } | null>(null);
  const shown = draft?.label === label ? draft.text : value;

  const commit = () => {
    if (draft && draft.text !== value) onCommit(draft.text);
    setDraft(null);
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <span className="w-14 shrink-0 truncate rounded border border-border bg-surface px-1.5 py-0.5 text-center text-xs font-medium text-muted">
        {(ask.state.phase === 'closed' ? label : ask.state.at) || '–'}
      </span>
      <span className="shrink-0 text-xs font-semibold text-muted italic">fx</span>
      <CompleteSlot complete={complete} at={cell}>
        <AskSlot
          ask={ask}
          placeholder="Describe the formula"
          renderGhost={({ formula, shown }) => (
            <span className="truncate px-2">
              {formula}
              <span className="text-muted"> → {shown}</span>
            </span>
          )}
        >
          <input
            aria-label="Formula bar"
            value={shown}
            readOnly={readOnly || !label}
            spellCheck={false}
            onChange={(e) => {
              if (!cell || !ask.trigger(cell, shown, e.target.value))
                setDraft({ label, text: e.target.value });
            }}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              if (e.key === 'Escape') setDraft(null);
            }}
            className={cn(field, 'outline-none placeholder:text-muted focus:border-accent')}
          />
        </AskSlot>
      </CompleteSlot>
    </div>
  );
}
