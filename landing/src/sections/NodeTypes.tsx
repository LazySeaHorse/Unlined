import { ALL_KINDS, KIND_META, type Kind } from '@landing/components/mock/Chrome';
import {
  CodeNode,
  GraphNode,
  ImageNode,
  MathNode,
  MathPlusNode,
  PdfNode,
  SectionNode,
  SheetNode,
  Sup,
  TableNode,
  TextNode,
  V,
  VideoNode,
  WebNode,
} from '@landing/components/mock/nodes';
import { Reveal } from '@landing/components/Reveal';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

const BLURB: Record<Kind, string> = {
  text: 'Write notes in Markdown with inline LaTeX math.',
  math: 'Typeset LaTeX formulas for clean problem statements and proofs.',
  mathPlus: 'Evaluate expressions to exact fractions and decimals. Shared variables pass from top to bottom.',
  graph: 'Plot functions, equations and inequalities on one coordinate grid.',
  table: 'Format mathematical cells with integrals, sums, and matrix notation.',
  sheet: 'Spreadsheet with exact fractions. Run row and column operations for matrix reductions.',
  code: 'Execute sandboxed JavaScript on the canvas without network access.',
  image: 'Add reference diagrams. Scale and position them beside your notes.',
  video: 'Embed lecture videos that play while you solve problems.',
  web: 'Browse online documentation, course pages, and calculators on the canvas.',
  pdf: 'Open local PDFs. Pin pages into strips, view text, and pop pages out as images.',
  section: 'Group related nodes into titled, colored sections with Ctrl+G.',
};

function NodeStage({ kind }: { kind: Kind }) {
  switch (kind) {
    case 'text':
      return <TextNode />;
    case 'math':
      return <MathNode />;
    case 'mathPlus':
      return <MathPlusNode />;
    case 'graph':
      return <GraphNode />;
    case 'table':
      return <TableNode />;
    case 'sheet':
      return <SheetNode />;
    case 'code':
      return <CodeNode />;
    case 'image':
      return <ImageNode />;
    case 'video':
      return <VideoNode />;
    case 'web':
      return <WebNode />;
    case 'pdf':
      return <PdfNode />;
    case 'section':
      return (
        <SectionNode title="Derivations" color="blue" className="h-[280px] w-[320px]">
          <div className="flex flex-col gap-2.5 p-1">
            <div className="rounded-md border border-border bg-surface p-2.5 shadow-xs">
              <div className="tex text-[15px] text-fg">
                <V>e</V>
                <Sup>
                  <V>i</V>π
                </Sup>{' '}
                + 1 = 0
              </div>
            </div>
            <p className="text-xs text-muted">
              Press <kbd className="kbd text-[10px]">Ctrl</kbd>+<kbd className="kbd text-[10px]">G</kbd> to
              wrap selected nodes in a section.
            </p>
          </div>
        </SectionNode>
      );
  }
}

export function NodeTypes() {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const page = (dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const card = el.querySelector('li')?.getBoundingClientRect().width ?? 400;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * (card + 20), behavior: reduce ? 'auto' : 'smooth' });
  };

  return (
    <section id="nodes" className="relative border-t border-line bg-canvas py-20 sm:py-28">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <h2 className="font-display text-[clamp(2rem,3.9vw,3.1rem)] leading-[0.98] font-medium tracking-[-0.03em] text-fg">
                Eleven kinds of node.
                <br />
                <span className="text-muted">Plus sections to organize them.</span>
              </h2>
              <p className="mt-4 max-w-[60ch] text-[15.5px] leading-[1.6] text-muted">
                Reference PDFs, LaTeX math, evaluated CAS formulas, function graphs, and linear algebra
                sheets. Pick a tool. Double-click the canvas to place it.
              </p>
            </div>
            <div className="flex gap-2">
              {([-1, 1] as const).map((dir) => (
                <button
                  key={dir}
                  type="button"
                  aria-label={dir === -1 ? 'Previous nodes' : 'Next nodes'}
                  disabled={dir === -1 ? edge.start : edge.end}
                  onClick={() => page(dir)}
                  className="grid size-10 cursor-pointer place-items-center rounded-xl border border-line bg-surface text-fg transition-colors hover:bg-surface-2 disabled:pointer-events-none disabled:opacity-40"
                >
                  {dir === -1 ? <ArrowLeft className="size-4" /> : <ArrowRight className="size-4" />}
                </button>
              ))}
            </div>
          </div>
        </Reveal>

        <Reveal delay={0.08} className="mt-10">
          <ul
            ref={track}
            onScroll={measure}
            className="-mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto scroll-smooth px-4 pb-2 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden"
          >
            {ALL_KINDS.map((kind) => {
              const meta = KIND_META[kind];
              return (
                <li
                  key={kind}
                  className="w-[min(88vw,25rem)] shrink-0 snap-start scroll-ml-4 overflow-hidden rounded-xl border border-line bg-surface sm:scroll-ml-6"
                >
                  <div
                    aria-hidden
                    className={cn(
                      'canvas-grid pointer-events-none grid h-[22rem] place-items-center overflow-hidden border-b border-line bg-canvas select-none',
                    )}
                  >
                    <NodeStage kind={kind} />
                  </div>
                  <div className="p-5">
                    <div className="flex items-center gap-2.5">
                      <span className="grid size-8 place-items-center rounded-lg bg-accent/10 text-accent">
                        <meta.icon className="size-4" strokeWidth={1.9} />
                      </span>
                      <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-fg">
                        {meta.label}
                      </h3>
                    </div>
                    <p className="mt-3 text-[14px] leading-[1.55] text-muted">{BLURB[kind]}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
