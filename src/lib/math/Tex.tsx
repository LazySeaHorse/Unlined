import katex from 'katex';
import { memo, useLayoutEffect, useRef } from 'react';
import { inkElements } from './ink';

/** Commands MathLive and the compute engine write that KaTeX has no definition for (it would draw them red). */
export const KATEX_MACROS = {
  '\\exponentialE': '\\mathrm{e}',
  '\\imaginaryI': '\\mathrm{i}',
  '\\imaginaryJ': '\\mathrm{j}',
  '\\differentialD': '\\mathrm{d}',
  '\\capitalDifferentialD': '\\mathrm{D}',
};

/** Static KaTeX rendering of a LaTeX string. */
export const Tex = memo(function Tex({ latex, className }: { latex: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    katex.render(latex, element, { throwOnError: false, macros: { ...KATEX_MACROS }, output: 'html' });
    inkElements(element);
  }, [latex]);
  return <span ref={ref} className={className} />;
});
