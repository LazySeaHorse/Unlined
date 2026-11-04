import { EdgeLabelRenderer, useStore } from '@xyflow/react';
import { useEffect, useMemo, useRef } from 'react';
import { LABEL_MAX } from '@/lib/links';
import { Tex } from '@/lib/math/Tex';
import { useCanvasStore } from '@/store/canvasStore';
import { useUiStore } from '@/store/uiStore';
import { useReadOnly } from '../readOnly';
import { editLink } from './actions';
import { type Geom, MIN_LABEL_PATH, type Pt, readableReverse, reversedPath, roundedPath } from './geometry';
import { hasMath, type LabelPart, measureLabel, placeLabel, splitLabel } from './labels';

/** Below this zoom labels are too small to read and only clutter. */
export const HIDE_BELOW_ZOOM = 0.3;
/** Gap between the line and the label, before counter-scaling. */
const GAP = 7;

/**
 * A label drawn along the longest stretch of a link, above it in reading direction and in the link's colour,
 * with a halo in the canvas colour so it stays readable over the grid and other links. Plain text follows the
 * path round bends (SVG text on a path, on the reversed path for right-to-left and downward stretches so it is
 * never upside down). KaTeX cannot bend, so a label with a formula is HTML at the middle of the stretch.
 */
export function LinkLabel({
  id,
  label,
  pts,
  geometry,
  color,
}: {
  id: string;
  label: string;
  pts: Pt[];
  geometry: Geom;
  /** The CSS colour of the link, for the HTML label that sits outside the link's own element. */
  color: string;
}) {
  const zoom = useStore((s) => s.transform[2]);
  const readOnly = useReadOnly();
  const math = hasMath(label);
  const reverse = readableReverse(geometry.dir);
  const pathId = `link-label-${id}`;
  const { text, center } = useMemo(
    () => (math ? { text: '', center: 0 } : placeLabel(label, geometry.total, geometry.pos, measureLabel)),
    [label, math, geometry.total, geometry.pos],
  );
  if (zoom < HIDE_BELOW_ZOOM || geometry.total < MIN_LABEL_PATH) return null;

  if (math)
    return (
      <MathLabel
        id={id}
        label={label}
        geometry={geometry}
        room={Math.max(geometry.longest - 16, 24)}
        color={color}
        editable={!readOnly}
      />
    );
  if (!text) return null;

  const offset = reverse ? geometry.total - center : center;
  return (
    <>
      <defs>
        <path id={pathId} d={reverse ? reversedPath(pts) : roundedPath(pts)} />
      </defs>
      {/* The halo is its own copy underneath: with paint-order on one element, each glyph's outline paints over
          the fill of the one before it where text follows a path. */}
      {[true, false].map((halo) => (
        <text
          key={String(halo)}
          className={halo ? 'link-label link-label-halo' : 'link-label'}
          dy={-GAP}
          textAnchor="middle"
          fontSize={12.5}
          style={halo ? { strokeWidth: 4.5 } : undefined}
        >
          <textPath href={`#${pathId}`} startOffset={offset}>
            {text}
          </textPath>
        </text>
      ))}
    </>
  );
}

/** A label with formulas in it: HTML at the middle of the longest stretch, turned to run along it. */
function MathLabel({
  id,
  label,
  geometry,
  room,
  color,
  editable,
}: {
  id: string;
  label: string;
  geometry: Geom;
  room: number;
  color: string;
  editable: boolean;
}) {
  const vertical = geometry.dir[0] === 0;
  const [x, y] = geometry.mid;
  return (
    <EdgeLabelRenderer>
      {/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: clicking the label does what clicking the link itself does. */}
      <div
        data-link-id={id}
        className="link-label link-label-math nodrag nopan"
        style={{
          transform: `translate(${x}px, ${y}px) ${vertical ? 'rotate(-90deg) ' : ''}translate(-50%, calc(-100% - ${GAP - 1}px))`,
          maxWidth: room,
          pointerEvents: editable ? 'all' : 'none',
          color,
        }}
        onClick={() =>
          useCanvasStore.getState().setSelection(
            () => false,
            (e) => e.id === id,
          )
        }
        onDoubleClick={() => useUiStore.getState().renameLink(id)}
      >
        <InlineTex parts={splitLabel(label)} />
      </div>
    </EdgeLabelRenderer>
  );
}

/** Plain text and typeset formulas in a row. */
export function InlineTex({ parts }: { parts: LabelPart[] }) {
  return (
    <>
      {parts.map((p, i) =>
        p.math ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional, they have no identity.
          <Tex key={i} latex={p.text} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: as above.
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

/**
 * The field that renames a link, over the middle of its longest stretch. Enter or clicking away keeps the
 * text (an empty one clears the label), Escape drops it. Nothing is saved when the text did not change.
 */
export function LinkLabelEditor({ id, value, geometry }: { id: string; value: string; geometry: Geom }) {
  const finished = useRef(false);
  const [x, y] = geometry.mid;
  const stop = () => useUiStore.getState().stopRenamingLink(id);
  const readOnly = useReadOnly();
  // The AI lock (or any reason to go read-only) ends the edit and throws the text away.
  useEffect(() => {
    if (!readOnly) return;
    finished.current = true;
    useUiStore.getState().stopRenamingLink(id);
  }, [readOnly, id]);
  const finish = (text: string | null) => {
    if (finished.current) return;
    finished.current = true;
    const next = text?.trim() ?? value;
    if (next !== value) editLink(id, { label: next || undefined });
    stop();
  };
  return (
    <EdgeLabelRenderer>
      <input
        // biome-ignore lint/a11y/noAutofocus: entering edit mode is an explicit user action.
        autoFocus
        aria-label="Link label"
        defaultValue={value}
        placeholder="Name this link ($math$ ok)"
        maxLength={LABEL_MAX}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={(e) => finish(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') finish(null);
        }}
        className="link-label-input nodrag nopan nokey"
        style={{ transform: `translate(${x}px, ${y}px) translate(-50%, -50%)` }}
      />
    </EdgeLabelRenderer>
  );
}
