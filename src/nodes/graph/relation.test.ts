import { ComputeEngine, compile } from '@cortex-js/compute-engine';
import { describe, expect, it } from 'vitest';
import { classifyRelation, type Relation, splitRestrictions } from './relation';

const engine = { ce: new ComputeEngine(), compile };
const read = (latex: string) => classifyRelation(engine, latex);
const must = (latex: string): Relation => {
  const relation = read(latex);
  if (!relation) throw new Error(`${latex} did not classify`);
  return relation;
};
/** A row that plots one variable against the other, so its function takes one number. */
const curve = (latex: string) => {
  const relation = must(latex);
  if (relation.kind === 'implicit' || relation.kind === 'shade' || relation.kind === 'points')
    throw new Error(`${latex} is ${relation.kind}`);
  return relation;
};

describe('classifyRelation: curves of x', () => {
  it('reads a bare expression as y of x', () => {
    const r = curve('x^2+1');
    expect(r.kind).toBe('y');
    expect(r.fn(3)).toBe(10);
    expect(curve('\\sin(x)').fn(0)).toBe(0);
  });

  it('reads y= and f(x)= alike, whichever side y is on', () => {
    for (const latex of ['y=2x', 'f(x)=2x', 'g(x) = 2x', '2x=y']) {
      const r = curve(latex);
      expect(r.kind).toBe('y');
      expect(r.fn(4)).toBe(8);
    }
    expect(curve('y = \\frac{1}{x}').fn(4)).toBe(0.25);
  });

  it('plots a constant as a horizontal line', () => {
    expect(curve('y=2')).toMatchObject({ kind: 'y' });
    expect(curve('y=2').fn(99)).toBe(2);
    expect(curve('3').fn(-1)).toBe(3);
  });
});

describe('classifyRelation: curves of y', () => {
  it('reads x= as x of y, so x=3 is a vertical line', () => {
    const r = curve('x=3');
    expect(r.kind).toBe('x');
    expect(r.fn(0)).toBe(3);
    expect(r.fn(100)).toBe(3);
  });

  it('reads x=g(y)', () => {
    const r = curve('x=y^2');
    expect(r.kind).toBe('x');
    expect(r.fn(3)).toBe(9);
  });
});

describe('classifyRelation: regions', () => {
  it('reads each inequality against the axis it is solved for', () => {
    expect(curve('y>x')).toMatchObject({ kind: 'region', axis: 'y', op: '>' });
    expect(curve('y\\le 2x+1')).toMatchObject({ kind: 'region', axis: 'y', op: '<=' });
    expect(curve('x<3')).toMatchObject({ kind: 'region', axis: 'x', op: '<' });
    expect(curve('x\\ge y^2')).toMatchObject({ kind: 'region', axis: 'x', op: '>=' });
  });

  it('flips the comparison when the variable is on the right', () => {
    expect(curve('2x+1<y')).toMatchObject({ kind: 'region', axis: 'y', op: '>' });
    expect(curve('3\\ge x')).toMatchObject({ kind: 'region', axis: 'x', op: '<=' });
    expect(curve('2x+1<y').fn(1)).toBe(3);
  });
});

describe('classifyRelation: implicit curves', () => {
  it('reads an equation in both x and y as the curve where its sides agree', () => {
    const circle = must('x^2+y^2=1');
    expect(circle.kind).toBe('implicit');
    if (circle.kind !== 'implicit') return;
    expect(circle.fn(1, 0)).toBe(0);
    expect(circle.fn(0, 2)).toBe(3);
    expect(must('xy=1')).toMatchObject({ kind: 'implicit' });
  });
});

describe('classifyRelation: shaded areas', () => {
  const shade = (latex: string) => {
    const relation = must(latex);
    if (relation.kind !== 'shade') throw new Error(`${latex} is ${relation.kind}`);
    return relation;
  };

  it('shades where every comparison of a chain holds', () => {
    const band = shade('1\\le\\left|x\\right|\\le2');
    expect(band.strict).toBe(false);
    expect(band.fn(1.5, 0)).toBeCloseTo(0.5);
    expect(band.fn(-1.5, 7)).toBeCloseTo(0.5);
    expect(band.fn(0, 0)).toBeLessThan(0);
    expect(band.fn(3, 0)).toBeLessThan(0);
    expect(shade('0\\le y\\le x^2').fn(2, 1)).toBeGreaterThan(0);
    expect(shade('0\\le y\\le x^2').fn(2, 5)).toBeLessThan(0);
  });

  it('reads chains written downwards, and strict ones', () => {
    expect(shade('2>x>1').fn(1.5, 0)).toBeGreaterThan(0);
    expect(shade('2>x>1').strict).toBe(true);
  });

  it('shades inequalities that cannot be solved for x or for y', () => {
    expect(shade('|x|<2').fn(1, 0)).toBeGreaterThan(0);
    expect(shade('|x|<2').fn(3, 0)).toBeLessThan(0);
    expect(shade('x^2+y^2<4').fn(0, 0)).toBe(4);
    expect(shade('x^2+y^2\\ge4').fn(3, 0)).toBe(5);
  });
});

describe('classifyRelation: what it cannot draw', () => {
  it('gives null for empty, invalid and unsupported rows', () => {
    expect(read('')).toBeNull();
    expect(read('  ')).toBeNull();
    expect(read('x^2+')).toBeNull();
    expect(read('y')).toBeNull();
    expect(read('y=a x')).toBeNull();
    expect(read('t^2')).toBeNull();
    expect(read('t<2')).toBeNull();
    expect(read('1<2')).toBeNull();
    expect(read('1=1')).toBeNull();
  });
});

describe('splitRestrictions', () => {
  it('takes braces off the end of a row, in any spelling', () => {
    for (const latex of [
      'y=x\\{1<x<5\\}',
      'y=x\\left\\{1<x<5\\right\\}',
      'y=x \\lbrace 1<x<5\\rbrace',
      'y=x\\,\\{1<x<5\\}',
      // What the math field writes when { is typed in it.
      'y=x\\left\\lbrace 1<x<5\\right\\rbrace',
    ])
      expect(splitRestrictions(latex)).toEqual({ body: 'y=x', where: ['1<x<5'] });
  });
  it('takes several groups, and leaves plain braces alone', () => {
    expect(splitRestrictions('y=\\frac{1}{x}\\{x>0\\}\\{y<3\\}')).toEqual({
      body: 'y=\\frac{1}{x}',
      where: ['x>0', 'y<3'],
    });
    expect(splitRestrictions('y=x^{2}')).toEqual({ body: 'y=x^{2}', where: [] });
  });
});

describe('classifyRelation: restrictions', () => {
  it('reads a row pasted with its $ or $$ delimiters', () => {
    expect(must('$$ y=-2000+30x\\left\\lbrace x>0\\right\\rbrace $$').kind).toBe('y');
    expect(must('$y=x$').kind).toBe('y');
  });

  const where = (latex: string) => {
    const r = must(latex);
    if (r.kind !== 'y' && r.kind !== 'x') throw new Error(`${latex} is ${r.kind}`);
    return r.where as NonNullable<typeof r.where>;
  };

  it('keeps a curve where its restriction holds', () => {
    const w = where('y=x\\{1<x<5\\}');
    expect(w(3, 3)).toBe(true);
    expect(w(1, 1)).toBe(false);
    expect(w(6, 6)).toBe(false);
    expect(must('y=x').kind).toBe('y');
  });

  it('takes one-sided, inclusive and chained restrictions, joined by commas', () => {
    expect(where('y=x\\{x\\ge2\\}')(2, 2)).toBe(true);
    expect(where('y=x\\{x>2\\}')(2, 2)).toBe(false);
    expect(where('y=x\\{1<x\\le5\\}')(5, 5)).toBe(true);
    const both = where('y=x\\{x>0,y<3\\}');
    expect(both(2, 2)).toBe(true);
    expect(both(2, 4)).toBe(false);
    expect(both(-1, -1)).toBe(false);
  });

  it('may restrict y, and an x = row', () => {
    expect(where('y=x\\{y>1\\}')(0, 2)).toBe(true);
    expect(where('y=x\\{y>1\\}')(0, 0)).toBe(false);
    expect(where('x=3\\{0<y<2\\}')(3, 1)).toBe(true);
  });

  it('cuts areas and implicit curves out where the restriction fails', () => {
    const circle = must('x^2+y^2=1\\{y>0\\}');
    if (circle.kind !== 'implicit') throw new Error('not implicit');
    expect(Number.isNaN(circle.fn(0, -1))).toBe(true);
    expect(circle.fn(0, 1)).toBe(0);
    const area = must('y>x\\{x>0\\}');
    if (area.kind !== 'shade') throw new Error('not shade');
    expect(area.fn(1, 3)).toBe(2);
    expect(Number.isNaN(area.fn(-1, 3))).toBe(true);
  });

  it('draws nothing for a restriction it cannot read', () => {
    expect(read('y=x\\{hello\\}')).toBeNull();
    expect(read('y=x\\{z>1\\}')).toBeNull();
    expect(read('y=x\\{x=1\\}')).toBeNull();
  });
});

describe('classifyRelation: points', () => {
  const points = (latex: string) => {
    const r = must(latex);
    if (r.kind !== 'points') throw new Error(`${latex} is ${r.kind}`);
    return r.points;
  };
  it('reads a point, in any bracket, with values the engine can work out', () => {
    expect(points('(1,2)')).toEqual([[1, 2]]);
    expect(points('\\left(1,2\\right)')).toEqual([[1, 2]]);
    expect(points('(-1.5, \\frac{2}{3})')[0]?.[0]).toBe(-1.5);
    expect(points('(-1.5, \\frac{2}{3})')[0]?.[1]).toBeCloseTo(2 / 3);
    expect(points('(\\sqrt{4}, 1+1)')).toEqual([[2, 2]]);
  });
  it('reads a list of points', () => {
    expect(points('(1,2),(3,4)')).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
  it('keeps the points a restriction allows, and draws nothing when none is', () => {
    expect(points('(1,2),(-3,4)\\left\\lbrace x>0\\right\\rbrace')).toEqual([[1, 2]]);
    expect(read('(-1,2)\\left\\lbrace x>0\\right\\rbrace')).toBeNull();
  });
  it('draws nothing for what is not a point', () => {
    expect(read('(1,2,3)')).toBeNull();
    expect(read('(a,2)')).toBeNull();
    expect(read('(1,)')).toBeNull();
  });
});
