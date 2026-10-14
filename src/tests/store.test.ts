import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_COL_WIDTH,
  MAX_ROW_HEIGHT,
  MIN_COL_WIDTH,
  MIN_ROW_HEIGHT,
  exportCsvText,
  useSheetStore,
} from '../store/sheetStore';
import { STORAGE_KEY, STORAGE_VERSION } from '../types';
import { parseKey, toKey } from '../utils/address';
import { loadStoredSheet, sanitizeStoredSheet } from '../utils/persistence';

const store = () => useSheetStore.getState();

function setCell(key: string, raw: string): void {
  const pos = parseKey(key);
  if (!pos) throw new Error(`bad test key ${key}`);
  store().select(pos);
  store().beginEdit('cell', raw);
  store().commitEdit(null);
}

function selectRange(from: string, to: string): void {
  const a = parseKey(from);
  const b = parseKey(to);
  if (!a || !b) throw new Error('bad test range');
  store().select(a);
  store().extendTo(b);
}

beforeEach(() => {
  window.localStorage.clear();
  store().resetSheet();
});

describe('cell editing', () => {
  it('stores raw input and displays it', () => {
    setCell('A1', 'hello');
    expect(store().getRaw('A1')).toBe('hello');
    expect(store().getDisplay('A1')).toBe('hello');
  });

  it('keeps raw numbers and displays them', () => {
    setCell('B2', '42');
    expect(store().getRaw('B2')).toBe('42');
    expect(store().getDisplay('B2')).toBe('42');
  });

  it('does not create a history entry when nothing changed', () => {
    setCell('A1', '1');
    const before = store().history.past.length;
    store().select(parseKey('A1')!);
    store().beginEdit('cell');
    store().commitEdit(null);
    expect(store().history.past.length).toBe(before);
  });

  it('cancelEdit discards the draft', () => {
    setCell('A1', '1');
    store().select(parseKey('A1')!);
    store().beginEdit('cell', '999');
    store().cancelEdit();
    expect(store().editing).toBeNull();
    expect(store().getRaw('A1')).toBe('1');
  });
});

describe('formulas and recalculation', () => {
  it('C1 = =A1+B1 displays 30 for A1=10, B1=20', () => {
    setCell('A1', '10');
    setCell('B1', '20');
    setCell('C1', '=A1+B1');
    expect(store().getDisplay('C1')).toBe('30');
  });

  it('updating A1 to 50 recalculates C1 to 70 automatically', () => {
    setCell('A1', '10');
    setCell('B1', '20');
    setCell('C1', '=A1+B1');
    setCell('A1', '50');
    expect(store().getDisplay('C1')).toBe('70');
  });

  it('chains dependencies through multiple levels', () => {
    setCell('A1', '2');
    setCell('B1', '=A1*3');
    setCell('C1', '=B1+A1');
    expect(store().getDisplay('C1')).toBe('8');
    setCell('A1', '5');
    expect(store().getDisplay('B1')).toBe('15');
    expect(store().getDisplay('C1')).toBe('20');
  });

  it('SUM over a range recalculates when a member changes', () => {
    setCell('A1', '1');
    setCell('A2', '2');
    setCell('A3', '3');
    setCell('B1', '=SUM(A1:A3)');
    expect(store().getDisplay('B1')).toBe('6');
    setCell('A2', '20');
    expect(store().getDisplay('B1')).toBe('24');
  });

  it('records dependencies and reverse dependencies', () => {
    setCell('A1', '1');
    setCell('B1', '=A1+1');
    expect(store().deps['B1']).toEqual(['A1']);
    expect(store().revDeps['A1']).toEqual(['B1']);
  });

  it('shows #DIV/0! for division by zero', () => {
    setCell('A1', '=1/0');
    expect(store().getDisplay('A1')).toBe('#DIV/0!');
  });

  it('shows #ERROR! for invalid formulas', () => {
    setCell('A1', '=SUM(');
    expect(store().getDisplay('A1')).toBe('#ERROR!');
  });

  it('shows #NAME? for unknown functions', () => {
    setCell('A1', '=NOPE(1)');
    expect(store().getDisplay('A1')).toBe('#NAME?');
  });

  it('shows #REF! for out-of-grid references', () => {
    setCell('A1', '=ZZZ999');
    expect(store().getDisplay('A1')).toBe('#REF!');
  });
});

describe('circular references', () => {
  it('shows #CYCLE! for a self-referencing formula without hanging', () => {
    setCell('A1', '=A1');
    expect(store().getDisplay('A1')).toBe('#CYCLE!');
  });

  it('shows #CYCLE! for mutual references', () => {
    setCell('A1', '=B1');
    setCell('B1', '=A1');
    expect(store().getDisplay('A1')).toBe('#CYCLE!');
    expect(store().getDisplay('B1')).toBe('#CYCLE!');
  });

  it('recovers after the cycle is broken', () => {
    setCell('A1', '=B1+1');
    setCell('B1', '=A1+1');
    expect(store().getDisplay('A1')).toBe('#CYCLE!');
    setCell('B1', '10');
    expect(store().getDisplay('A1')).toBe('11');
  });
});

describe('undo and redo', () => {
  it('undo restores the previous cell map', () => {
    setCell('A1', '1');
    setCell('A1', '2');
    setCell('A1', '3');
    store().undo();
    expect(store().getRaw('A1')).toBe('2');
    store().undo();
    expect(store().getRaw('A1')).toBe('1');
  });

  it('redo re-applies an undone change', () => {
    setCell('A1', '1');
    setCell('A1', '2');
    store().undo();
    expect(store().getRaw('A1')).toBe('1');
    store().redo();
    expect(store().getRaw('A1')).toBe('2');
  });

  it('undo recomputes dependent formulas', () => {
    setCell('A1', '10');
    setCell('B1', '=A1*2');
    setCell('A1', '50');
    expect(store().getDisplay('B1')).toBe('100');
    store().undo();
    expect(store().getDisplay('B1')).toBe('20');
  });

  it('a new edit clears the redo stack', () => {
    setCell('A1', '1');
    setCell('A1', '2');
    store().undo();
    setCell('A1', '9');
    expect(store().history.future).toHaveLength(0);
  });

  it('undo is a no-op on an empty history', () => {
    setCell('A1', '1');
    store().undo();
    store().undo();
    expect(store().getRaw('A1')).toBe('');
    expect(store().history.past).toHaveLength(0);
  });
});

describe('clear, copy, and paste', () => {
  it('clearSelectionRange empties a single cell', () => {
    setCell('A1', '5');
    store().select(parseKey('A1')!);
    store().clearSelectionRange();
    expect(store().getRaw('A1')).toBe('');
  });

  it('clearSelectionRange empties a multi-cell range', () => {
    setCell('A1', '1');
    setCell('B1', '2');
    setCell('A2', '3');
    setCell('B2', '4');
    selectRange('A1', 'B2');
    store().clearSelectionRange();
    expect(Object.keys(store().cells)).toHaveLength(0);
  });

  it('copies and pastes a single cell', async () => {
    setCell('A1', '7');
    store().select(parseKey('A1')!);
    const payload = store().copy();
    expect(payload?.rows).toEqual([['7']]);
    store().select(parseKey('C3')!);
    await store().paste();
    expect(store().getRaw('C3')).toBe('7');
  });

  it('copies and pastes a range block', async () => {
    setCell('A1', '1');
    setCell('B1', '2');
    setCell('A2', '3');
    setCell('B2', '4');
    selectRange('A1', 'B2');
    store().copy();
    store().select(parseKey('D1')!);
    await store().paste();
    expect(store().getRaw('D1')).toBe('1');
    expect(store().getRaw('E1')).toBe('2');
    expect(store().getRaw('D2')).toBe('3');
    expect(store().getRaw('E2')).toBe('4');
  });

  it('pasting a formula keeps relative references to the pasted location', async () => {
    setCell('A1', '10');
    setCell('B1', '=A1*2');
    store().select(parseKey('B1')!);
    store().copy();
    store().select(parseKey('B3')!);
    await store().paste();
    expect(store().getRaw('B3')).toBe('=A1*2');
    expect(store().getDisplay('B3')).toBe('20');
  });
});

describe('selection', () => {
  it('clamps movement at the grid edges', () => {
    store().select(parseKey('A1')!);
    store().moveFocus(-5, -5);
    expect(store().selection.focus).toEqual({ row: 0, col: 0 });
  });

  it('extends the selection with moveFocus(extend)', () => {
    store().select(parseKey('B2')!);
    store().moveFocus(1, 0, true);
    store().moveFocus(0, 1, true);
    expect(store().selection.anchor).toEqual({ row: 1, col: 1 });
    expect(store().selection.focus).toEqual({ row: 2, col: 2 });
  });
});

describe('formatting', () => {
  it('applies bold to every cell in the selection', () => {
    setCell('A1', '1');
    setCell('B1', '2');
    selectRange('A1', 'B1');
    store().applyFormat({ bold: true });
    expect(store().cells['A1']?.format?.bold).toBe(true);
    expect(store().cells['B1']?.format?.bold).toBe(true);
  });

  it('preserves raw content when formatting', () => {
    setCell('A1', 'keep me');
    store().select(parseKey('A1')!);
    store().applyFormat({ italic: true });
    expect(store().getRaw('A1')).toBe('keep me');
    expect(store().cells['A1']?.format?.italic).toBe(true);
  });

  it('format changes are undoable', () => {
    setCell('A1', '1');
    store().select(parseKey('A1')!);
    store().applyFormat({ bold: true });
    store().undo();
    expect(store().cells['A1']?.format?.bold).toBeFalsy();
  });
});

describe('CSV import and export', () => {
  it('imports CSV text into the grid', () => {
    store().importCsvText('1,2\n3,4');
    expect(store().getRaw('A1')).toBe('1');
    expect(store().getRaw('B1')).toBe('2');
    expect(store().getRaw('A2')).toBe('3');
    expect(store().getRaw('B2')).toBe('4');
  });

  it('imports quoted CSV fields', () => {
    store().importCsvText('"a,b",c');
    expect(store().getRaw('A1')).toBe('a,b');
    expect(store().getRaw('B1')).toBe('c');
  });

  it('exports the used rectangle as CSV', () => {
    setCell('A1', 'x');
    setCell('B1', 'y');
    setCell('A2', '1');
    expect(exportCsvText(store().cells)).toBe('x,y\n1,');
  });

  it('escapes quotes and commas on export', () => {
    setCell('A1', 'say "hi", ok');
    expect(exportCsvText(store().cells)).toBe('"say ""hi"", ok"');
  });

  it('export/import round-trips raw content', () => {
    setCell('A1', 'plain');
    setCell('B1', '=1+1');
    setCell('C1', 'has,comma');
    const csv = exportCsvText(store().cells, { neutralize: false });
    store().resetSheet();
    store().importCsvText(csv);
    expect(store().getRaw('A1')).toBe('plain');
    expect(store().getRaw('B1')).toBe('=1+1');
    expect(store().getRaw('C1')).toBe('has,comma');
  });
});

describe('persistence', () => {
  it('saves committed cells to localStorage', () => {
    setCell('A1', '7');
    const stored = loadStoredSheet();
    expect(stored?.cells['A1']?.raw).toBe('7');
    expect(stored?.version).toBe(STORAGE_VERSION);
  });

  it('restores data after a simulated refresh via hydrate', () => {
    setCell('A1', '10');
    setCell('B1', '=A1*2');
    useSheetStore.setState({ cells: {}, computed: {}, deps: {}, revDeps: {} });
    store().hydrate();
    expect(store().getRaw('A1')).toBe('10');
    expect(store().getDisplay('B1')).toBe('20');
  });

  it('ignores corrupted storage payloads', () => {
    window.localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadStoredSheet()).toBeNull();
    store().hydrate();
    expect(store().cells).toEqual({});
  });

  it('ignores payloads with an unknown version', () => {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: STORAGE_VERSION + 1, cells: { A1: { raw: '1' } } }),
    );
    expect(loadStoredSheet()).toBeNull();
  });

  it('sanitize drops malformed cell entries but keeps valid ones', () => {
    const clean = sanitizeStoredSheet({
      version: STORAGE_VERSION,
      cells: { A1: { raw: 'ok' }, B1: { raw: 42 }, C1: 'nope', D1: null },
    });
    expect(clean?.cells).toEqual({ A1: { raw: 'ok' } });
  });

  it('reports failure when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota exceeded');
    });
    setCell('A1', '1');
    expect(store().saveStatus).toBe('error');
  });
});

describe('reset', () => {
  it('clears cells, history, clipboard, and persistent storage', async () => {
    setCell('A1', '1');
    setCell('B1', '=A1+1');
    store().copy();
    store().resetSheet();
    expect(store().cells).toEqual({});
    expect(store().history.past).toHaveLength(0);
    expect(store().history.future).toHaveLength(0);
    expect(store().clipboard).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('reset is undoable for cells but storage stays cleared', () => {
    setCell('A1', '1');
    store().resetSheet();
    expect(store().history.past).toHaveLength(0);
  });
});

describe('sparse storage invariants', () => {
  it('empty cells are not stored', () => {
    setCell('A1', 'x');
    store().select(parseKey('A1')!);
    store().beginEdit('cell', '');
    store().commitEdit(null);
    expect(store().cells['A1']).toBeUndefined();
  });

  it('keys use A1-style addressing', () => {
    setCell('A1', '1');
    setCell(toKey(25, 25), '2');
    expect(store().cells['Z26']?.raw).toBe('2');
  });
});

describe('whitespace preservation (ISS-05)', () => {
  it('preserves leading and trailing spaces in text input', () => {
    setCell('A1', '  hello  ');
    expect(store().getRaw('A1')).toBe('  hello  ');
    expect(store().getDisplay('A1')).toBe('  hello  ');
  });

  it('stores whitespace-only input but displays nothing', () => {
    setCell('A1', '   ');
    expect(store().cells['A1']?.raw).toBe('   ');
    expect(store().getDisplay('A1')).toBe('');
  });

  it('treats truly empty input as clearing the cell', () => {
    setCell('A1', 'x');
    store().select(parseKey('A1')!);
    store().beginEdit('cell', '');
    store().commitEdit(null);
    expect(store().cells['A1']).toBeUndefined();
  });
});

describe('fill handle / drag-to-copy (optional feature)', () => {
  const single = (row: number, col: number) => ({ minRow: row, maxRow: row, minCol: col, maxCol: col });

  it('copies a literal value down', () => {
    setCell('A1', '7');
    store().fillRange(single(0, 0), { minRow: 0, maxRow: 2, minCol: 0, maxCol: 0 });
    expect(store().getRaw('A2')).toBe('7');
    expect(store().getRaw('A3')).toBe('7');
  });

  it('shifts relative references when filling a formula down', () => {
    setCell('A1', '1');
    setCell('A2', '2');
    setCell('A3', '3');
    setCell('B1', '=A1*2');
    store().fillRange(single(0, 1), { minRow: 0, maxRow: 2, minCol: 1, maxCol: 1 });
    expect(store().getRaw('B2')).toBe('=A2*2');
    expect(store().getRaw('B3')).toBe('=A3*2');
    expect(store().getDisplay('B3')).toBe('6');
  });

  it('shifts references when filling right', () => {
    setCell('A1', '1');
    setCell('B1', '2');
    setCell('C1', '3');
    setCell('A2', '=A1+10');
    store().fillRange(single(1, 0), { minRow: 1, maxRow: 1, minCol: 0, maxCol: 2 });
    expect(store().getRaw('B2')).toBe('=B1+10');
    expect(store().getRaw('C2')).toBe('=C1+10');
  });

  it('tiles a multi-cell source block', () => {
    setCell('A1', '1');
    setCell('A2', '2');
    store().fillRange({ minRow: 0, maxRow: 1, minCol: 0, maxCol: 0 }, { minRow: 0, maxRow: 3, minCol: 0, maxCol: 0 });
    expect(store().getRaw('A3')).toBe('1');
    expect(store().getRaw('A4')).toBe('2');
  });

  it('records a single undoable history entry for the whole fill', () => {
    setCell('A1', '5');
    const before = store().history.past.length;
    store().fillRange(single(0, 0), { minRow: 0, maxRow: 4, minCol: 0, maxCol: 0 });
    expect(store().history.past.length).toBe(before + 1);
    store().undo();
    expect(store().getRaw('A2')).toBe('');
    expect(store().getRaw('A5')).toBe('');
  });

  it('is a no-op when the target equals the source', () => {
    setCell('A1', '9');
    store().fillRange(single(0, 0), single(0, 0));
    expect(store().getRaw('A1')).toBe('9');
    expect(store().history.past).toHaveLength(1);
  });

  it('clears the fill preview after committing', () => {
    setCell('A1', '1');
    store().setFillPreview({ minRow: 0, maxRow: 3, minCol: 0, maxCol: 0 });
    store().fillRange(single(0, 0), { minRow: 0, maxRow: 3, minCol: 0, maxCol: 0 });
    expect(store().fillPreview).toBeNull();
  });
});

describe('CSV export security (ISS-07)', () => {
  it('neutralises formula-injection prefixes by default', () => {
    setCell('A1', '=1+1');
    setCell('B1', '+SUM(1)');
    setCell('C1', '-5');
    setCell('D1', '@cmd');
    expect(exportCsvText(store().cells)).toBe("'=1+1,'+SUM(1),'-5,'@cmd");
  });

  it('leaves ordinary text unchanged', () => {
    setCell('A1', 'plain');
    setCell('B1', 'has,comma');
    expect(exportCsvText(store().cells)).toBe('plain,"has,comma"');
  });

  it('preserves formulas verbatim in raw mode', () => {
    setCell('A1', '=1+1');
    expect(exportCsvText(store().cells, { neutralize: false })).toBe('=1+1');
  });

  it('neutralises dangerous imported text when re-exported', () => {
    store().importCsvText("=cmd|'/c calc'!A1");
    const csv = exportCsvText(store().cells);
    expect(csv.startsWith("'=")).toBe(true);
  });
});

describe('column and row sizing (optional feature)', () => {
  it('clamps column width to the allowed range', () => {
    store().setColWidth(0, 10);
    expect(store().colWidths[0]).toBe(MIN_COL_WIDTH);
    store().setColWidth(0, 10000);
    expect(store().colWidths[0]).toBe(MAX_COL_WIDTH);
    store().setColWidth(0, 150);
    expect(store().colWidths[0]).toBe(150);
  });

  it('clamps row height to the allowed range', () => {
    store().setRowHeight(0, 1);
    expect(store().rowHeights[0]).toBe(MIN_ROW_HEIGHT);
    store().setRowHeight(0, 10000);
    expect(store().rowHeights[0]).toBe(MAX_ROW_HEIGHT);
  });

  it('reset clears custom sizes', () => {
    store().setColWidth(0, 200);
    store().setRowHeight(0, 60);
    store().resetSheet();
    expect(store().colWidths).toEqual({});
    expect(store().rowHeights).toEqual({});
  });
});

describe('asynchronous clipboard (ISS-04)', () => {
  it('pastes at the selection that is active when the clipboard resolves', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    let release: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      release = resolve;
    });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { readText: () => pending },
    });
    try {
      store().select(parseKey('B1')!);
      const pasting = store().paste();
      store().select(parseKey('D5')!);
      release('99');
      await pasting;
      expect(store().getRaw('D5')).toBe('99');
      expect(store().getRaw('B1')).toBe('');
    } finally {
      if (original) Object.defineProperty(navigator, 'clipboard', original);
      else Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined });
    }
  });
});
