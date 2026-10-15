import type { EvalResult } from '../types';
import { normalizeRange, parseKey, rangeKeys } from '../utils/address';
import { roundNumber } from '../utils/display';
import type { Expr } from './parser';
import { fail, toErrorCode } from './errors';

export interface EvalContext {
  get(key: string): EvalResult;
}

type CellArg = number | string | null;

const FUNCTIONS: Record<string, (values: CellArg[]) => EvalResult> = {
  SUM: (values) => sumOf(numbersOf(values)),
  MIN: (values) => {
    const nums = numbersOf(values);
    return { value: nums.length === 0 ? 0 : roundNumber(Math.min(...nums)) };
  },
  MAX: (values) => {
    const nums = numbersOf(values);
    return { value: nums.length === 0 ? 0 : roundNumber(Math.max(...nums)) };
  },
  AVERAGE: (values) => {
    const nums = numbersOf(values);
    if (nums.length === 0) return { value: null, error: '#DIV/0!' };
    const total = sumOf(nums).value as number;
    return { value: roundNumber(total / nums.length) };
  },
  POWER: (values) => {
    const nums = values.filter((v): v is number => typeof v === 'number');
    if (nums.length < 2) return { value: null, error: '#VALUE!' };
    return { value: roundNumber(Math.pow(nums[0], nums[1])) };
  },
  COUNT: (values) => ({ value: numbersOf(values).length }),
  ABS: (values) => ({ value: roundNumber(Math.abs(numericArgs('ABS', values, 1)[0])) }),
  ROUND: (values) => {
    const [value, digits] = numericArgs('ROUND', values, 2);
    return { value: roundToDigits(value, digits) };
  },
  SQRT: (values) => {
    const [value] = numericArgs('SQRT', values, 1);
    if (value < 0) fail('#VALUE!', 'SQRT expects a non-negative value');
    return { value: roundNumber(Math.sqrt(value)) };
  },
  MOD: (values) => {
    const [value, divisor] = numericArgs('MOD', values, 2);
    if (divisor === 0) return { value: null, error: '#DIV/0!' };
    // Spreadsheet-style remainder: the sign follows the divisor, not the value.
    return { value: roundNumber(((value % divisor) + divisor) % divisor) };
  },
};

function numericArg(name: string, value: CellArg): number {
  if (value === null) return 0;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  fail('#VALUE!', `${name} expects a numeric argument`);
}

/**
 * Validates the exact argument count and numeric types of the scalar functions.
 * Bare ranges arrive as several values, so they are rejected here rather than
 * silently using the first cell.
 */
function numericArgs(name: string, values: CellArg[], count: number): number[] {
  if (values.length !== count) {
    fail('#VALUE!', `${name} expects ${count === 1 ? 'one argument' : `${count} arguments`}`);
  }
  return values.map((value) => numericArg(name, value));
}

function roundToDigits(value: number, digits: number): number {
  const decimals = Math.max(-12, Math.min(12, Math.trunc(digits)));
  const factor = Math.pow(10, decimals);
  // Round the scaled value at 12 significant digits first so binary noise such as
  // 2.675 * 100 = 267.49999999999997 does not round the wrong way.
  const scaled = Number((value * factor).toPrecision(12));
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return roundNumber(rounded / factor);
}

function numbersOf(values: CellArg[]): number[] {
  const nums: number[] = [];
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) nums.push(value);
  }
  return nums;
}

function sumOf(nums: number[]): EvalResult {
  let total = 0;
  for (const n of nums) total += n;
  return { value: roundNumber(total) };
}

function asNumber(result: EvalResult): number {
  if (result.error) return 0;
  const value = result.value;
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  fail('#VALUE!', 'Text value used in arithmetic');
}

function arithmetic(op: string, a: number, b: number): EvalResult {
  switch (op) {
    case '+':
      return { value: roundNumber(a + b) };
    case '-':
      return { value: roundNumber(a - b) };
    case '*':
      return { value: roundNumber(a * b) };
    case '/':
      if (b === 0) return { value: null, error: '#DIV/0!' };
      return { value: roundNumber(a / b) };
    default:
      return { value: null, error: '#ERROR!' };
  }
}

export function evaluate(ast: Expr, ctx: EvalContext): EvalResult {
  try {
    return evaluateNode(ast, ctx);
  } catch (error) {
    return { value: null, error: toErrorCode(error) };
  }
}

function evaluateNode(ast: Expr, ctx: EvalContext): EvalResult {
  switch (ast.kind) {
    case 'num':
      return { value: ast.value };
    case 'ref':
      return ctx.get(ast.key);
    case 'range':
      return fail('#VALUE!', 'A range cannot be used as a single value');
    case 'unary': {
      const operand = evaluateNode(ast.operand, ctx);
      if (operand.error) return operand;
      if (operand.value === null) return { value: 0 };
      if (typeof operand.value !== 'number') fail('#VALUE!', 'Cannot negate text');
      return { value: roundNumber(ast.op === '-' ? -operand.value : operand.value) };
    }
    case 'bin': {
      const left = evaluateNode(ast.left, ctx);
      if (left.error) return left;
      const right = evaluateNode(ast.right, ctx);
      if (right.error) return right;
      return arithmetic(ast.op, asNumber(left), asNumber(right));
    }
    case 'call': {
      const handler = FUNCTIONS[ast.name];
      if (!handler) fail('#NAME?', `Unknown function ${ast.name}`);
      const values: CellArg[] = [];
      for (const arg of ast.args) {
        if (arg.kind === 'range') {
          for (const key of keysOfRange(arg.start, arg.end)) {
            const result = ctx.get(key);
            if (result.error) return { value: null, error: result.error };
            values.push(result.value);
          }
        } else {
          const result = evaluateNode(arg, ctx);
          if (result.error) return result;
          values.push(result.value);
        }
      }
      return handler(values);
    }
  }
}

function keysOfRange(start: string, end: string): string[] {
  const a = parseKey(start);
  const b = parseKey(end);
  if (!a || !b) fail('#REF!', 'Invalid range');
  return rangeKeys(normalizeRange(a, b));
}
