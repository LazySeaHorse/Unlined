import { useStore } from '@xyflow/react';
import { useMemo } from 'react';
import { HIDE_BELOW_ZOOM, InlineTex } from '@/canvas/links/LinkLabel';
import { hasMath, measureLabel, splitLabel } from '@/canvas/links/labels';
import type { GraphEquation } from '@/model/types';
import { linkSwatch } from '../ColorSwatches';
import type { Frame } from './hover';
import { NAME_GAP, type NameSpot, placeNames } from './names';
import type { Relation } from './relation';

/**
 * The names of the rows, written on the graph in each curve's colour with a halo in the canvas colour, like link
 * labels: along the curve for plain text (SVG text on a path), and as HTML turned to the curve's slope for a name
 * with a formula, since KaTeX cannot bend. It is drawn in the window's own pixels, over the plot, and does not take
 * the pointer, so panning and hovering go through it.
 */
export function NameLabels({
  id,
  frame,
  relations,
  rows,
}: {
  id: string;
  frame: Frame;
  relations: ReadonlyArray<Relation | null>;
  rows: readonly GraphEquation[];
}) {
  // The canvas's zoom, so names hide once they would be too small to read, like link labels.
  const zoom = useStore((s) => s.transform[2]);
  const names = rows.map((row) => row.name).join('\u0000');
  // biome-ignore lint/correctness/useExhaustiveDependencies: `names` stands for the names of `rows`.
  const spots = useMemo(
    () =>
      placeNames(
        relations,
        rows.map((row) => row.name),
        frame,
        measureLabel,
      ),
    [relations, names, frame],
  );
  if (zoom < HIDE_BELOW_ZOOM || spots.size === 0) return null;
  const entries = [...spots].map(([row, spot]) => ({
    row,
    spot,
    color: linkSwatch(rows[row].color),
    name: rows[row].name ?? '',
  }));
  return (
    <div aria-hidden data-graph-names="" className="pointer-events-none absolute inset-0 overflow-hidden">
      <svg
        role="presentation"
        width={frame.width}
        height={frame.height}
        className="absolute inset-0 overflow-visible"
      >
        {entries.map(({ row, spot, color }) => {
          if (spot.kind === 'along')
            return <AlongText key={row} id={`${id}-${row}`} spot={spot} color={color} />;
          if (spot.kind === 'beside' && spot.text) return <BesideText key={row} spot={spot} color={color} />;
          return null;
        })}
      </svg>
      {entries.map(({ row, spot, color, name }) =>
        spot.kind === 'tilted' || (spot.kind === 'beside' && !spot.text) ? (
          <FormulaName key={row} spot={spot} color={color} name={name} />
        ) : null,
      )}
    </div>
  );
}

function AlongText({
  id,
  spot,
  color,
}: {
  id: string;
  spot: Extract<NameSpot, { kind: 'along' }>;
  color: string;
}) {
  // Ids are page-wide, and several graphs can be on the canvas.
  const pathId = `graph-name-${id}`;
  return (
    <>
      <defs>
        <path id={pathId} d={spot.d} />
      </defs>
      {/* The halo is its own copy underneath: with paint-order on one element, each glyph's outline paints over the one before it where text follows a path. */}
      {[true, false].map((halo) => (
        <text
          key={String(halo)}
          className={halo ? 'link-label graph-name-halo' : 'link-label'}
          style={halo ? undefined : { color }}
          dy={-NAME_GAP}
          textAnchor="middle"
          fontSize={12.5}
        >
          <textPath href={`#${pathId}`} startOffset={spot.offset}>
            {spot.text}
          </textPath>
        </text>
      ))}
    </>
  );
}

function BesideText({ spot, color }: { spot: Extract<NameSpot, { kind: 'beside' }>; color: string }) {
  const x = spot.side === 'right' ? spot.x + 10 : spot.x - 10;
  return (
    <>
      {[true, false].map((halo) => (
        <text
          key={String(halo)}
          className={halo ? 'link-label graph-name-halo' : 'link-label'}
          style={halo ? undefined : { color }}
          x={x}
          y={spot.y}
          dominantBaseline="central"
          textAnchor={spot.side === 'right' ? 'start' : 'end'}
          fontSize={12.5}
        >
          {spot.text}
        </text>
      ))}
    </>
  );
}

/** A name with a formula in it, as HTML: along the curve's slope, or beside its point. */
function FormulaName({
  spot,
  color,
  name,
}: {
  spot: Extract<NameSpot, { kind: 'tilted' | 'beside' }>;
  color: string;
  name: string;
}) {
  if (!hasMath(name)) return null;
  const transform =
    spot.kind === 'tilted'
      ? `translate(${spot.x}px, ${spot.y}px) rotate(${spot.angle}deg) translate(-50%, calc(-100% - ${NAME_GAP - 1}px))`
      : `translate(${spot.side === 'right' ? spot.x + 10 : spot.x - 10}px, ${spot.y}px) translate(${spot.side === 'right' ? '0' : '-100%'}, -50%)`;
  return (
    <div
      data-graph-name=""
      className="link-label link-label-math graph-name-math"
      style={{ transform, color }}
    >
      <InlineTex parts={splitLabel(name)} />
    </div>
  );
}
