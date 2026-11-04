import type { NodeProps } from '@xyflow/react';
import { AskSlot } from '@/ai/AskSlot';
import { CompleteSlot } from '@/ai/CompleteSlot';
import { askedLine, replaceLine, useInlineAsk } from '@/ai/useInlineAsk';
import { useInlineComplete } from '@/ai/useInlineComplete';
import { useReadOnly } from '@/canvas/readOnly';
import { MathField } from '@/lib/math/MathField';
import { Tex } from '@/lib/math/Tex';
import type { NodeOf } from '@/model/types';
import { fromLinesBody, lineAt, linesBody, MATH_LINES, splitLines } from '../mathPlus/evaluate';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { mathAsk, mathComplete } from './ask';

/** The node's LaTeX with its line at `at` replaced by `latex`. */
const withLine = (source: string, at: number, latex: string) =>
  fromLinesBody(replaceLine(linesBody(source), at, latex, MATH_LINES));

export default function MathNode({ id, data, selected }: NodeProps<NodeOf<'math'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'math'>(id);
  // `?` at the start of an empty line asks for maths in words; it goes in that line's place.
  const ask = useInlineAsk(mathAsk, {
    data,
    context: () => splitLines(data.latex),
    apply: (latex, at: number) => update({ latex: withLine(data.latex, at, latex) }),
  });
  // Tab asks for the rest of the line at the caret, shown under the field.
  const complete = useInlineComplete(mathComplete, { data, context: () => undefined });
  return (
    <NodeShell
      kind="math"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      className="min-w-24 px-3 py-2"
    >
      <CompleteSlot
        complete={complete}
        at={0}
        renderGhost={(latex, caret) => <Tex latex={lineAt(latex, caret).line} className="text-[1.2rem]" />}
      >
        <AskSlot
          ask={ask}
          placeholder="Describe the equation"
          renderGhost={(latex) => <Tex latex={latex} className="text-[1.2rem]" />}
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
            placeholder="\text{math}"
          />
        </AskSlot>
      </CompleteSlot>
    </NodeShell>
  );
}
