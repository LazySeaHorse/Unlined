import { javascript } from '@codemirror/lang-javascript';
import { githubDarkInit, githubLightInit } from '@uiw/codemirror-theme-github';
import CodeMirror from '@uiw/react-codemirror';
import type { NodeProps } from '@xyflow/react';
import { Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AskSlot, PlainLines } from '@/ai/AskSlot';
import { askedLine, replaceLine, useInlineAsk } from '@/ai/useInlineAsk';
import { useReadOnly } from '@/canvas/readOnly';
import { cn } from '@/lib/cn';
import type { NodeOf } from '@/model/types';
import { useUiStore } from '@/store/uiStore';
import { Button } from '@/ui/Button';
import { NodeShell } from '../NodeShell';
import { useUpdateNodeData } from '../useNodeData';
import { codeAsk } from './ask';
import { type LogLevel, type LogLine, runScript } from './sandbox';

const extensions = [javascript()];
/** GitHub syntax colors on the node's own tile, so the editor matches the app theme. */
const surface = {
  background: 'transparent',
  gutterBackground: 'transparent',
  gutterBorder: 'var(--border)',
};
const lightTheme = githubLightInit({ settings: surface });
const darkTheme = githubDarkInit({ settings: surface });

const levelStyles: Record<LogLevel, string> = {
  log: 'text-fg',
  info: 'text-fg',
  result: 'text-accent',
  warn: 'bg-warning/10 text-warning',
  error: 'bg-danger/10 text-danger',
  system: 'text-muted italic',
};

export default function CodeNode({ id, data, selected }: NodeProps<NodeOf<'code'>>) {
  const readOnly = useReadOnly();
  const dark = useUiStore((s) => s.theme === 'dark');
  const update = useUpdateNodeData<'code'>(id);
  // `?` at the start of an empty line asks for code in words; it goes in that line's place.
  const ask = useInlineAsk(codeAsk, {
    data,
    context: () => data.source,
    apply: (code, at: number) => update({ source: replaceLine(data.source, at, code) }),
  });
  const asking = ask.state.phase === 'closed' ? undefined : ask.state.at;
  const [output, setOutput] = useState<LogLine[]>([]);
  const stopRef = useRef<() => void>(undefined);
  const outputRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => stopRef.current?.(), []);

  useEffect(() => {
    if (output.length) outputRef.current?.scrollTo({ top: outputRef.current.scrollHeight });
  }, [output]);

  const run = () => {
    stopRef.current?.();
    setOutput([]);
    stopRef.current = runScript(data.source, (line) => setOutput((lines) => [...lines, line]));
  };

  const clear = () => {
    stopRef.current?.();
    setOutput([]);
  };

  return (
    <NodeShell
      kind="code"
      selected={selected}
      customTitle={data.title}
      tint={data.color}
      resize={{ minWidth: 280, minHeight: 200 }}
      actions={
        <>
          <Button size="xs" onClick={clear}>
            Clear
          </Button>
          <Button variant="primary" size="xs" onClick={run}>
            <Play className="size-3" /> Run
          </Button>
        </>
      }
    >
      <AskSlot
        ask={ask}
        className="nodrag nowheel nokey flex min-h-0 flex-1 flex-col overflow-auto font-mono text-[13px] leading-[1.4]"
        lines={
          asking === undefined
            ? undefined
            : {
                above: <ScriptLines lines={data.source.split('\n').slice(0, asking)} />,
                below: <ScriptLines lines={data.source.split('\n').slice(asking + 1)} />,
              }
        }
        renderGhost={(code) => <ScriptLines lines={code.split('\n')} />}
      >
        <CodeMirror
          value={data.source}
          onChange={(source, change) => {
            const line = askedLine(change.startState.doc.toString(), source);
            if (!line || !ask.open(line.index)) update({ source });
          }}
          extensions={extensions}
          theme={dark ? darkTheme : lightTheme}
          editable={!readOnly}
          // Undo is the canvas's (canvas-history), so the code's edits interleave with the rest in one history.
          basicSetup={{ foldGutter: false, history: false, historyKeymap: false }}
          height="100%"
          className="nodrag nowheel nokey canvas-history min-h-0 flex-1 overflow-hidden text-[13px]"
        />
      </AskSlot>
      <div
        ref={outputRef}
        className="nodrag nowheel h-28 shrink-0 overflow-y-auto border-t border-border bg-surface-2 font-mono text-xs select-text"
      >
        {output.length === 0 ? (
          <p className="px-3 py-1.5 text-muted">{readOnly ? 'Output' : 'Press Run to execute'}</p>
        ) : (
          output.map((line, index) => (
            <pre
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log.
              key={index}
              className={cn('border-b border-border px-3 py-1 whitespace-pre-wrap', levelStyles[line.level])}
            >
              {line.text}
            </pre>
          ))
        )}
      </div>
    </NodeShell>
  );
}

/** Lines of the script as plain text, for while the editor gives way to an ask. */
const ScriptLines = ({ lines }: { lines: string[] }) => (
  <PlainLines lines={lines} className="px-9 whitespace-pre" />
);
