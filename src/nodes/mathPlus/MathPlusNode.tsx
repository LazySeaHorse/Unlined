import type { NodeProps } from '@xyflow/react';
import { Copy, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { AskSlot } from '@/ai/AskSlot';
import { askedLine, replaceLine, useInlineAsk } from '@/ai/useInlineAsk';
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
import { mathPlusAsk } from './ask';
import {
  fromLinesBody,
  LINE_BREAK,
  type LineResult,
  type LinkInput,
  linesBody,
  splitLines,
} from './evaluate';
import { resultsWith, useMathPlusInputs, useMathPlusResults } from './useMathPlusResults';

/** The node's LaTeX with its line at `at` replaced by `lines`. */
const withLines = (latex: string, at: number, lines: string[]) =>
  fromLinesBody(replaceLine(linesBody(latex), at, lines.join(LINE_BREAK), LINE_BREAK));

export default function MathPlusNode({ id, data, selected }: NodeProps<NodeOf<'mathPlus'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'mathPlus'>(id);
  const results = useMathPlusResults(id);
  const inputs = useMathPlusInputs(id);
  // `?` at the start of an empty line asks for lines in words; they go in that line's place.
  const ask = useInlineAsk(mathPlusAsk, {
    context: () => ({
      lines: splitLines(data.latex),
      inputs: inputs.flatMap(({ name, value }) => (value === null ? [] : [{ name, value }])),
    }),
    apply: (lines, at: number) => update({ latex: withLines(data.latex, at, lines) }),
  });
  const asking = ask.state.phase === 'closed' ? undefined : ask.state.at;
  const shown = linesBody(data.latex).split(LINE_BREAK);

  return (
    <NodeShell
      kind="mathPlus"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      className="min-w-56"
    >
      <InputChips id={id} />
      <div className="px-3 py-2">
        <AskSlot
          ask={ask}
          lines={
            asking === undefined
              ? undefined
              : {
                  above: <TexLines lines={shown.slice(0, asking)} />,
                  below: <TexLines lines={shown.slice(asking + 1)} />,
                }
          }
          renderGhost={(lines) =>
            asking !== undefined && <AnswerLines id={id} latex={data.latex} at={asking} lines={lines} />
          }
        >
          <MathField
            value={data.latex}
            onChange={(latex) => {
              const line = askedLine(linesBody(data.latex), linesBody(latex), LINE_BREAK);
              if (!line || !ask.open(line.index)) update({ latex });
            }}
            menuNodeId={id}
            readOnly={readOnly}
            multiline
            placeholder="a := 2"
          />
        </AskSlot>
      </div>
      {results === undefined ? (
        <p className="border-t border-border px-3 py-2 text-xs text-muted italic">Loading math engine…</p>
      ) : (
        results.length > 0 && (
          <ol className="border-t border-border bg-surface-2/50 px-3 py-2 text-sm">
            {results.map((result, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: results are positional, one per input line.
              <ResultLine key={index} result={result} />
            ))}
          </ol>
        )
      )}
    </NodeShell>
  );
}

/** Lines of the field as they look while it gives way to an ask. */
function TexLines({ lines }: { lines: string[] }) {
  return lines.map((line, index) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: lines are positional.
    <div key={index} className="min-h-6">
      <Tex latex={line} />
    </div>
  ));
}

/** Offered lines, each with the result Math+ will give it once they are in, links and all. */
function AnswerLines({ id, latex, at, lines }: { id: string; latex: string; at: number; lines: string[] }) {
  const engine = useEngine();
  const results = useMemo(
    () => (engine ? resultsWith(engine.ce, useCanvasStore.getState(), id, withLines(latex, at, lines)) : []),
    [engine, id, latex, at, lines],
  );
  // Results are for the lines that hold something.
  const offset = linesBody(latex)
    .split(LINE_BREAK)
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
      <li className="flex items-center gap-1.5 text-xs text-danger">
        <TriangleAlert className="size-3.5" /> {result.error}
      </li>
    );
  }
  const copyButton =
    'nodrag cursor-pointer rounded p-1 text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:bg-surface-2 hover:text-fg focus-visible:opacity-100 [@media(hover:none)]:opacity-100';
  return (
    <li className="group flex min-h-7 items-center gap-2">
      <span className="text-muted">=</span>
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
