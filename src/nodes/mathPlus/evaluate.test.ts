import { ComputeEngine } from '@cortex-js/compute-engine';
import { describe, expect, it } from 'vitest';
import { evaluateDocuments, evaluateLinked, splitLines } from './evaluate';
import type { MathLink } from './order';

const ce = new ComputeEngine();

describe('splitLines', () => {
  it('unwraps displaylines and splits on line breaks', () => {
    expect(splitLines('\\displaylines{a:=1\\\\a+1}')).toEqual(['a:=1', 'a+1']);
    expect(splitLines('1+1')).toEqual(['1+1']);
    expect(splitLines('  ')).toEqual([]);
  });

  it('keeps the rows of an environment, and of braces, in their line', () => {
    const matrix = '\\begin{bmatrix}1&2\\\\3&4\\end{bmatrix}';
    expect(splitLines(`\\displaylines{${matrix}\\\\x}`)).toEqual([matrix, 'x']);
    expect(splitLines('\\displaylines{\\frac{a\\\\b}{2}\\\\\\{c\\}}')).toEqual([
      '\\frac{a\\\\b}{2}',
      '\\{c\\}',
    ]);
  });
});

describe('evaluateDocuments', () => {
  it('evaluates expressions with approximations', () => {
    const { a } = evaluateDocuments(ce, [{ id: 'a', latex: '\\displaylines{1+2\\\\\\frac{1}{3}}' }]);
    expect(a[0]).toEqual({ value: '3', approx: null, error: null, assigned: false, solved: false });
    expect(a[1]).toMatchObject({ value: '\\frac{1}{3}', approx: '0.3333333333' });
  });

  it('shares variables across documents in order', () => {
    const results = evaluateDocuments(ce, [
      { id: 'first', latex: 'x:=5' },
      { id: 'second', latex: 'x+1' },
    ]);
    expect(results.first[0]).toMatchObject({ value: '5', assigned: true });
    expect(results.second[0].value).toBe('6');
  });

  it('does not leak variables between evaluations', () => {
    evaluateDocuments(ce, [{ id: 'a', latex: 'y:=2' }]);
    expect(evaluateDocuments(ce, [{ id: 'b', latex: 'y+1' }]).b[0].value).toBe('y+1');
  });

  it('reports syntax errors per line', () => {
    const { a } = evaluateDocuments(ce, [{ id: 'a', latex: '\\displaylines{1+\\\\2}' }]);
    expect(a[0].error).toBe('Syntax error');
    expect(a[1].value).toBe('2');
  });
});

describe('evaluateLinked', () => {
  const doc = (id: string, latex: string) => ({ id, latex });
  const link = (id: string, source: string, target: string, name = 'ans'): MathLink => ({
    id,
    source,
    target,
    name,
  });
  const value = (r: ReturnType<typeof evaluateLinked>, id: string, line = 0) => r.lines[id][line].value;
  const error = (r: ReturnType<typeof evaluateLinked>, id: string, line = 0) => r.lines[id][line].error;

  it('evaluates documents without links exactly as before links existed', () => {
    // Expected values were taken from the code as it was before links.
    const one = (latex: string) =>
      evaluateLinked(ce, [doc('x', latex)], []).lines.x.map((l) => l.value ?? l.error);
    expect(one('\\displaylines{a:=2\\\\n:=3\\\\s:=4\\\\ans}')).toEqual(['2', '3', '4', '24']);
    expect(one('\\text{ans}')).toEqual(['\\text{ans}']);
    expect(one('\\text{ans}+1')).toEqual(['Syntax error']);
    expect(one('ans+1')).toEqual(['4an+1']);
    expect(one('\\mathrm{ans}')).toEqual(['\\mathrm{ans}']);
    expect(evaluateLinked(ce, [doc('a', 'x:=5'), doc('b', 'x+1')], []).lines.b[0].value).toBe('6');
  });

  it('spells ans as one symbol only where an ans link arrives, and not inside text groups', () => {
    const r = evaluateLinked(
      ce,
      [doc('s', '7'), doc('t', '\\displaylines{ans+1\\\\\\text{ans}}'), doc('u', 'ans+1')],
      [link('l', 's', 't')],
    );
    expect(r.lines.t.map((l) => l.value)).toEqual(['8', '\\text{ans}']);
    // u has no ans link: typed ans stays a times n times s.
    expect(r.lines.u[0].value).toBe('4an+1');
  });

  it('passes the last line of the source on as a named variable', () => {
    const r = evaluateLinked(
      ce,
      [doc('s', '\\displaylines{1\\\\2+3}'), doc('t', 'k*2')],
      [link('l', 's', 't', 'k')],
    );
    expect(value(r, 't')).toBe('10');
    expect(r.inputs.t).toEqual([
      { linkId: 'l', sourceId: 's', name: 'k', value: '5', error: null, used: true },
    ]);
  });

  it('calls an unnamed link ans, typed as plain letters', () => {
    const r = evaluateLinked(ce, [doc('s', '7'), doc('t', 'ans+1')], [link('l', 's', 't')]);
    expect(value(r, 't')).toBe('8');
  });

  it('pulls a source that sits below its target ahead of it', () => {
    const r = evaluateLinked(ce, [doc('t', 'k+1'), doc('s', '41')], [link('l', 's', 't', 'k')]);
    expect(value(r, 't')).toBe('42');
  });

  it('passes exact results, so one third stays one third', () => {
    const r = evaluateLinked(ce, [doc('s', '\\frac{1}{3}'), doc('t', '3k')], [link('l', 's', 't', 'k')]);
    expect(value(r, 't')).toBe('1');
    expect(r.inputs.t[0].value).toBe('\\frac{1}{3}');
  });

  it('shows an unused input without complaint', () => {
    const r = evaluateLinked(ce, [doc('s', '5'), doc('t', '2+2')], [link('l', 's', 't', 'k')]);
    expect(value(r, 't')).toBe('4');
    expect(r.inputs.t[0]).toMatchObject({ name: 'k', value: '5', error: null, used: false });
  });

  it('lets what the target assigns reach later nodes, but not the link variable', () => {
    const r = evaluateLinked(
      ce,
      [doc('s', '4'), doc('t', 'a:=ans+1'), doc('u', 'a*2+ans')],
      [link('l', 's', 't')],
    );
    expect(value(r, 't')).toBe('5');
    // a is visible in u; ans is not (it only exists inside t), so u reads typed ans as a times n times s.
    expect(value(r, 'u')).toBe('20n+10');
  });

  it('lets the target assign a linked name itself: the link stops there', () => {
    const r = evaluateLinked(
      ce,
      [doc('s', '5'), doc('t', '\\displaylines{k+1\\\\k:=3\\\\k+1}')],
      [link('l', 's', 't', 'k')],
    );
    expect(r.lines.t.map((l) => l.value)).toEqual(['6', '3', '4']);
    expect(r.inputs.t[0].used).toBe(true);
  });

  it('uses the link for the right side of an assignment to the same name', () => {
    const r = evaluateLinked(
      ce,
      [doc('s', '5'), doc('t', '\\displaylines{k:=k+1\\\\k*2}')],
      [link('l', 's', 't', 'k')],
    );
    expect(r.lines.t.map((l) => l.value)).toEqual(['6', '12']);
  });

  it('turns a source error into an input error and blocks what depends on it', () => {
    const docs = [doc('s', '1+'), doc('t', 'k+1'), doc('u', 'ans*2')];
    const r = evaluateLinked(ce, docs, [link('1', 's', 't', 'k'), link('2', 't', 'u')]);
    expect(r.inputs.t[0]).toMatchObject({ error: 'the source has an error', value: null });
    expect(error(r, 't')).toBe('k: the source has an error');
    expect(error(r, 'u')).toBe('ans: the source has an error');
  });

  it('does not blame a node that ignores a broken input, though its chip is red', () => {
    const r = evaluateLinked(ce, [doc('s', '1+'), doc('t', '2')], [link('l', 's', 't', 'k')]);
    expect(value(r, 't')).toBe('2');
    expect(r.inputs.t[0].error).toBe('the source has an error');
  });

  it('refuses an empty source and one that ends in a function definition', () => {
    const r = evaluateLinked(
      ce,
      [doc('e', ''), doc('f', 'f(x):=x^2'), doc('t', 'a+b'), doc('v', 'a:=2')],
      [link('1', 'e', 't', 'a'), link('2', 'f', 't', 'b')],
    );
    expect(r.inputs.t.map((i) => i.error)).toEqual([
      'the source is empty',
      'the source ends in a function definition',
    ]);
    expect(error(r, 't')).toBe('a: the source is empty');
    // A variable assignment on the last line is fine: it hands over the value.
    const w = evaluateLinked(ce, [doc('v', 'a:=2'), doc('t', 'k+1')], [link('1', 'v', 't', 'k')]);
    expect(value(w, 't')).toBe('3');
  });

  it('flags two inputs of the same name only when the target reads that name', () => {
    const links = [link('1', 'a', 't'), link('2', 'b', 't')];
    const used = evaluateLinked(ce, [doc('a', '1'), doc('b', '2'), doc('t', 'ans+1')], links);
    expect(error(used, 't')).toBe('2 links named ans');
    expect(used.inputs.t.map((i) => i.error)).toEqual(['2 links named ans', '2 links named ans']);
    const unused = evaluateLinked(ce, [doc('a', '1'), doc('b', '2'), doc('t', '7')], links);
    expect(value(unused, 't')).toBe('7');
    expect(unused.inputs.t.map((i) => i.error)).toEqual([null, null]);
    expect(unused.inputs.t.every((i) => !i.used)).toBe(true);
  });

  it('opens a loop deterministically and says which link is ignored', () => {
    const docs = [doc('a', 'ans+1'), doc('b', 'k+10')];
    const r = evaluateLinked(ce, docs, [link('ab', 'a', 'b', 'k'), link('ba', 'b', 'a')]);
    expect(r.inputs.a[0]).toMatchObject({ linkId: 'ba', error: 'loop: link ignored' });
    expect(error(r, 'a')).toBe('ans: loop: link ignored');
    // b still receives a's (errored) last line as an error, not a value.
    expect(r.inputs.b[0].error).toBe('the source has an error');
  });

  it('ignores one link of a loop and still feeds a node waiting on it', () => {
    const r = evaluateLinked(
      ce,
      [doc('x', 'ans*2'), doc('a', '5'), doc('b', 'k+1')],
      [link('ab', 'a', 'b', 'k'), link('ba', 'b', 'a'), link('bx', 'b', 'x')],
    );
    expect(r.inputs.a[0]).toMatchObject({ linkId: 'ba', error: 'loop: link ignored' });
    expect(value(r, 'b')).toBe('6');
    expect(value(r, 'x')).toBe('12');
  });

  it('does not recompute or leak between evaluations', () => {
    evaluateLinked(ce, [doc('s', '2'), doc('t', 'z:=ans')], [link('l', 's', 't')]);
    expect(evaluateLinked(ce, [doc('u', 'z+1')], []).lines.u[0].value).toBe('z+1');
  });
});
