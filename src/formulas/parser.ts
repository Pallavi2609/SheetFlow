import type { GridPos } from '../types';
import { parseKey, toKey } from '../utils/address';
import { fail } from './errors';
import type { Token, TokenType } from './tokenizer';
import { tokenize } from './tokenizer';

export type BinaryOp = '+' | '-' | '*' | '/';

export type Expr =
  | { kind: 'num'; value: number }
  | { kind: 'ref'; key: string }
  | { kind: 'range'; start: string; end: string }
  | { kind: 'bin'; op: BinaryOp; left: Expr; right: Expr }
  | { kind: 'unary'; op: '-' | '+'; operand: Expr }
  | { kind: 'call'; name: string; args: Expr[] };

const CELL_REF_RE = /^[A-Za-z]{1,3}[1-9][0-9]*$/;

class Parser {
  private pos = 0;
  private readonly tokens: Token[];

  constructor(source: string) {
    this.tokens = tokenize(source);
  }

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)];
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos += 1;
    return token;
  }

  private match(type: TokenType): boolean {
    if (this.peek().type === type) {
      this.pos += 1;
      return true;
    }
    return false;
  }

  parseExpression(): Expr {
    const expr = this.parseAdditive();
    if (this.peek().type !== 'eof') {
      fail('#ERROR!', `Unexpected token "${this.peek().value}"`);
    }
    return expr;
  }

  private parseAdditive(): Expr {
    let left = this.parseMultiplicative();
    while (this.peek().type === 'operator' && (this.peek().value === '+' || this.peek().value === '-')) {
      const op = this.next().value as BinaryOp;
      const right = this.parseMultiplicative();
      left = { kind: 'bin', op, left, right };
    }
    return left;
  }

  private parseMultiplicative(): Expr {
    let left = this.parseUnary();
    while (
      this.peek().type === 'operator' &&
      (this.peek().value === '*' || this.peek().value === '/')
    ) {
      const op = this.next().value as BinaryOp;
      const right = this.parseUnary();
      left = { kind: 'bin', op, left, right };
    }
    return left;
  }

  private parseUnary(): Expr {
    if (this.peek().type === 'operator' && (this.peek().value === '-' || this.peek().value === '+')) {
      const op = this.next().value as '-' | '+';
      return { kind: 'unary', op, operand: this.parseUnary() };
    }
    return this.parsePower();
  }

  private parsePower(): Expr {
    const base = this.parsePrimary();
    if (this.peek().type === 'operator' && this.peek().value === '^') {
      this.next();
      const exponent = this.parseUnary();
      return { kind: 'call', name: 'POWER', args: [base, exponent] };
    }
    return base;
  }

  private parsePrimary(): Expr {
    const token = this.peek();
    if (token.type === 'number') {
      this.next();
      return { kind: 'num', value: token.num ?? 0 };
    }
    if (token.type === 'lparen') {
      this.next();
      const inner = this.parseAdditive();
      if (!this.match('rparen')) fail('#ERROR!', 'Missing closing parenthesis');
      return inner;
    }
    if (token.type === 'ident') {
      const ident = this.next().value;
      if (this.peek().type === 'lparen') {
        return this.parseCall(ident);
      }
      if (this.peek().type === 'colon') {
        return this.parseRange(ident);
      }
      return this.refExpr(ident);
    }
    fail('#ERROR!', token.type === 'eof' ? 'Unexpected end of formula' : `Unexpected "${token.value}"`);
  }

  private parseCall(name: string): Expr {
    this.next();
    const args: Expr[] = [];
    if (this.peek().type === 'rparen') {
      this.next();
      return { kind: 'call', name: name.toUpperCase(), args };
    }
    while (true) {
      args.push(this.parseAdditive());
      if (this.match('comma')) continue;
      if (this.match('rparen')) break;
      fail('#ERROR!', `Malformed call to ${name}`);
    }
    return { kind: 'call', name: name.toUpperCase(), args };
  }

  private parseRange(startIdent: string): Expr {
    this.next();
    const endToken = this.next();
    if (endToken.type !== 'ident') fail('#ERROR!', 'Malformed range');
    const start = this.refKey(startIdent);
    const end = this.refKey(endToken.value);
    return { kind: 'range', start, end };
  }

  private refExpr(ident: string): Expr {
    return { kind: 'ref', key: this.refKey(ident) };
  }

  private refKey(ident: string): string {
    const upper = ident.toUpperCase();
    if (!CELL_REF_RE.test(upper)) fail('#NAME?', `Unknown name "${ident}"`);
    const pos: GridPos | null = parseKey(upper);
    if (!pos) fail('#REF!', `"${ident}" is outside the grid`);
    return toKey(pos.row, pos.col);
  }
}

export function parseFormula(source: string): Expr {
  return new Parser(source).parseExpression();
}
