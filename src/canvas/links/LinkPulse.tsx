import { useEffect, useRef } from 'react';
import { motionOK } from '@/motion/motion';
import { useMathPlusResults } from '@/nodes/mathPlus/useMathPlusResults';

/** How long the dot takes to run the length of the link. */
const PULSE_S = 0.5;

/**
 * A dot that runs once along a link from one Math+ node to another whenever the source's result changes, to show
 * the new value travelling to where it is used. SMIL, so it follows the path as drawn; idle until triggered.
 */
export function LinkPulse({ sourceId, path }: { sourceId: string; path: string }) {
  const results = useMathPlusResults(sourceId);
  const value = results?.map((r) => r.error ?? r.value ?? '').join('\n');
  const last = useRef<string | undefined>(undefined);
  const seen = useRef(false);
  const motion = useRef<SVGAnimateMotionElement>(null);
  const fade = useRef<SVGAnimateElement>(null);

  useEffect(() => {
    if (results === undefined) return;
    const changed = seen.current && value !== last.current;
    seen.current = true;
    last.current = value;
    if (!changed || !motionOK()) return;
    motion.current?.beginElement();
    fade.current?.beginElement();
  }, [results, value]);

  return (
    <circle r={3.5} className="link-pulse" opacity={0}>
      <animateMotion
        ref={motion}
        dur={`${PULSE_S}s`}
        begin="indefinite"
        path={path}
        calcMode="spline"
        keySplines="0.16 1 0.3 1"
        keyTimes="0;1"
        keyPoints="0;1"
      />
      <animate
        ref={fade}
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.15;0.8;1"
        dur={`${PULSE_S}s`}
        begin="indefinite"
      />
    </circle>
  );
}
