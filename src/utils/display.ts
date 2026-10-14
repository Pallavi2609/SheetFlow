import type { Cell, EvalResult } from '../types';

export function roundNumber(value: number): number {
  if (!Number.isFinite(value)) return value;
  if (value === 0) return 0;
  const rounded = Number(value.toPrecision(12));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function formatResult(result: EvalResult | undefined): string {
  if (!result) return '';
  if (result.error) return result.error;
  const value = result.value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return String(roundNumber(value));
  }
  return value;
}

export function rawDisplay(raw: string): string {
  return raw;
}

export function isFormulaRaw(raw: string): boolean {
  return raw.trimStart().startsWith('=');
}

export function literalDisplay(raw: string): string {
  return raw;
}

export function cellDisplayText(raw: string | undefined, result: EvalResult | undefined): string {
  const trimmed = (raw ?? '').trimStart();
  if (trimmed === '') return '';
  if (trimmed.startsWith('=')) {
    if (!result) return '';
    if (result.error) return result.error;
    if (result.value === null) return '';
    if (typeof result.value === 'number') {
      return Number.isInteger(result.value) ? String(result.value) : String(roundNumber(result.value));
    }
    return result.value;
  }
  return raw ?? '';
}

export function alignmentClass(cell: Cell | undefined, isNumeric: boolean): string {
  const align = cell?.format?.align;
  if (align === 'left') return 'text-left';
  if (align === 'center') return 'text-center';
  if (align === 'right') return 'text-right';
  return isNumeric ? 'text-right' : 'text-left';
}

export function fontStyleClass(cell: Cell | undefined): string {
  const classes: string[] = [];
  if (cell?.format?.bold) classes.push('font-bold');
  if (cell?.format?.italic) classes.push('italic');
  return classes.join(' ');
}
