import type { NodeProps } from '@xyflow/react';
import { Plus, X } from 'lucide-react';
import { Coordinates, Mafs, Plot, Point, usePaneContext, useTransformContext, vec } from 'mafs';
import 'mafs/core.css';
import { Popover } from 'radix-ui';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AskSlot } from '@/ai/AskSlot';
import { CompleteSlot } from '@/ai/CompleteSlot';
import { useInlineAsk } from '@/ai/useInlineAsk';
import { useInlineComplete } from '@/ai/useInlineComplete';
import { useReadOnly } from '@/canvas/readOnly';
import { type Engine, useEngine } from '@/lib/math/engine';
import { MathField } from '@/lib/math/MathField';
import { Tex } from '@/lib/math/Tex';
import { useElementSize } from '@/lib/useElementSize';
import type { GraphEquation, NodeOf, SectionColor } from '@/model/types';
import { ColorSwatches, linkSwatch } from '../ColorSwatches';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { graphAsk, graphComplete } from './ask';
import { newEquation } from './equations';
import { DEFAULT_BOX, fitBox, niceStep } from './fit';
import { implicitSegments, segmentsPath, shadedPath } from './implicit';
import { classifyRelation, type PlotFn, type PlotFn2, type Relation, type Where } from './relation';
import { restrictedPath } from './restricted';
import { useGraphView } from './view';

export default function GraphNode({ id, data, selected }: NodeProps<NodeOf<'graph'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'graph'>(id);
  const engine = useEngine();
  const plotRef = useRef<HTMLDivElement>(null);
  const { height } = useElementSize(plotRef);
  const { equations } = data;

  const setRow = (index: number, patch: Partial<GraphEquation>) =>
    update({ equations: equations.map((e, i) => (i === index ? { ...e, ...patch } : e)) });
  const ask = useInlineAsk(graphAsk, {
    data,
    context: () => equations,
    apply: (latex, index: number) => setRow(index, { latex }),
    // A row is something to tweak: the equation goes straight in, as typed text would.
    review: false,
  });
  // Tab asks for the rest of a row at the caret, shown under it.
  const complete = useInlineComplete(graphComplete, { data, context: () => undefined });

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
          aria-label="Add equation"
        >
          <Plus className="size-3.5" />
        </button>
      }
    >
      <ul className="shrink-0 divide-y divide-border border-b border-border">
        {equations.map(({ latex, color }, index) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are edited in place by position.
          <li key={index} className="flex flex-wrap items-center gap-x-2 px-3 py-1">
            <ColorDot color={color} onChange={readOnly ? undefined : (c) => setRow(index, { color: c })} />
            <CompleteSlot
              complete={complete}
              at={index}
              renderGhost={(row) => <Tex latex={row} className="text-base" />}
              className="order-last basis-full pl-4.5"
            >
              <AskSlot
                ask={ask}
                at={index}
                renderGhost={(answer) => <Tex latex={answer} className="text-base" />}
                className="min-w-0 flex-1"
              >
                <MathField
                  value={latex}
                  onChange={(value) => {
                    if (!ask.trigger(index, latex, value)) setRow(index, { latex: value });
                  }}
                  readOnly={readOnly}
                  placeholder="y=…"
                  className="min-w-0 flex-1 text-base"
                />
              </AskSlot>
            </CompleteSlot>
            {!readOnly && equations.length > 1 && (
              <button
                type="button"
                className="nodrag cursor-pointer rounded p-0.5 text-muted hover:text-fg"
                onClick={() => update({ equations: equations.filter((_, i) => i !== index) })}
                aria-label="Remove equation"
              >
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div
        ref={plotRef}
        role="application"
        aria-label="Graph"
        className="nodrag nopan nowheel min-h-0 flex-1"
        // Dragging, wheeling or keying the plot is the user taking the window: edits stop refitting it.
        onPointerMove={(e) => e.buttons === 1 && useGraphView.getState().markMoved(id)}
        onWheel={() => useGraphView.getState().markMoved(id)}
        onKeyDown={(e) => /^(Arrow|[+\-=_])/.test(e.key) && useGraphView.getState().markMoved(id)}
      >
        {engine && height > 0 && (
          <Plot2D
            id={id}
            engine={engine}
            equations={equations}
            height={height}
            equalAxes={data.equalAxes === true}
          />
        )}
      </div>
    </NodeShell>
  );
}

/**
 * Plots every row, in the window that fits them. It is fitted again as the equations change, until the user pans or
 * zooms; then it stays where they put it until Fit (right-click) or the axes setting asks for a fresh one. A new
 * window is a new Mafs, which starts again from its viewBox.
 */
function Plot2D({
  id,
  engine,
  equations,
  height,
  equalAxes,
}: {
  id: string;
  engine: Engine;
  equations: GraphEquation[];
  height: number;
  equalAxes: boolean;
}) {
  const compiled = useMemo(
    () => equations.map(({ latex }) => classifyRelation(engine, latex)),
    [engine, equations],
  );
  const moved = useGraphView((s) => s.moved[id] === true);
  const fits = useGraphView((s) => s.fits[id] ?? 0);
  const fitted = useMemo(() => fitBox(compiled), [compiled]);
  // While the rows do not parse the last window stays, rather than jumping back to the default and again.
  const shown = useRef<{ box: typeof DEFAULT_BOX; key: string }>({ box: DEFAULT_BOX, key: 'start' });
  if (!moved) {
    const box = fitted ?? (shown.current.key === 'start' ? DEFAULT_BOX : shown.current.box);
    shown.current = { box, key: `${box.x}/${box.y}/${fits}/${equalAxes}` };
  }
  const { box, key } = shown.current;
  return (
    <Mafs
      key={key}
      height={height}
      pan
      zoom={{ min: 0.0001, max: 10000 }}
      viewBox={{ x: box.x, y: box.y, padding: 0 }}
      preserveAspectRatio={equalAxes ? 'contain' : false}
    >
      <Axes />
      {compiled.map((relation, index) =>
        relation ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: one plot per row.
          <Curve key={index} relation={relation} color={linkSwatch(equations[index].color)} />
        ) : null,
      )}
    </Mafs>
  );
}

/** The curve's colour; pressing it opens the palette unless the node is read-only. */
function ColorDot({ color, onChange }: { color: SectionColor; onChange?: (color: SectionColor) => void }) {
  const dot = 'size-2.5 shrink-0 rounded-full';
  if (!onChange) return <span className={dot} style={{ background: linkSwatch(color) }} />;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Curve colour"
          className={`nodrag cursor-pointer ring-offset-2 ring-offset-transparent hover:ring-2 hover:ring-fg/25 ${dot}`}
          style={{ background: linkSwatch(color) }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="pop z-50 rounded-xl border border-border bg-surface p-2 shadow-xl"
        >
          <ColorSwatches value={color} onChange={onChange} links />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function Curve({ relation, color }: { relation: Relation; color: string }) {
  switch (relation.kind) {
    case 'y':
      return relation.where ? (
        <RestrictedCurve fn={relation.fn} where={relation.where} swapped={false} color={color} />
      ) : (
        <Plot.OfX y={relation.fn} color={color} />
      );
    case 'x':
      return relation.where ? (
        <RestrictedCurve fn={relation.fn} where={relation.where} swapped color={color} />
      ) : (
        <Plot.OfY x={relation.fn} color={color} />
      );
    case 'points':
      return (
        <>
          {relation.points.map(([x, y]) => (
            <Point key={`${x},${y}`} x={x} y={y} color={color} />
          ))}
        </>
      );
    case 'implicit':
      return <ImplicitCurve fn={relation.fn} color={color} />;
    case 'shade':
      return <ShadedArea fn={relation.fn} strict={relation.strict} color={color} />;
    case 'region':
      return <Plot.Inequality {...{ [relation.axis]: { [relation.op]: relation.fn } }} color={color} />;
  }
}

/** Fills where the function is positive and outlines its edge, dashed when the edge itself is excluded. */
function ShadedArea({ fn, strict, color }: { fn: PlotFn2; strict: boolean; color: string }) {
  const { xPaneRange, yPaneRange } = usePaneContext();
  const { fill, edge } = useMemo(
    () => ({
      fill: shadedPath(fn, xPaneRange, yPaneRange),
      edge: segmentsPath(implicitSegments(fn, xPaneRange, yPaneRange)),
    }),
    [fn, xPaneRange, yPaneRange],
  );
  const style = { vectorEffect: 'non-scaling-stroke', transform: 'var(--mafs-view-transform)' } as const;
  return (
    <>
      <path d={fill} style={{ ...style, fill: color, fillOpacity: 0.15, stroke: 'none' }} />
      <path
        d={edge}
        strokeWidth={2}
        strokeLinecap="round"
        style={{
          ...style,
          fill: 'none',
          stroke: color,
          strokeDasharray: strict ? 'var(--mafs-line-stroke-dash-style)' : undefined,
        }}
      />
    </>
  );
}

/** A curve drawn only where its restriction holds, over the part of the plane Mafs has panes for. */
function RestrictedCurve({
  fn,
  where,
  swapped,
  color,
}: {
  fn: PlotFn;
  where: Where;
  swapped: boolean;
  color: string;
}) {
  const { xPaneRange, yPaneRange } = usePaneContext();
  const d = useMemo(
    () =>
      swapped
        ? restrictedPath(fn, where, true, yPaneRange, xPaneRange)
        : restrictedPath(fn, where, false, xPaneRange, yPaneRange),
    [fn, where, swapped, xPaneRange, yPaneRange],
  );
  return (
    <path
      d={d}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{
        fill: 'none',
        stroke: color,
        vectorEffect: 'non-scaling-stroke',
        transform: 'var(--mafs-view-transform)',
      }}
    />
  );
}

/** Traces the curve over the part of the plane Mafs has panes for, so it follows pan and zoom. */
function ImplicitCurve({ fn, color }: { fn: PlotFn2; color: string }) {
  const { xPaneRange, yPaneRange } = usePaneContext();
  const d = useMemo(
    () => segmentsPath(implicitSegments(fn, xPaneRange, yPaneRange)),
    [fn, xPaneRange, yPaneRange],
  );
  return (
    <path
      d={d}
      strokeWidth={2}
      strokeLinecap="round"
      style={{
        fill: 'none',
        stroke: color,
        vectorEffect: 'non-scaling-stroke',
        transform: 'var(--mafs-view-transform)',
      }}
    />
  );
}

/** The least room, in pixels, between grid lines on each axis (x labels are wider than y labels are tall). */
const GRID_PX = { x: 70, y: 36 };

/**
 * The axes with a grid step that suits the window: Mafs steps by 1 unless told otherwise, which is a thousand
 * crowded labels once the window spans thousands, and none at all once it spans hundredths. Follows pan and zoom.
 */
function Axes() {
  const { viewTransform } = useTransformContext();
  const [origin, unitX, unitY] = [
    vec.transform([0, 0], viewTransform),
    vec.transform([1, 0], viewTransform),
    vec.transform([0, 1], viewTransform),
  ];
  const xStep = niceStep(GRID_PX.x / Math.abs(unitX[0] - origin[0]));
  const yStep = niceStep(GRID_PX.y / Math.abs(unitY[1] - origin[1]));
  return (
    <>
      <Coordinates.Cartesian xAxis={{ lines: xStep }} yAxis={{ lines: yStep }} />
      <Rulers xStep={xStep} yStep={yStep} />
    </>
  );
}

/** A number as a grid label, without the dust of floating point (0.30000000000000004). */
const tickLabel = (n: number) => String(Number(n.toPrecision(10)));

/** The multiples of `step` from `lo` to `hi`. */
function multiples(lo: number, hi: number, step: number): number[] {
  const first = Math.ceil(lo / step - 1e-9);
  const last = Math.floor(hi / step + 1e-9);
  return Array.from({ length: Math.max(0, Math.min(last - first + 1, 200)) }, (_, i) => (first + i) * step);
}

/**
 * Rulers along the bottom and left edges, for when an axis has scrolled out of the window: its labels would be
 * out of sight with it, and nothing would say where you are. They stand in for the axis labels only while the
 * axis is off screen.
 */
function Rulers({ xStep, yStep }: { xStep: number; yStep: number }) {
  const { viewTransform } = useTransformContext();
  const anchor = useRef<SVGGElement>(null);
  // The visible part of Mafs' drawing space, read from the svg it is drawn in.
  const [view, setView] = useState<{ x: number; y: number; w: number; h: number }>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: the svg's viewBox follows the transform.
  useLayoutEffect(() => {
    const box = anchor.current?.ownerSVGElement?.viewBox.baseVal;
    if (!box) return;
    setView((old) =>
      old && old.x === box.x && old.y === box.y && old.w === box.width && old.h === box.height
        ? old
        : { x: box.x, y: box.y, w: box.width, h: box.height },
    );
  }, [viewTransform]);

  const origin = vec.transform([0, 0], viewTransform);
  const scaleX = vec.transform([1, 0], viewTransform)[0] - origin[0];
  const scaleY = vec.transform([0, 1], viewTransform)[1] - origin[1];
  const style = { fill: 'var(--mafs-origin-color)', paintOrder: 'stroke' } as const;
  const labels = [];
  if (view && scaleX !== 0 && scaleY !== 0) {
    const [x0, x1] = [view.x / scaleX, (view.x + view.w) / scaleX];
    const [y0, y1] = [(view.y + view.h) / scaleY, view.y / scaleY];
    if (y0 > 0 || y1 < 0)
      for (const x of multiples(x0, x1, xStep))
        labels.push(
          <text key={`x${x}`} x={x * scaleX} y={view.y + view.h - 6} textAnchor="middle" style={style}>
            {tickLabel(x)}
          </text>,
        );
    if (x0 > 0 || x1 < 0)
      for (const y of multiples(y0, y1, yStep)) {
        // Not on top of the bottom ruler's labels.
        if (y * scaleY > view.y + view.h - 22) continue;
        labels.push(
          <text key={`y${y}`} x={view.x + 6} y={y * scaleY} dominantBaseline="central" style={style}>
            {tickLabel(y)}
          </text>,
        );
      }
  }
  return (
    <g ref={anchor} className="mafs-axis">
      {labels}
    </g>
  );
}
