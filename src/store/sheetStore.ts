import { create } from 'zustand';

import { evaluateRaw } from '../formulas';
import { shiftFormulaRefs } from '../formulas/shift';
import type {
  Cell,
  CellFormat,
  ClipboardPayload,
  EditSource,
  EditState,
  EvalResult,
  GridPos,
  NormalizedRange,
  Selection,
} from '../types';
import { GRID_COLS, GRID_ROWS } from '../types';
import { parseKey, rangePositions, selectionRange, toKey } from '../utils/address';
import { cellsToCsv, parseCsv, parseDelimitedText } from '../utils/csv';
import type { CsvExportOptions } from '../utils/csv';
import { cellDisplayText, isFormulaRaw } from '../utils/display';
import { clearStoredSheet, loadStoredSheet, saveStoredSheet } from '../utils/persistence';

interface Snapshot {
  cells: Record<string, Cell>;
}

const HISTORY_LIMIT = 100;

interface RecalcResult {
  computed: Record<string, EvalResult>;
  deps: Record<string, string[]>;
  revDeps: Record<string, string[]>;
}

export function recalculate(cells: Record<string, Cell>): RecalcResult {
  const computed: Record<string, EvalResult> = {};
  const deps: Record<string, string[]> = {};
  const revDeps: Record<string, string[]> = {};
  const visiting = new Set<string>();

  const evalCell = (key: string): EvalResult => {
    const cached = computed[key];
    if (cached !== undefined) return cached;
    if (visiting.has(key)) return { value: null, error: '#CYCLE!' };
    visiting.add(key);
    const raw = cells[key]?.raw ?? '';
    const outcome = evaluateRaw(raw, { get: evalCell });
    visiting.delete(key);
    computed[key] = outcome.result;
    if (outcome.refs.length > 0) {
      deps[key] = outcome.refs;
      for (const ref of outcome.refs) {
        const list = revDeps[ref];
        if (list) list.push(key);
        else revDeps[ref] = [key];
      }
    }
    return outcome.result;
  };

  for (const key of Object.keys(cells)) {
    evalCell(key);
  }
  return { computed, deps, revDeps };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export const MIN_COL_WIDTH = 48;
export const MAX_COL_WIDTH = 480;
export const MIN_ROW_HEIGHT = 20;
export const MAX_ROW_HEIGHT = 200;

function clampWidth(width: number): number {
  return Math.round(clamp(width, MIN_COL_WIDTH, MAX_COL_WIDTH));
}

function clampHeight(height: number): number {
  return Math.round(clamp(height, MIN_ROW_HEIGHT, MAX_ROW_HEIGHT));
}

function clampPos(pos: GridPos): GridPos {
  return {
    row: clamp(pos.row, 0, GRID_ROWS - 1),
    col: clamp(pos.col, 0, GRID_COLS - 1),
  };
}

const DEFAULT_SELECTION: Selection = { anchor: { row: 0, col: 0 }, focus: { row: 0, col: 0 } };

let saveTimer: ReturnType<typeof setTimeout> | null = null;
const SAVE_FLASH_MS = 400;

function scheduleSavedStatus(): void {
  if (saveTimer !== null) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    useSheetStore.setState({ saveStatus: 'saved' });
  }, SAVE_FLASH_MS);
}

export interface SheetState {
  cells: Record<string, Cell>;
  computed: Record<string, EvalResult>;
  deps: Record<string, string[]>;
  revDeps: Record<string, string[]>;
  selection: Selection;
  editing: EditState | null;
  clipboard: ClipboardPayload | null;
  history: { past: Snapshot[]; future: Snapshot[] };
  saveStatus: 'saved' | 'saving' | 'error';
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  fillPreview: NormalizedRange | null;

  select: (pos: GridPos, extend?: boolean) => void;
  extendTo: (pos: GridPos) => void;
  moveFocus: (dr: number, dc: number, extend?: boolean) => void;
  clearSelectionRange: () => void;

  beginEdit: (source: EditSource, draft?: string, key?: string) => void;
  changeDraft: (draft: string) => void;
  commitEdit: (move?: GridPos | null) => void;
  cancelEdit: () => void;

  undo: () => void;
  redo: () => void;

  copy: () => ClipboardPayload | null;
  paste: () => Promise<void>;

  applyFormat: (format: Partial<CellFormat>) => void;

  setColWidth: (col: number, width: number) => void;
  setRowHeight: (row: number, height: number) => void;

  setFillPreview: (range: NormalizedRange | null) => void;
  fillRange: (source: NormalizedRange, target: NormalizedRange) => void;

  importCsvText: (text: string) => void;
  resetSheet: () => void;
  hydrate: () => void;

  getRaw: (key: string) => string;
  getDisplay: (key: string) => string;
}

function writeRaw(
  cells: Record<string, Cell>,
  key: string,
  raw: string,
): Record<string, Cell> {
  const next = { ...cells };
  if (raw === '') {
    if (key in next) delete next[key];
  } else {
    const existing = next[key];
    next[key] = existing ? { ...existing, raw } : { raw };
  }
  return next;
}

export const useSheetStore = create<SheetState>((set, get) => {
  const applyCells = (
    cells: Record<string, Cell>,
    recordHistory: boolean,
    resetHistory = false,
  ): void => {
    set((state) => {
      const recalc = recalculate(cells);
      const past = resetHistory
        ? []
        : recordHistory
          ? [...state.history.past, { cells: state.cells }].slice(-HISTORY_LIMIT)
          : state.history.past;
      const future = resetHistory || recordHistory ? [] : state.history.future;
      const saved = saveStoredSheet(cells);
      if (saved) scheduleSavedStatus();
      return {
        cells,
        ...recalc,
        history: { past, future },
        saveStatus: saved ? 'saving' : 'error',
      };
    });
  };

  return {
    cells: {},
    computed: {},
    deps: {},
    revDeps: {},
    selection: DEFAULT_SELECTION,
    editing: null,
    clipboard: null,
    history: { past: [], future: [] },
    saveStatus: 'saved',
    colWidths: {},
    rowHeights: {},
    fillPreview: null,

    select: (pos, extend = false) =>
      set((state) => {
        const focus = clampPos(pos);
        if (extend) {
          return { selection: { anchor: state.selection.anchor, focus } };
        }
        return { selection: { anchor: focus, focus } };
      }),

    extendTo: (pos) =>
      set((state) => ({
        selection: { anchor: state.selection.anchor, focus: clampPos(pos) },
      })),

    moveFocus: (dr, dc, extend = false) =>
      set((state) => {
        const focus = clampPos({
          row: state.selection.focus.row + dr,
          col: state.selection.focus.col + dc,
        });
        if (extend) {
          return { selection: { anchor: state.selection.anchor, focus } };
        }
        return { selection: { anchor: focus, focus } };
      }),

    clearSelectionRange: () => {
      const state = get();
      const { anchor, focus } = state.selection;
      const minRow = Math.min(anchor.row, focus.row);
      const maxRow = Math.max(anchor.row, focus.row);
      const minCol = Math.min(anchor.col, focus.col);
      const maxCol = Math.max(anchor.col, focus.col);
      let cells = state.cells;
      let changed = false;
      for (let r = minRow; r <= maxRow; r++) {
        for (let c = minCol; c <= maxCol; c++) {
          const key = toKey(r, c);
          if (key in cells) {
            cells = writeRaw(cells, key, '');
            changed = true;
          }
        }
      }
      if (!changed) return;
      applyCells(cells, true);
    },

    beginEdit: (source, draft, key) =>
      set((state) => {
        if (state.editing && draft === undefined) return {};
        const target = clampPos(
          key ? (parseKey(key) ?? state.selection.focus) : state.selection.focus,
        );
        const targetKey = toKey(target.row, target.col);
        const raw = state.cells[targetKey]?.raw ?? '';
        return {
          editing: {
            key: targetKey,
            draft: draft !== undefined ? draft : raw,
            source,
          },
        };
      }),

    changeDraft: (draft) =>
      set((state) => (state.editing ? { editing: { ...state.editing, draft } } : {})),

    commitEdit: (move = null) =>
      set((state) => {
        const edit = state.editing;
        if (!edit) return {};
        const nextEditing = null;
        const previousRaw = state.cells[edit.key]?.raw ?? '';
        const nextRaw = edit.draft;
        if (nextRaw === previousRaw) {
          return { editing: nextEditing };
        }
        const cells = writeRaw(state.cells, edit.key, nextRaw);
        const recalc = recalculate(cells);
        const past = [...state.history.past, { cells: state.cells }].slice(-HISTORY_LIMIT);
        const future: Snapshot[] = [];
        const saved = saveStoredSheet(cells);
        if (saved) scheduleSavedStatus();
        let selection = state.selection;
        if (move) {
          const focus = clampPos({
            row: state.selection.focus.row + move.row,
            col: state.selection.focus.col + move.col,
          });
          selection = { anchor: focus, focus };
        }
        return {
          editing: nextEditing,
          cells,
          ...recalc,
          history: { past, future },
          saveStatus: saved ? 'saving' : 'error',
          selection,
        };
      }),

    cancelEdit: () => set({ editing: null }),

    undo: () => {
      const state = get();
      if (state.history.past.length === 0) return;
      const past = state.history.past.slice(0, -1);
      const snapshot = state.history.past[state.history.past.length - 1];
      const cells = snapshot.cells;
      const recalc = recalculate(cells);
      const future = [{ cells: state.cells }, ...state.history.future].slice(0, HISTORY_LIMIT);
      const saved = saveStoredSheet(cells);
      if (saved) scheduleSavedStatus();
      set({
        cells,
        ...recalc,
        history: { past, future },
        editing: null,
        saveStatus: saved ? 'saving' : 'error',
      });
    },

    redo: () => {
      const state = get();
      if (state.history.future.length === 0) return;
      const [snapshot, ...future] = state.history.future;
      const cells = snapshot.cells;
      const recalc = recalculate(cells);
      const past = [...state.history.past, { cells: state.cells }].slice(-HISTORY_LIMIT);
      const saved = saveStoredSheet(cells);
      if (saved) scheduleSavedStatus();
      set({
        cells,
        ...recalc,
        history: { past, future },
        editing: null,
        saveStatus: saved ? 'saving' : 'error',
      });
    },

    copy: () => {
      const state = get();
      const { anchor, focus } = state.selection;
      const minRow = Math.min(anchor.row, focus.row);
      const maxRow = Math.max(anchor.row, focus.row);
      const minCol = Math.min(anchor.col, focus.col);
      const maxCol = Math.max(anchor.col, focus.col);
      const rows: string[][] = [];
      for (let r = minRow; r <= maxRow; r++) {
        const row: string[] = [];
        for (let c = minCol; c <= maxCol; c++) {
          row.push(state.cells[toKey(r, c)]?.raw ?? '');
        }
        rows.push(row);
      }
      const payload: ClipboardPayload = { rows, origin: { row: minRow, col: minCol } };
      set({ clipboard: payload });
      return payload;
    },

    paste: async () => {
      let rows: string[][] | null = null;
      try {
        const text = await navigator.clipboard?.readText?.();
        if (text) rows = parseDelimitedText(text);
      } catch {
        rows = null;
      }
      if (!rows || rows.length === 0) rows = get().clipboard?.rows ?? null;
      if (!rows || rows.length === 0) return;

      const state = get();
      const startRow = Math.min(state.selection.anchor.row, state.selection.focus.row);
      const startCol = Math.min(state.selection.anchor.col, state.selection.focus.col);
      let cells = state.cells;
      let changed = false;
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          const row = startRow + r;
          const col = startCol + c;
          if (row >= GRID_ROWS || col >= GRID_COLS) continue;
          const key = toKey(row, col);
          const value = rows[r][c] ?? '';
          if ((cells[key]?.raw ?? '') === value && value === '') continue;
          cells = writeRaw(cells, key, value);
          changed = true;
        }
      }
      if (!changed) return;
      applyCells(cells, true);
      const endRow = clamp(startRow + rows.length - 1, 0, GRID_ROWS - 1);
      const endCol = clamp(
        startCol + Math.max(...rows.map((row) => row.length)) - 1,
        0,
        GRID_COLS - 1,
      );
      set({
        selection: {
          anchor: { row: startRow, col: startCol },
          focus: { row: endRow, col: endCol },
        },
      });
    },

    applyFormat: (format) => {
      const state = get();
      const range = selectionRange(state.selection.anchor, state.selection.focus);
      let cells = state.cells;
      let changed = false;
      for (const pos of rangePositions(range)) {
        const key = toKey(pos.row, pos.col);
        const existing = cells[key];
        const merged: CellFormat = { ...existing?.format, ...format };
        const current = existing?.format;
        if (
          current?.bold === merged.bold &&
          current?.italic === merged.italic &&
          current?.align === merged.align
        ) {
          continue;
        }
        cells = { ...cells, [key]: { raw: existing?.raw ?? '', format: merged } };
        changed = true;
      }
      if (!changed) return;
      applyCells(cells, true);
    },

    setColWidth: (col, width) =>
      set((state) => ({
        colWidths: { ...state.colWidths, [col]: clampWidth(width) },
      })),

    setRowHeight: (row, height) =>
      set((state) => ({
        rowHeights: { ...state.rowHeights, [row]: clampHeight(height) },
      })),

    setFillPreview: (range) => set({ fillPreview: range }),

    fillRange: (source, target) => {
      const state = get();
      const srcHeight = source.maxRow - source.minRow + 1;
      const srcWidth = source.maxCol - source.minCol + 1;
      let cells = state.cells;
      let changed = false;
      for (let row = target.minRow; row <= target.maxRow; row++) {
        for (let col = target.minCol; col <= target.maxCol; col++) {
          if (
            row >= source.minRow &&
            row <= source.maxRow &&
            col >= source.minCol &&
            col <= source.maxCol
          ) {
            continue;
          }
          const srcRow = source.minRow + (((row - source.minRow) % srcHeight) + srcHeight) % srcHeight;
          const srcCol = source.minCol + (((col - source.minCol) % srcWidth) + srcWidth) % srcWidth;
          const srcRaw = cells[toKey(srcRow, srcCol)]?.raw ?? '';
          const dRow = row - srcRow;
          const dCol = col - srcCol;
          const value = isFormulaRaw(srcRaw) ? shiftFormulaRefs(srcRaw, dRow, dCol) : srcRaw;
          const key = toKey(row, col);
          if ((cells[key]?.raw ?? '') === value) continue;
          cells = writeRaw(cells, key, value);
          changed = true;
        }
      }
      set({ fillPreview: null });
      if (!changed) return;
      applyCells(cells, true);
    },

    importCsvText: (text) => {
      const rows = parseCsv(text);
      if (rows.length === 0) return;
      let cells: Record<string, Cell> = {};
      for (let r = 0; r < Math.min(rows.length, GRID_ROWS); r++) {
        for (let c = 0; c < Math.min(rows[r].length, GRID_COLS); c++) {
          const value = rows[r][c] ?? '';
          if (value === '') continue;
          cells = writeRaw(cells, toKey(r, c), value);
        }
      }
      applyCells(cells, true);
      set({ selection: DEFAULT_SELECTION, editing: null });
    },

    resetSheet: () => {
      clearStoredSheet();
      const recalc = recalculate({});
      set({
        cells: {},
        ...recalc,
        history: { past: [], future: [] },
        editing: null,
        clipboard: null,
        selection: DEFAULT_SELECTION,
        saveStatus: 'saved',
        colWidths: {},
        rowHeights: {},
        fillPreview: null,
      });
    },

    hydrate: () => {
      const stored = loadStoredSheet();
      const cells = stored ? stored.cells : {};
      const recalc = recalculate(cells);
      set((state) => ({
        cells,
        ...recalc,
        history: { past: [], future: [] },
        editing: null,
        saveStatus: 'saved',
        selection: state.selection,
      }));
    },

    getRaw: (key) => get().cells[key]?.raw ?? '',

    getDisplay: (key) => {
      const state = get();
      return cellDisplayText(state.cells[key]?.raw, state.computed[key]);
    },
  };
});

export function exportCsvText(cells: Record<string, Cell>, options?: CsvExportOptions): string {
  return cellsToCsv(cells, options);
}

useSheetStore.getState().hydrate();
