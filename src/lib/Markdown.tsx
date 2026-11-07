import { memo } from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import { cn } from './cn';
import { rehypeInk } from './math/ink';
import remarkObsidianMath from './remarkObsidianMath';

const remarkPlugins = [remarkGfm, remarkObsidianMath];
const rehypePlugins = [rehypeKatex, rehypeInk];
const components: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
};

/** GitHub-flavoured Markdown with `$inline$` and `$$block$$` math. Raw HTML is not rendered. */
export const Markdown = memo(function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div className={cn('markdown', className)}>
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
});
