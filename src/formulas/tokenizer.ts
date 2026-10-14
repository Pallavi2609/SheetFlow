import { fail } from './errors';

export type TokenType = 'number' | 'ident' | 'operator' | 'lparen' | 'rparen' | 'comma' | 'colon' | 'eof';

export interface Token {
  type: TokenType;
  value: string;
  num?: number;
}

const NUMBER_RE = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*/;
const OPERATORS = new Set(['+', '-', '*', '/', '^']);

export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < source.length) {
    const ch = source[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    const rest = source.slice(i);
    const numberMatch = NUMBER_RE.exec(rest);
    if (numberMatch) {
      tokens.push({ type: 'number', value: numberMatch[0], num: Number(numberMatch[0]) });
      i += numberMatch[0].length;
      continue;
    }
    const identMatch = IDENT_RE.exec(rest);
    if (identMatch) {
      tokens.push({ type: 'ident', value: identMatch[0] });
      i += identMatch[0].length;
      continue;
    }
    if (OPERATORS.has(ch)) {
      tokens.push({ type: 'operator', value: ch });
      i += 1;
      continue;
    }
    if (ch === '(') {
      tokens.push({ type: 'lparen', value: '(' });
      i += 1;
      continue;
    }
    if (ch === ')') {
      tokens.push({ type: 'rparen', value: ')' });
      i += 1;
      continue;
    }
    if (ch === ',') {
      tokens.push({ type: 'comma', value: ',' });
      i += 1;
      continue;
    }
    if (ch === ':') {
      tokens.push({ type: 'colon', value: ':' });
      i += 1;
      continue;
    }
    fail('#ERROR!', `Unexpected character "${ch}"`);
  }
  tokens.push({ type: 'eof', value: '' });
  return tokens;
}
