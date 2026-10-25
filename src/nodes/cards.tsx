import type { NodeProps } from '@xyflow/react';
import { type ComponentType, lazy, Suspense } from 'react';
import type { AppNode, CardNode } from '@/model/types';
import { ErrorBoundary, isStaleChunkError } from '@/ui/ErrorScreen';
import { Mascot } from '@/ui/Mascot';
import { ImageNode } from './image/ImageNode';
import { TextNode } from './text/TextNode';
import { VideoNode } from './video/VideoNode';
import { WebNode } from './web/WebNode';

/** One node failing to load or render must not take the whole canvas down. */
function NodeFailed({ error }: { error: unknown }) {
  return (
    <div
      role="alert"
      className="flex h-full w-full items-center gap-2 rounded-lg border border-danger/40 bg-surface p-3 text-xs text-muted"
    >
      <Mascot mood="tangled" className="size-10 shrink-0" />
      {isStaleChunkError(error)
        ? 'This node is out of date. Reload to get the latest version.'
        : 'This node could not be shown.'}
    </div>
  );
}

/** Code-splits heavy nodes (MathLive, CodeMirror, spreadsheet, plotting) so they load only when used. */
function lazyNode<P extends NodeProps<AppNode>>(load: () => Promise<{ default: ComponentType<P> }>) {
  const Component = lazy(load);
  return function LazyNode(props: P) {
    return (
      <ErrorBoundary fallback={(error) => <NodeFailed error={error} />}>
        <Suspense
          fallback={<div className="h-12 w-40 animate-pulse rounded-lg border border-border bg-surface" />}
        >
          <Component {...props} />
        </Suspense>
      </ErrorBoundary>
    );
  };
}

/** The component of every kind of card: drawn on the canvas by itself, or as a card in a stack. */
export const cardComponents = {
  text: TextNode,
  image: ImageNode,
  video: VideoNode,
  web: WebNode,
  math: lazyNode(() => import('./math/MathNode')),
  mathPlus: lazyNode(() => import('./mathPlus/MathPlusNode')),
  graph: lazyNode(() => import('./graph/GraphNode')),
  table: lazyNode(() => import('./table/TableNode')),
  sheet: lazyNode(() => import('./sheet/SheetNode')),
  code: lazyNode(() => import('./code/CodeNode')),
  pdf: lazyNode(() => import('./pdf/PdfNode')),
} satisfies Record<CardNode['type'], unknown>;
