import type { EvalResult } from '../types';
import { normalizeRange, parseKey, rangeKeys } from '../utils/address';
import { isFormulaRaw } from '../utils/display';
import { evaluate } from './evaluator';
import type { EvalContext } from './evaluator';
import { toErrorCode } from './errors';
import type { Expr } from './parser';
import { parseFormula } from './parser';

export interface RawEvaluation {
  result: EvalResult;
  refs: string[];
}

const PARSE_CACHE = new Map<string, Expr>();
const PARSE_CACHE_LIMIT = 1000;

function parseCached(body: string): Expr {
  const cached = PARSE_CACHE.get(body);
  if (cached) return cached;
  const ast = parseFormula(body);
  if (PARSE_CACHE.size >= PARSE_CACHE_LIMIT) {
    const oldest = PARSE_CACHE.keys().next().value;
    if (oldest !== undefined) PARSE_CACHE.delete(oldest);
  }
  PARSE_CACHE.set(body, ast);
  return ast;
}

export function clearParseCache(): void {
  PARSE_CACHE.clear();
}

export function collectRefs(ast: Expr): string[] {
  const refs = new Set<string>();
  const visit = (node: Expr): void => {
    switch (node.kind) {
      case 'ref':
        refs.add(node.key);
        break;
      case 'range': {
        const a = parseKey(node.start);
        const b = parseKey(node.end);
        if (a && b) {
          for (const key of rangeKeys(normalizeRange(a, b))) refs.add(key);
        }
        break;
      }
      case 'bin':
        visit(node.left);
        visit(node.right);
        break;
      case 'unary':
        visit(node.operand);
        break;
      case 'call':
        node.args.forEach(visit);
        break;
      case 'num':
        break;
    }
  };
  visit(ast);
  return [...refs];
}

const NUMERIC_LITERAL_RE = /^[-+]?(\d+(\.\d*)?|\.\d+)([eE][-+]?\d+)?$/;

export function evaluateRaw(raw: string, ctx: EvalContext): RawEvaluation {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { result: { value: null }, refs: [] };
  }
  if (!isFormulaRaw(raw)) {
    if (NUMERIC_LITERAL_RE.test(trimmed)) {
      return { result: { value: Number(trimmed) }, refs: [] };
    }
    return { result: { value: trimmed }, refs: [] };
  }

  let ast: Expr;
  try {
    ast = parseCached(trimmed.slice(1));
  } catch (error) {
    return { result: { value: null, error: toErrorCode(error) }, refs: [] };
  }
  return { result: evaluate(ast, ctx), refs: collectRefs(ast) };
}

export type { EvalContext };
export type { Expr } from './parser';
export { parseFormula } from './parser';
export { FormulaError } from './errors';
export { evaluate } from './evaluator';
