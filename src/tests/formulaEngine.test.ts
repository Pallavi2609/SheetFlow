import { afterEach, describe, expect, it } from 'vitest';

import { GUIDE_SECTIONS } from '../components/spreadsheet/FormulaHelper';
import { clearParseCache, collectRefs, evaluateRaw, FormulaError, parseFormula } from '../formulas';
import type { EvalContext } from '../formulas';
import { shiftFormulaRefs } from '../formulas/shift';
import { roundNumber } from '../utils/display';
import type { CellErrorCode, EvalResult } from '../types';

function ctxFor(cells: Record<string, string>): EvalContext {
  const cache = new Map<string, EvalResult>();
  const visiting = new Set<string>();
  const get = (key: string): EvalResult => {
    const cached = cache.get(key);
    if (cached) return cached;
    if (visiting.has(key)) return { value: null, error: '#CYCLE!' };
    visiting.add(key);
    const result = evaluateRaw(cells[key] ?? '', { get }).result;
    visiting.delete(key);
    cache.set(key, result);
    return result;
  };
  return { get };
}

function evalWith(cells: Record<string, string>, formula: string): EvalResult {
  return evaluateRaw(formula, ctxFor(cells)).result;
}

afterEach(() => {
  clearParseCache();
});

describe('tokenizer', () => {
  it('tokenizes numbers, identifiers, and operators', () => {
    expect(() => parseFormula('1+SUM(A1:B2)*3.5')).not.toThrow();
  });

  it('rejects unexpected characters without eval', () => {
    let caught: unknown;
    try {
      parseFormula('1 & 2');
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(FormulaError);
    expect((caught as FormulaError).code).toBe('#ERROR!');
  });
});

describe('parser', () => {
  it('respects operator precedence: 1+2*3 = 7', () => {
    expect(evalWith({}, '=1+2*3')).toEqual({ value: 7 });
  });

  it('respects parentheses: (1+2)*3 = 9', () => {
    expect(evalWith({}, '=(1+2)*3')).toEqual({ value: 9 });
  });

  it('supports unary minus', () => {
    expect(evalWith({}, '=-5')).toEqual({ value: -5 });
    expect(evalWith({ A1: '5' }, '=-A1')).toEqual({ value: -5 });
  });

  it('supports exponentiation via ^', () => {
    expect(evalWith({}, '=2^3')).toEqual({ value: 8 });
  });

  it('flags ranges used as single values', () => {
    expect(evalWith({ A1: '1' }, '=A1:B2')).toEqual({ value: null, error: '#VALUE!' });
  });

  it('reports missing closing parenthesis', () => {
    expect(evalWith({}, '=(1+2')).toEqual({ value: null, error: '#ERROR!' });
  });
});

describe('evaluator', () => {
  it('adds two referenced cells (=A1+B1)', () => {
    expect(evalWith({ A1: '10', B1: '20' }, '=A1+B1')).toEqual({ value: 30 });
  });

  it('multiplies a cell by a literal (=A1*2)', () => {
    expect(evalWith({ A1: '10' }, '=A1*2')).toEqual({ value: 20 });
  });

  it('handles nested arithmetic (=(A1+B1)*2)', () => {
    expect(evalWith({ A1: '10', B1: '20' }, '=(A1+B1)*2')).toEqual({ value: 60 });
  });

  it('treats empty referenced cells as zero', () => {
    expect(evalWith({}, '=A1+1')).toEqual({ value: 1 });
  });

  it('reports division by zero as #DIV/0!', () => {
    expect(evalWith({ A1: '1', B1: '0' }, '=A1/B1')).toEqual({ value: null, error: '#DIV/0!' });
  });

  it('reports text used in arithmetic as #VALUE!', () => {
    expect(evalWith({ A1: 'hello' }, '=A1+1')).toEqual({ value: null, error: '#VALUE!' });
  });

  it('reports unknown functions as #NAME?', () => {
    expect(evalWith({}, '=FOO(1)')).toEqual({ value: null, error: '#NAME?' });
  });

  it('reports references outside the grid as #REF!', () => {
    expect(evalWith({}, '=A9999999+1')).toEqual({ value: null, error: '#REF!' });
  });

  it('rounds floating point noise (0.1+0.2 displays 0.3)', () => {
    expect(evalWith({}, '=0.1+0.2')).toEqual({ value: 0.3 });
  });

  it('stores plain numbers and text literals', () => {
    expect(evalWith({}, '42')).toEqual({ value: 42 });
    expect(evalWith({}, 'hello')).toEqual({ value: 'hello' });
  });
});

describe('range functions', () => {
  const cells = { A1: '5', A2: '3', A3: '9', A4: '', A5: 'x' };

  it('SUM ignores empty and text cells', () => {
    expect(evalWith(cells, '=SUM(A1:A5)')).toEqual({ value: 17 });
  });

  it('MIN and MAX ignore empty and text cells', () => {
    expect(evalWith(cells, '=MIN(A1:A5)')).toEqual({ value: 3 });
    expect(evalWith(cells, '=MAX(A1:A5)')).toEqual({ value: 9 });
  });

  it('AVERAGE divides by the numeric count', () => {
    expect(evalWith(cells, '=AVERAGE(A1:A5)')).toEqual({ value: roundNumber(17 / 3) });
  });

  it('AVERAGE with no numbers is #DIV/0!', () => {
    expect(evalWith({}, '=AVERAGE(A1:A5)')).toEqual({ value: null, error: '#DIV/0!' });
  });

  it('accepts mixed range and literal arguments', () => {
    expect(evalWith(cells, '=SUM(A1:A2,100)')).toEqual({ value: 108 });
  });

  it('propagates cell errors through functions', () => {
    expect(evalWith({ A1: '=1/0' }, '=SUM(A1:A2)')).toEqual({ value: null, error: '#DIV/0!' });
  });
});

describe('scalar functions (ABS, ROUND, SQRT, MOD)', () => {
  it('ABS returns the unsigned value', () => {
    expect(evalWith({ A1: '-9' }, '=ABS(A1)')).toEqual({ value: 9 });
    expect(evalWith({}, '=ABS(-2.5)')).toEqual({ value: 2.5 });
  });

  it('treats empty cells as zero and rejects text', () => {
    expect(evalWith({}, '=ABS(A1)')).toEqual({ value: 0 });
    expect(evalWith({ A1: 'text' }, '=ABS(A1)')).toEqual({ value: null, error: '#VALUE!' });
  });

  it('rejects ranges, missing arguments, and extra arguments', () => {
    const cells = { A1: '1', A2: '2' };
    expect(evalWith(cells, '=ABS(A1:A2)')).toEqual({ value: null, error: '#VALUE!' });
    expect(evalWith({}, '=ABS()')).toEqual({ value: null, error: '#VALUE!' });
    expect(evalWith({}, '=SQRT(4,9)')).toEqual({ value: null, error: '#VALUE!' });
  });

  it('ROUND rounds half away from zero', () => {
    expect(evalWith({}, '=ROUND(2.675,2)')).toEqual({ value: 2.68 });
    expect(evalWith({}, '=ROUND(2.5,0)')).toEqual({ value: 3 });
    expect(evalWith({}, '=ROUND(-2.5,0)')).toEqual({ value: -3 });
    expect(evalWith({}, '=ROUND(1.2345,2)')).toEqual({ value: 1.23 });
    expect(evalWith({}, '=ROUND(15,-1)')).toEqual({ value: 20 });
  });

  it('ROUND requires a number and a digit count', () => {
    expect(evalWith({}, '=ROUND(1.5)')).toEqual({ value: null, error: '#VALUE!' });
    expect(evalWith({}, '=ROUND(1.5,"x")')).toEqual({ value: null, error: '#ERROR!' });
  });

  it('SQRT of a negative number is #VALUE!', () => {
    expect(evalWith({}, '=SQRT(9)')).toEqual({ value: 3 });
    expect(evalWith({}, '=SQRT(2)')).toEqual({ value: roundNumber(Math.sqrt(2)) });
    expect(evalWith({}, '=SQRT(-1)')).toEqual({ value: null, error: '#VALUE!' });
  });

  it('MOD follows the sign of the divisor and rejects a zero divisor', () => {
    expect(evalWith({}, '=MOD(7,3)')).toEqual({ value: 1 });
    expect(evalWith({}, '=MOD(-3,2)')).toEqual({ value: 1 });
    expect(evalWith({}, '=MOD(3,-2)')).toEqual({ value: -1 });
    expect(evalWith({}, '=MOD(7,0)')).toEqual({ value: null, error: '#DIV/0!' });
  });

  it('POWER matches the ^ operator', () => {
    expect(evalWith({}, '=POWER(2,10)')).toEqual({ value: 1024 });
    expect(evalWith({}, '=2^10')).toEqual({ value: 1024 });
    expect(evalWith({}, '=POWER(2)')).toEqual({ value: null, error: '#VALUE!' });
  });

  it('propagates errors from referenced cells', () => {
    expect(evalWith({ A1: '=1/0' }, '=SQRT(A1)')).toEqual({ value: null, error: '#DIV/0!' });
    expect(evalWith({ A1: '=B9:B9' }, '=ABS(A1)')).toEqual({ value: null, error: '#VALUE!' });
  });

  it('nests inside arithmetic and other functions', () => {
    expect(evalWith({ A1: '-4' }, '=ABS(A1)*3')).toEqual({ value: 12 });
    expect(evalWith({ A1: '9', A2: '16' }, '=SUM(SQRT(A1),SQRT(A2))')).toEqual({ value: 7 });
    expect(evalWith({ A1: '10' }, '=ROUND(A1/3,3)')).toEqual({ value: 3.333 });
  });

  it('registers references for dependency tracking and cycle detection', () => {
    expect(collectRefs(parseFormula('SQRT(A1)+ABS(B2)')).sort()).toEqual(['A1', 'B2']);
    expect(evaluateRaw('=ROUND(A1,2)', ctxFor({ A1: '1.234' })).refs).toEqual(['A1']);
    expect(evalWith({ A1: '=ABS(B1)', B1: '=SQRT(A1)' }, '=A1')).toEqual({
      value: null,
      error: '#CYCLE!',
    });
  });
});

describe('COUNT', () => {
  const cells = { A1: '5', A2: '', A3: 'text', A4: '0', A5: '=2+2' };

  it('counts only numeric values', () => {
    expect(evalWith(cells, '=COUNT(A1:A5)')).toEqual({ value: 3 });
  });

  it('counts zero and ignores text and empty cells', () => {
    expect(evalWith({}, '=COUNT(A1:A5)')).toEqual({ value: 0 });
    expect(evalWith({ A1: '0' }, '=COUNT(A1:A5)')).toEqual({ value: 1 });
    expect(evalWith({ A1: 'text' }, '=COUNT(A1:A5)')).toEqual({ value: 0 });
  });

  it('accepts literals and several arguments', () => {
    expect(evalWith({}, '=COUNT(1,2,3)')).toEqual({ value: 3 });
    expect(evalWith(cells, '=COUNT(A1:A2,100)')).toEqual({ value: 2 });
  });

  it('propagates cell errors like the other functions', () => {
    expect(evalWith({ A1: '=1/0' }, '=COUNT(A1:A2)')).toEqual({ value: null, error: '#DIV/0!' });
  });
});

describe('the formula guide only documents formulas the engine can calculate', () => {
  // Cells chosen so every documented example evaluates to a real number.
  const values = { A1: '10', A2: '1', A3: '2', A4: '3', A5: '4', B1: '4', C1: '2' };
  const examples = GUIDE_SECTIONS.filter((section) => section.id !== 'errors').flatMap((section) =>
    section.entries.map((entry) => [section.heading, entry.example] as const),
  );

  it('covers every guide category except the error reference', () => {
    expect(examples.length).toBeGreaterThanOrEqual(20);
  });

  it.each(examples)('%s: %s evaluates without a #NAME? or #ERROR!', (_heading, example) => {
    const result = evaluateRaw(example, ctxFor(values)).result;
    expect(result.error).toBeUndefined();
    expect(result.value).not.toBeNull();
  });
});

describe('circular references', () => {
  it('detects direct self-reference as #CYCLE!', () => {
    expect(evalWith({ A1: '=A1' }, '=A1')).toEqual({ value: null, error: '#CYCLE!' });
  });

  it('detects mutual cycles as #CYCLE! without hanging', () => {
    const result = evalWith({ A1: '=B1', B1: '=A1' }, '=A1');
    expect(result.error).toBe('#CYCLE!');
  });
});

describe('dependency collection', () => {
  it('collects single refs', () => {
    const refs = collectRefs(parseFormula('A1+B2'));
    expect(refs.sort()).toEqual(['A1', 'B2']);
  });

  it('expands ranges into individual cells', () => {
    const refs = collectRefs(parseFormula('SUM(A1:A3)'));
    expect(refs.sort()).toEqual(['A1', 'A2', 'A3']);
  });

  it('returns no refs for literals', () => {
    expect(collectRefs(parseFormula('1+2'))).toEqual([]);
  });

  it('evaluateRaw reports refs for formulas and none for literals', () => {
    expect(evaluateRaw('=A1+1', ctxFor({})).refs).toEqual(['A1']);
    expect(evaluateRaw('123', ctxFor({})).refs).toEqual([]);
    expect(evaluateRaw('text', ctxFor({})).refs).toEqual([]);
    expect(evaluateRaw('', ctxFor({})).refs).toEqual([]);
  });
});

describe('parse errors become error results, not exceptions', () => {
  const cases: Array<[string, CellErrorCode]> = [
    ['=1+', '#ERROR!'],
    ['=()', '#ERROR!'],
    ['=SUM(', '#ERROR!'],
    ['=$$$', '#ERROR!'],
  ];
  it.each(cases)('%s yields %s', (formula, code) => {
    expect(evalWith({}, formula)).toEqual({ value: null, error: code });
  });
});

describe('reference shifting (fill handle)', () => {
  it('shifts a single reference down', () => {
    expect(shiftFormulaRefs('=A1+1', 2, 0)).toBe('=A3+1');
  });

  it('shifts a range horizontally', () => {
    expect(shiftFormulaRefs('=SUM(A1:A5)', 0, 1)).toBe('=SUM(B1:B5)');
  });

  it('does not shift function names', () => {
    expect(shiftFormulaRefs('=SUM(A1)', 1, 0)).toBe('=SUM(A2)');
  });

  it('leaves non-formula input unchanged', () => {
    expect(shiftFormulaRefs('hello', 1, 1)).toBe('hello');
    expect(shiftFormulaRefs('42', 1, 1)).toBe('42');
    expect(shiftFormulaRefs('=A1', 0, 0)).toBe('=A1');
  });

  it('leaves out-of-grid references unchanged instead of fabricating one', () => {
    expect(shiftFormulaRefs('=A1', -1, 0)).toBe('=A1');
    expect(shiftFormulaRefs('=A1', 0, -1)).toBe('=A1');
  });
});
