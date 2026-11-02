import type { NodeProps } from '@xyflow/react';
import { AskSlot, TexLines } from '@/ai/AskSlot';
import { askedLine, replaceLine, useInlineAsk } from '@/ai/useInlineAsk';
import { useReadOnly } from '@/canvas/readOnly';
import { MathField } from '@/lib/math/MathField';
import { Tex } from '@/lib/math/Tex';
import type { NodeOf } from '@/model/types';
import { fromLinesBody, LINE_BREAK, linesBody, splitLines } from '../mathPlus/evaluate';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { mathAsk } from './ask';

/** The node's LaTeX with its line at `at` replaced by `latex`. */
const withLine = (source: string, at: number, latex: string) =>
  fromLinesBody(replaceLine(linesBody(source), at, latex, LINE_BREAK));

export default function MathNode({ id, data, selected }: NodeProps<NodeOf<'math'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'math'>(id);
  // `?` at the start of an empty line asks for maths in words; it goes in that line's place.
  const ask = useInlineAsk(mathAsk, {
    data,
    context: () => splitLines(data.latex),
    apply: (latex, at: number) => update({ latex: withLine(data.latex, at, latex) }),
  });
  const asking = ask.state.phase === 'closed' ? undefined : ask.state.at;
  const shown = linesBody(data.latex).split(LINE_BREAK);
  return (
    <NodeShell
      kind="math"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      className="min-w-24 px-3 py-2"
    >
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
        renderGhost={(latex) => <Tex latex={latex} className="text-[1.2rem]" />}
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
          placeholder="\text{math}"
        />
      </AskSlot>
    </NodeShell>
  );
}
