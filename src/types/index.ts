
export const GRID_ROWS = 100;
export const GRID_COLS = 26;

export type CellErrorCode = '#ERROR!' | '#REF!' | '#DIV/0!' | '#CYCLE!' | '#VALUE!' | '#NAME?';

export interface Cell {
  raw: string;
  format?: CellFormat;
}

export interface CellFormat {
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface EvalResult {
  value: number | string | null;
  error?: CellErrorCode;
}

export interface GridPos {
  row: number;
  col: number;
}

export interface Selection {
  anchor: GridPos;
  focus: GridPos;
}

export interface NormalizedRange {
  minRow: number;
  maxRow: number;
  minCol: number;
  maxCol: number;
}

export type EditSource = 'cell' | 'formulaBar';

export interface EditState {
  key: string;
  draft: string;
  source: EditSource;
}

export interface ClipboardPayload {
  rows: string[][];
  origin: GridPos;
}

export const STORAGE_VERSION = 1;
export const STORAGE_KEY = 'sheetflow:spreadsheet';

export const GRID_ID = 'sheetflow-grid';
