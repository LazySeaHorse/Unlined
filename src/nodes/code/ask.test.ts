import { afterEach, describe, expect, it } from 'vitest';
import { askFor } from '@/ai/inlineAsk';
import { lastFence, releaseSessions } from '@/ai/languageModel';
import { type FakeModel, installFakeLanguageModel } from '@/test/fakeLanguageModel';
import { codeAsk, parsesAsJavaScript } from './ask';

let fake: FakeModel | undefined;
afterEach(() => {
  releaseSessions();
  fake?.uninstall();
  fake = undefined;
});

describe('codeAsk', () => {
  it.each(codeAsk.examples)('teaches only code that parses: $words', async ({ answer, context }) => {
    expect(codeAsk.schema.safeParse(answer).success).toBe(true);
    expect(await codeAsk.check(answer, context)).toEqual({ ok: true, value: answer });
  });

  it('tells code that parses from code that does not', () => {
    expect(parsesAsJavaScript('const a = 1;\nconsole.log(a);')).toBe(true);
    for (const code of ['const = ;', 'function (', 'console.log("a"', 'for (;;'])
      expect(parsesAsJavaScript(code)).toBe(false);
  });

  it('rejects nothing and broken code', async () => {
    for (const code of ['  ', 'let x = ;']) expect((await codeAsk.check(code, '')).ok).toBe(false);
  });

  it('shows the model the script, then the words', () => {
    expect(codeAsk.input('let a;\n', ' more ')).toBe('Script:\nlet a;\nRequest: more');
    expect(codeAsk.input('', 'hi')).toBe('Script:\n(empty)\nRequest: hi');
  });

  it('keeps the line breaks and indentation of the last fenced block', async () => {
    const code = '  for (const x of [1]) {\n    console.log(x);\n  }';
    fake = installFakeLanguageModel([`Loop it.\n\`\`\`js\n\n${code}\n\n\`\`\``]);
    expect(lastFence(`\`\`\`js\n\n${code}\n\n\`\`\``)).toBe(code);
    expect(await askFor(codeAsk, '', 'loop')).toEqual({ status: 'ok', value: code });
  });
});
