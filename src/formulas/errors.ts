import type { CellErrorCode } from '../types';

export class FormulaError extends Error {
  readonly code: CellErrorCode;

  constructor(code: CellErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'FormulaError';
    this.code = code;
  }
}

export function fail(code: CellErrorCode, message?: string): never {
  throw new FormulaError(code, message);
}

export function toErrorCode(error: unknown): CellErrorCode {
  if (error instanceof FormulaError) return error.code;
  return '#ERROR!';
}
