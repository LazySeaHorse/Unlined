import type { NodeProps } from '@xyflow/react';
import { AskSlot } from '@/ai/AskSlot';
import { useInlineAsk } from '@/ai/useInlineAsk';
import { useReadOnly } from '@/canvas/readOnly';
import { MathField } from '@/lib/math/MathField';
import { Tex } from '@/lib/math/Tex';
import type { NodeOf } from '@/model/types';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { mathAsk } from './ask';

export default function MathNode({ id, data, selected }: NodeProps<NodeOf<'math'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'math'>(id);
  const ask = useInlineAsk(mathAsk, {
    data,
    context: () => null,
    apply: (latex, _at: 0) => update({ latex }),
  });
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
        at={0}
        renderGhost={(latex) => <Tex latex={latex} className="text-[1.2rem]" />}
        className="ask-fit"
      >
        <MathField
          value={data.latex}
          onChange={(latex) => {
            if (!ask.trigger(0, data.latex, latex)) update({ latex });
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
