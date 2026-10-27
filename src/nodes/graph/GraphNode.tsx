import type { NodeProps } from '@xyflow/react';
import { Plus, X } from 'lucide-react';
import { Coordinates, Mafs, Plot } from 'mafs';
import 'mafs/core.css';
import { useMemo, useRef } from 'react';
import { useReadOnly } from '@/canvas/readOnly';
import { type Engine, useEngine } from '@/lib/math/engine';
import { MathField } from '@/lib/math/MathField';
import { useElementSize } from '@/lib/useElementSize';
import type { GraphEquation, NodeOf } from '@/model/types';
import { linkSwatch } from '../ColorSwatches';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { compileFunction } from './compileFunction';
import { newEquation } from './equations';

export default function GraphNode({ id, data, selected }: NodeProps<NodeOf<'graph'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'graph'>(id);
  const engine = useEngine();
  const plotRef = useRef<HTMLDivElement>(null);
  const { height } = useElementSize(plotRef);
  const { equations } = data;

  const setLatex = (index: number, latex: string) =>
    update({ equations: equations.map((e, i) => (i === index ? { ...e, latex } : e)) });

  return (
    <NodeShell
      kind="graph"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      resize={{ minWidth: 260, minHeight: 240 }}
      actions={
        <button
          type="button"
          className="cursor-pointer rounded p-1 hover:bg-surface hover:text-fg"
          onClick={() => update({ equations: [...equations, newEquation(equations)] })}
          aria-label="Add function"
        >
          <Plus className="size-3.5" />
        </button>
      }
    >
      <ul className="shrink-0 divide-y divide-border border-b border-border">
        {equations.map(({ latex, color }, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place by position.
          <li key={index} className="flex items-center gap-2 px-3 py-1">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: linkSwatch(color) }} />
            <span className="text-xs text-muted">y =</span>
            <MathField
              value={latex}
              onChange={(value) => setLatex(index, value)}
              readOnly={readOnly}
              className="min-w-0 flex-1 text-base"
            />
            {!readOnly && equations.length > 1 && (
              <button
                type="button"
                className="nodrag cursor-pointer rounded p-0.5 text-muted hover:text-fg"
                onClick={() => update({ equations: equations.filter((_, i) => i !== index) })}
                aria-label="Remove function"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div ref={plotRef} className="nodrag nopan nowheel min-h-0 flex-1">
        {engine && height > 0 && <Plot2D engine={engine} equations={equations} height={height} />}
      </div>
    </NodeShell>
  );
}

function Plot2D({
  engine,
  equations,
  height,
}: {
  engine: Engine;
  equations: GraphEquation[];
  height: number;
}) {
  const compiled = useMemo(
    () => equations.map(({ latex }) => compileFunction(engine, latex)),
    [engine, equations],
  );
  return (
    <Mafs height={height} pan zoom viewBox={{ x: [-5, 5], y: [-5, 5] }} preserveAspectRatio={false}>
      <Coordinates.Cartesian />
      {compiled.map((fn, index) =>
        // biome-ignore lint/suspicious/noArrayIndexKey: one plot per function slot.
        fn ? <Plot.OfX key={index} y={fn} color={linkSwatch(equations[index].color)} /> : null,
      )}
    </Mafs>
  );
}
