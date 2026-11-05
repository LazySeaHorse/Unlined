import type { NodeProps } from '@xyflow/react';
import { Copy, TriangleAlert } from 'lucide-react';
import type { MathfieldElement } from 'mathlive';
import { type KeyboardEvent, useMemo, useRef } from 'react';
import { flushSync } from 'react-dom';
import { AskSlot } from '@/ai/AskSlot';
import { CompleteSlot } from '@/ai/CompleteSlot';
import { readField } from '@/ai/completeField';
import { useInlineAsk } from '@/ai/useInlineAsk';
import { useInlineComplete } from '@/ai/useInlineComplete';
import { useReadOnly } from '@/canvas/readOnly';
import { copyText } from '@/lib/clipboard';
import { cn } from '@/lib/cn';
import { useEngine } from '@/lib/math/engine';
import { MathField } from '@/lib/math/MathField';
import { Tex } from '@/lib/math/Tex';
import type { NodeOf, Titled } from '@/model/types';
import { useCanvasStore } from '@/store/canvasStore';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { mathPlusAsk, mathPlusComplete } from './ask';
import { type LineResult, type LinkInput, lineAt, splitLines } from './evaluate';
import { around, atTopLevel, editRow, joinUp, latexOf, rowsOf, splitRow, withLines } from './rows';
import { resultsWith, useMathPlusInputs, useMathPlusResults } from './useMathPlusResults';

/** Where the caret goes in a row once it has been written: its start, its end, or an offset in MathLive's own count. */
type Caret = 'start' | 'end' | number;

export default function MathPlusNode({ id, data, selected }: NodeProps<NodeOf<'mathPlus'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'mathPlus'>(id);
  const results = useMathPlusResults(id);
  const inputs = useMathPlusInputs(id);
  const rows = rowsOf(data.latex);
  // `?` in an empty row asks for lines in words; they go in that row's place.
  const linked = () => inputs.flatMap(({ name, value }) => (value === null ? [] : [{ name, value }]));
  const ask = useInlineAsk(mathPlusAsk, {
    data,
    context: () => ({ lines: splitLines(data.latex), inputs: linked() }),
    apply: (lines, at: number) => update({ latex: withLines(data.latex, at, lines) }),
  });
  // Tab asks for the rest of the line at the caret, shown under the row.
  const complete = useInlineComplete(mathPlusComplete, { data, context: () => ({ inputs: linked() }) });
  const asking = ask.state.phase === 'closed' ? undefined : ask.state.at;

  // Each row is a field of its own.
  const fields = useRef<(MathfieldElement | null)[]>([]);
  // A row just made takes focus once MathLive has mounted it, not before.
  const mounted = useRef(new WeakSet<MathfieldElement>());
  const place = (row: number, caret: Caret) => {
    const field = fields.current[row];
    if (!field) return;
    if (!mounted.current.has(field)) {
      field.addEventListener('mount', () => place(row, caret), { once: true });
      return;
    }
    field.focus();
    field.position = caret === 'end' ? field.lastOffset : caret === 'start' ? 0 : caret;
  };
  // Written and drawn at once, so that the next key already lands in the row the caret was moved to.
  const write = (next: { rows: string[]; row: number }, caret: Caret) => {
    flushSync(() => update({ latex: latexOf(next.rows) }));
    // After the key that caused it is through, or the field it came from takes the focus back.
    setTimeout(() => place(next.row, caret));
  };

  const keyDown = (row: number) => (event: KeyboardEvent) => {
    const field =
      event.target instanceof HTMLElement && event.target.tagName === 'MATH-FIELD' ? event.target : undefined;
    if (!field || readOnly) return;
    const math = field as MathfieldElement;
    if (math.mode === 'latex' || !math.selectionIsCollapsed || event.ctrlKey || event.metaKey || event.altKey)
      return;
    const stop = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    if (event.key === 'Enter') {
      stop();
      const before = math.getValue(0, math.position, 'latex');
      // From inside a fraction or a bracket the row cannot be cut in two; a new row follows it instead.
      if (atTopLevel(before))
        write(
          splitRow(rows, row, before.trim(), math.getValue(math.position, math.lastOffset, 'latex').trim()),
          'start',
        );
      else write(splitRow(rows, row, math.value.trim(), ''), 'start');
    } else if (event.key === 'Backspace' && row > 0 && math.position === 0) {
      stop();
      write(joinUp(rows, row), fields.current[row - 1]?.lastOffset ?? 'end');
    } else if (event.key === 'Delete' && row < rows.length - 1 && math.position === math.lastOffset) {
      stop();
      write(joinUp(rows, row + 1), math.lastOffset);
    }
  };

  // Past the edge of a row, the arrow keys go to the row next to it.
  const moveOut = (row: number) => (direction: 'forward' | 'backward' | 'upward' | 'downward') => {
    const to = direction === 'forward' || direction === 'downward' ? row + 1 : row - 1;
    if (!fields.current[to]) return false;
    place(to, direction === 'forward' ? 'start' : direction === 'backward' ? 'end' : 'end');
    return true;
  };

  // Answers are for the rows that hold something, in order.
  let answered = 0;
  const shown = results !== undefined && results.length > 0;

  return (
    <NodeShell
      kind="mathPlus"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      className="min-w-56"
    >
      <InputChips id={id} />
      <div className={cn('grid', shown ? 'grid-cols-[minmax(0,1fr)_auto]' : 'grid-cols-1')}>
        {rows.map((row, index) => {
          const result = row.trim() ? results?.[answered++] : undefined;
          const last = index === rows.length - 1;
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional, one per line.
            <div key={index} className="contents">
              <div
                className={cn('min-w-0 px-3 py-1.5', !last && 'border-b border-border/50')}
                onKeyDownCapture={keyDown(index)}
              >
                <CompleteSlot
                  complete={complete}
                  at={index}
                  read={(target) => {
                    const field = readField(target);
                    return field && { ...field, ...around(rows, index, field.before, field.after) };
                  }}
                  renderGhost={(latex, caret) => <Tex latex={lineAt(latex, caret).line} />}
                >
                  <AskSlot
                    ask={ask}
                    at={index}
                    placeholder="Describe the lines"
                    renderGhost={(lines) =>
                      asking !== undefined && (
                        <AnswerLines id={id} latex={data.latex} at={asking} lines={lines} />
                      )
                    }
                  >
                    <MathField
                      value={row}
                      fieldRef={(field) => {
                        fields.current[index] = field;
                        if (field && !mounted.current.has(field)) {
                          const known = mounted.current;
                          field.addEventListener('mount', () => known.add(field), { once: true });
                        }
                      }}
                      onChange={(latex) => {
                        if (ask.trigger(index, row, latex)) return;
                        const edited = editRow(rows, index, latex);
                        // Math pasted in as several lines is several rows now: the caret goes to the end of them.
                        if (edited.rows.length === rows.length) update({ latex: latexOf(edited.rows) });
                        else write(edited, 'end');
                      }}
                      onMoveOut={moveOut(index)}
                      menuNodeId={id}
                      readOnly={readOnly}
                      placeholder={rows.length === 1 ? 'a := 2' : undefined}
                    />
                  </AskSlot>
                </CompleteSlot>
              </div>
              {shown && (
                <ol
                  className={cn(
                    'm-0 flex list-none items-center border-l border-border bg-surface-2/50 px-3 text-sm',
                    !last && 'border-b border-b-border/50',
                  )}
                >
                  {result && <ResultLine result={result} />}
                </ol>
              )}
            </div>
          );
        })}
      </div>
      {results === undefined && (
        <p className="border-t border-border px-3 py-2 text-xs text-muted italic">Loading math engine…</p>
      )}
    </NodeShell>
  );
}

/** Offered lines, each with the result Math+ will give it once they are in, links and all. */
function AnswerLines({ id, latex, at, lines }: { id: string; latex: string; at: number; lines: string[] }) {
  const engine = useEngine();
  const results = useMemo(
    () => (engine ? resultsWith(engine.ce, useCanvasStore.getState(), id, withLines(latex, at, lines)) : []),
    [engine, id, latex, at, lines],
  );
  // Results are for the lines that hold something.
  const offset = rowsOf(latex)
    .slice(0, at)
    .filter((line) => line.trim()).length;
  return lines.map((line, index) => {
    const value = results[offset + index]?.value;
    return (
      // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional.
      <div key={index} className="flex min-h-6 items-center gap-2">
        <Tex latex={line} />
        {value && (
          <>
            <span className="text-muted">⟶</span>
            <Tex latex={value} />
          </>
        )}
      </div>
    );
  });
}

/** The values links bring in, as `k = 5`: muted when the formulas do not read them, red when a link brings nothing. */
function InputChips({ id }: { id: string }) {
  const inputs = useMathPlusInputs(id);
  if (inputs.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1 px-3 pt-2">
      {inputs.map((input) => (
        <InputChip key={input.linkId} input={input} />
      ))}
    </ul>
  );
}

function InputChip({ input }: { input: LinkInput }) {
  const title = useCanvasStore(
    (s) => (s.nodes.find((n) => n.id === input.sourceId)?.data as Titled | undefined)?.title,
  );
  const name = input.name === 'ans' ? '\\mathrm{ans}' : input.name;
  return (
    <li
      title={`From ${title || 'Math+'}`}
      className={cn(
        'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
        input.error
          ? 'border-danger bg-danger/10 text-danger'
          : input.used
            ? 'border-accent/40 bg-accent/10 text-accent'
            : 'border-border text-muted opacity-60',
      )}
    >
      {input.error ? (
        <>
          <TriangleAlert className="size-3" /> {input.name}: {input.error}
        </>
      ) : (
        <Tex latex={`${name} = ${input.value}`} />
      )}
    </li>
  );
}

function ResultLine({ result }: { result: LineResult }) {
  if (result.error) {
    return (
      <li className="flex max-w-56 items-center gap-1.5 text-xs text-danger">
        <TriangleAlert className="size-3.5" /> {result.error}
      </li>
    );
  }
  // The lines above the answer of a system: it is below them.
  if (result.solved && result.value === null) {
    return (
      <li aria-hidden className="flex items-center text-muted">
        ↓
      </li>
    );
  }
  const copyButton =
    'nodrag cursor-pointer rounded p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 [@media(hover:none)]:opacity-100';
  return (
    <li className="group flex items-center gap-2">
      <span className="text-muted">{result.solved ? '⟹' : '='}</span>
      {/* Keyed by value: a new result settles in rather than swapping in place. */}
      <span key={result.value} className="result-tick">
        <Tex latex={result.value ?? ''} />
      </span>
      {result.approx && (
        <button
          type="button"
          className="nodrag cursor-pointer text-xs text-muted hover:text-fg"
          title="Copy approximate value"
          onClick={() => void copyText(result.approx ?? '', 'approximate value')}
        >
          ≈ {result.approx}
        </button>
      )}
      <button
        type="button"
        className={`${copyButton} ml-auto`}
        aria-label="Copy LaTeX"
        title="Copy LaTeX"
        onClick={() => void copyText(result.value ?? '', 'LaTeX')}
      >
        <Copy className="size-3.5" />
      </button>
    </li>
  );
}
