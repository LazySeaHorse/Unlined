import type { NodeProps } from '@xyflow/react';
import { useState } from 'react';
import { AskSlot, PlainLines } from '@/ai/AskSlot';
import { CompleteSlot } from '@/ai/CompleteSlot';
import { askedLine, replaceLine, useInlineAsk } from '@/ai/useInlineAsk';
import { useInlineComplete } from '@/ai/useInlineComplete';
import { useReadOnly } from '@/canvas/readOnly';
import { Markdown } from '@/lib/Markdown';
import type { NodeOf } from '@/model/types';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { textAsk, textComplete } from './ask';
import { ShapeSuggestion } from './ShapeSuggestion';

export function TextNode({ id, data, selected }: NodeProps<NodeOf<'text'>>) {
  const readOnly = useReadOnly();
  const update = useUpdateNodeData<'text'>(id);
  const [editing, setEditing] = useState(false);
  // `?` at the start of an empty line asks for text in words; it goes in that line's place.
  const ask = useInlineAsk(textAsk, {
    data,
    context: () => data.markdown,
    apply: (text, at: number) => update({ markdown: replaceLine(data.markdown, at, text) }),
  });
  // Tab asks for the rest of the line at the caret.
  const complete = useInlineComplete(textComplete, { data, context: () => undefined });
  const asking = ask.state.phase === 'closed' ? undefined : ask.state.at;
  const shown = data.markdown.split('\n');

  return (
    <NodeShell
      kind="text"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      className="w-max min-w-56 max-w-xl"
    >
      {editing || asking !== undefined ? (
        <CompleteSlot complete={complete} at={0}>
          <AskSlot
            ask={ask}
            className="nodrag w-[32rem] max-w-full bg-surface p-4 font-mono text-sm leading-relaxed text-fg"
            lines={
              asking === undefined
                ? undefined
                : {
                    above: <NoteLines lines={shown.slice(0, asking)} />,
                    below: <NoteLines lines={shown.slice(asking + 1)} />,
                  }
            }
            renderGhost={(text) => <NoteLines lines={text.split('\n')} />}
          >
            <textarea
              // biome-ignore lint/a11y/noAutofocus: entering edit mode is an explicit user action.
              autoFocus
              value={data.markdown}
              onChange={(e) => {
                const line = askedLine(data.markdown, e.target.value);
                if (!line || !ask.open(line.index)) update({ markdown: e.target.value });
              }}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return;
                // Hand focus to the node so its shortcuts (Ctrl+D, Ctrl+C...) work again.
                const node = e.currentTarget.closest<HTMLElement>('.react-flow__node');
                if (node) node.focus();
                else e.currentTarget.blur();
              }}
              className="nodrag nowheel nokey canvas-history min-h-32 w-[32rem] max-w-full resize-none bg-surface p-4 font-mono text-sm leading-relaxed text-fg outline-none [field-sizing:content]"
            />
          </AskSlot>
        </CompleteSlot>
      ) : (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: double-click to edit mirrors desktop canvas apps. */}
          <div className="p-4" onDoubleClick={() => !readOnly && setEditing(true)}>
            <Markdown source={data.markdown} />
          </div>
          {!readOnly && !data.suggestionDismissed && (
            <ShapeSuggestion
              id={id}
              markdown={data.markdown}
              onDismiss={() => update({ suggestionDismissed: true })}
            />
          )}
        </>
      )}
    </NodeShell>
  );
}

/** Lines of the note's source as the textarea shows them, for while it gives way to an ask. */
const NoteLines = ({ lines }: { lines: string[] }) => (
  <PlainLines lines={lines} className="break-words whitespace-pre-wrap" />
);
