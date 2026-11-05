import type { NodeProps } from '@xyflow/react';
import { Copy, TriangleAlert } from 'lucide-react';
import { type CSSProperties, useMemo, useRef } from 'react';
import { AskSlot } from '@/ai/AskSlot';
import { CompleteSlot } from '@/ai/CompleteSlot';
import { askedLine, replaceLine, useInlineAsk } from '@/ai/useInlineAsk';
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
import {
  fromLinesBody,
  LINE_BREAK,
  type LineResult,
  type LinkInput,
  lineAt,
  linesBody,
  MATH_LINES,
  splitBody,
  splitLines,
} from './evaluate';
import { type LineBox, useLineBoxes } from './useLineBoxes';
import { resultsWith, useMathPlusInputs, useMathPlusResults } from './useMathPlusResults';

/** The node's LaTeX with its line at `at` replaced by `lines`. */
const withLines = (latex: string, at: number, lines: string[]) =>
  fromLinesBody(replaceLine(linesBody(latex), at, lines.join(LINE_BREAK), MATH_LINES));

export default function MathPlusNode({ id, data, selected }: NodeProps<NodeOf<'mathPlus'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'mathPlus'>(id);
  const results = useMathPlusResults(id);
  const inputs = useMathPlusInputs(id);
  // `?` at the start of an empty line asks for lines in words; they go in that line's place.
  const linked = () => inputs.flatMap(({ name, value }) => (value === null ? [] : [{ name, value }]));
  const ask = useInlineAsk(mathPlusAsk, {
    data,
    context: () => ({ lines: splitLines(data.latex), inputs: linked() }),
    apply: (lines, at: number) => update({ latex: withLines(data.latex, at, lines) }),
  });
  // Tab asks for the rest of the line at the caret, shown under the field.
  const complete = useInlineComplete(mathPlusComplete, { data, context: () => ({ inputs: linked() }) });
  const fieldHost = useRef<HTMLDivElement>(null);
  const boxes = useLineBoxes(fieldHost, data.latex);
  const asking = ask.state.phase === 'closed' ? undefined : ask.state.at;

  return (
    <NodeShell
      kind="mathPlus"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      className="min-w-56"
    >
      <InputChips id={id} />
      <div className="flex items-stretch">
        <div ref={fieldHost} className="min-w-0 flex-1 px-3 py-2">
          <CompleteSlot
            complete={complete}
            at={0}
            renderGhost={(latex, caret) => <Tex latex={lineAt(latex, caret).line} />}
          >
            <AskSlot
              ask={ask}
              placeholder="Describe the lines"
              renderGhost={(lines) =>
                asking !== undefined && <AnswerLines id={id} latex={data.latex} at={asking} lines={lines} />
              }
            >
              <MathField
                value={data.latex}
                onChange={(latex) => {
                  const line = askedLine(linesBody(data.latex), linesBody(latex), MATH_LINES);
                  if (!line || !ask.open(line.index)) update({ latex });
                }}
                menuNodeId={id}
                readOnly={readOnly}
                multiline
                placeholder="a := 2"
              />
            </AskSlot>
          </CompleteSlot>
        </div>
        <Answers results={results} latex={data.latex} boxes={boxes} />
      </div>
    </NodeShell>
  );
}

/**
 * The answers, in a column to the right of the lines, each level with its own line (like Soulver): `boxes` say
 * where the lines are, and an answer belongs to the line that holds something, in order.
 */
function Answers({
  results,
  latex,
  boxes,
}: {
  results: LineResult[] | undefined;
  latex: string;
  boxes: (LineBox | undefined)[];
}) {
  if (results === undefined)
    return <p className="self-center px-3 text-xs text-muted italic">Loading math engine…</p>;
  const lines = splitBody(linesBody(latex));
  const filled = lines.flatMap((line, index) => (line.trim() ? [index] : []));
  // The field's padding above its first line (py-2) is the column's too, so tops line up.
  let bottom = 0;
  return (
    <ol className="m-0 flex list-none flex-col border-l border-border bg-surface-2/50 px-3 py-2 text-sm">
      {results.map((result, index) => {
        const box = boxes[filled[index] ?? -1];
        // Until the field has been measured, answers stack in a row each.
        const top = box ? Math.max(0, box.top - bottom) : 0;
        if (box) bottom = box.top + Math.max(box.height, MIN_ROW);
        return (
          <ResultLine
            // biome-ignore lint/suspicious/noArrayIndexKey: results are positional, one per input line.
            key={index}
            result={result}
            style={box ? { marginTop: top, minHeight: box.height } : undefined}
          />
        );
      })}
    </ol>
  );
}

/** A row's least height, so two answers never overlap. */
const MIN_ROW = 28;

/** Offered lines, each with the result Math+ will give it once they are in, links and all. */
function AnswerLines({ id, latex, at, lines }: { id: string; latex: string; at: number; lines: string[] }) {
  const engine = useEngine();
  const results = useMemo(
    () => (engine ? resultsWith(engine.ce, useCanvasStore.getState(), id, withLines(latex, at, lines)) : []),
    [engine, id, latex, at, lines],
  );
  // Results are for the lines that hold something.
  const offset = splitBody(linesBody(latex))
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

function ResultLine({ result, style }: { result: LineResult; style?: CSSProperties }) {
  if (result.error) {
    return (
      <li style={style} className="flex items-center gap-1.5 text-xs text-danger">
        <TriangleAlert className="size-3.5" /> {result.error}
      </li>
    );
  }
  // The lines above the answer of a system: it is below them.
  if (result.solved && result.value === null) {
    return (
      <li aria-hidden style={style} className="flex min-h-7 items-center text-muted">
        ↓
      </li>
    );
  }
  const copyButton =
    'nodrag cursor-pointer rounded p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 [@media(hover:none)]:opacity-100';
  return (
    <li style={style} className="group flex min-h-7 items-center gap-2">
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
