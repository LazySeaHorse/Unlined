import { z } from 'zod';
import { type LogLine, runScript } from '@/nodes/code/sandbox';
import { alias } from '../aliases';
import { defineTool } from '../defineTool';
import { ToolError } from '../errors';
import { handleSchema, requireNode } from './shared';

const MAX_OUTPUT_CHARS = 8000;
/** After the top-level code finishes, wait this long for timers it started. */
const SETTLE_MS = 500;

/** Runs a script to completion and collects its output. */
export function collectScript(source: string): Promise<LogLine[]> {
  return new Promise((resolve) => {
    const lines: LogLine[] = [];
    let settle: ReturnType<typeof setTimeout> | undefined;
    let stop = () => {};
    const finish = () => {
      clearTimeout(settle);
      stop();
      resolve(lines);
    };
    stop = runScript(
      source,
      (line) => {
        lines.push(line);
        // The time limit message is the last thing a runaway script produces.
        if (line.level === 'system') finish();
      },
      () => {
        settle = setTimeout(finish, SETTLE_MS);
      },
    );
  });
}

export const runCode = defineTool({
  name: 'run_code',
  title: 'Run a script node',
  description:
    'Run a code (JavaScript) node in its sandboxed worker. Returns the console output and the value of the last ' +
    'expression ("=> ..."). The tool stops a script after 5 seconds. It does not change the canvas.',
  input: z.object({ id: handleSchema }),
  readOnly: true,
  exclusive: true,
  handler: async ({ id }) => {
    const node = requireNode(id);
    if (node.type !== 'code')
      throw new ToolError('not_code', `${id} is a ${node.type} node. It is not a code node.`);
    const lines = await collectScript(node.data.source);
    const prefix = {
      log: '',
      info: '',
      result: '=> ',
      warn: 'warn: ',
      error: 'error: ',
      system: '',
    } as const;
    let text = lines.map((l) => `${prefix[l.level]}${l.text}`).join('\n') || '(no output)';
    if (text.length > MAX_OUTPUT_CHARS)
      text = `${text.slice(0, MAX_OUTPUT_CHARS)}\n[output cut at ${MAX_OUTPUT_CHARS} chars]`;
    const failed = lines.some((l) => l.level === 'error');
    return { text, summary: `Ran ${alias(node.id)}${failed ? ' (error)' : ''}` };
  },
});
