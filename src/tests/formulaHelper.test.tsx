import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import App from '../App';
import { useSheetStore } from '../store/sheetStore';

const store = () => useSheetStore.getState();

const body = () => document.activeElement ?? document.body;

function typeIntoCell(text: string): void {
  let draft = '';
  for (const char of text) {
    fireEvent.keyDown(body(), { key: char });
    const input = screen.getByLabelText(/^Edit cell/);
    draft += char;
    fireEvent.change(input, { target: { value: draft } });
  }
}

function commitWith(key: 'Enter' | 'Tab' = 'Enter'): void {
  fireEvent.keyDown(screen.getByLabelText(/^Edit cell/), { key });
}

function clickCell(address: string): HTMLElement {
  const cell = document.querySelector(`[data-cell="${address}"]`) as HTMLElement;
  fireEvent.mouseDown(cell, { button: 0 });
  return cell;
}

function cellText(address: string): string {
  const cell = document.querySelector(`[data-cell="${address}"]`) as HTMLElement;
  return cell.textContent ?? '';
}

/** Types a value into an already-selected cell and commits it. */
function enterValue(address: string, value: string): void {
  clickCell(address);
  typeIntoCell(value);
  commitWith('Enter');
}

function openGuide(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Formulas' }));
}

function guide() {
  return screen.getByTestId('formula-helper-dialog');
}

function section(id: 'arithmetic' | 'functions' | 'references' | 'errors' | 'tips') {
  return within(screen.getByTestId(`guide-section-${id}`));
}

beforeEach(() => {
  window.localStorage.clear();
  store().resetSheet();
  render(<App />);
});

describe('formula guide button', () => {
  it('renders in the toolbar with its own tooltip', () => {
    const button = screen.getByRole('button', { name: 'Formulas' });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute('title', 'Formula Helper');
  });

  it('stays at the end of the toolbar, after the shortcuts help button', () => {
    const shortcuts = screen.getByRole('button', { name: 'Keyboard shortcuts help' });
    const formulas = screen.getByRole('button', { name: 'Formulas' });
    expect(
      shortcuts.compareDocumentPosition(formulas) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

describe('formula guide content', () => {
  it('opens read-only with a title and subtitle', () => {
    openGuide();
    expect(guide()).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Formula Guide' })).toBeInTheDocument();
    expect(
      screen.getByText('Read-only reference of every formula SheetFlow can calculate'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });

  it('groups the reference into five labelled sections', () => {
    openGuide();
    for (const heading of [
      'Basic Arithmetic',
      'Mathematical Functions',
      'Cell References & Ranges',
      'Formula Errors',
      'Quick Tips',
    ]) {
      expect(screen.getByRole('heading', { name: heading })).toBeInTheDocument();
    }
  });

  it('documents every supported arithmetic operation', () => {
    openGuide();
    const arithmetic = section('arithmetic');
    const rows: Array<[string, string]> = [
      ['Addition', '=A1+B1'],
      ['Subtraction', '=A1-B1'],
      ['Multiplication', '=A1*B1'],
      ['Division', '=A1/B1'],
      ['Exponentiation', '=A1^2'],
      ['Parentheses', '=(A1+B1)*2'],
      ['Negative numbers', '=-A1'],
      ['Mixed operations', '=A1+B1*2'],
    ];
    for (const [name, example] of rows) {
      expect(arithmetic.getByText(name)).toBeInTheDocument();
      expect(arithmetic.getByText(example)).toBeInTheDocument();
    }
  });

  it('documents every function the evaluator implements', () => {
    openGuide();
    const functions = section('functions');
    const rows: Array<[string, string]> = [
      ['SUM', '=SUM(A1:A5)'],
      ['AVERAGE', '=AVERAGE(A1:A5)'],
      ['MIN', '=MIN(A1:A5)'],
      ['MAX', '=MAX(A1:A5)'],
      ['COUNT', '=COUNT(A1:A5)'],
      ['ABS', '=ABS(A1)'],
      ['ROUND', '=ROUND(A1,2)'],
      ['POWER', '=POWER(A1,2)'],
      ['SQRT', '=SQRT(A1)'],
      ['MOD', '=MOD(A1,3)'],
    ];
    for (const [name, example] of rows) {
      expect(functions.getByText(name)).toBeInTheDocument();
      expect(functions.getByText(example)).toBeInTheDocument();
    }
    // Nothing is advertised beyond the ten implemented functions
    // (the header row plus one row per documented function).
    expect(functions.getAllByRole('row')).toHaveLength(rows.length + 1);
  });

  it('explains single cells, ranges, and multi-argument calls', () => {
    openGuide();
    const references = section('references');
    expect(references.getByText('=A1')).toBeInTheDocument();
    expect(references.getByText('=A1+B1')).toBeInTheDocument();
    expect(references.getByText('=A1*2')).toBeInTheDocument();
    expect(references.getByText('=SUM(A1:A5)')).toBeInTheDocument();
    expect(references.getByText('=SUM(A1,B1,C1)')).toBeInTheDocument();
  });

  it('lists every engine error code with its meaning', () => {
    openGuide();
    const errors = section('errors');
    const codes = ['#ERROR!', '#REF!', '#DIV/0!', '#VALUE!', '#NAME?', '#CYCLE!'];
    for (const code of codes) {
      expect(errors.getByText(code)).toBeInTheDocument();
    }
    expect(errors.getByText('Invalid syntax')).toBeInTheDocument();
    expect(errors.getByText('Circular reference')).toBeInTheDocument();
    expect(errors.getByText(/does not recognise this function or name/)).toBeInTheDocument();
  });

  it('shows beginner-friendly quick tips', () => {
    openGuide();
    const tips = section('tips');
    expect(tips.getByText(/starts with an equals sign/)).toBeInTheDocument();
    expect(tips.getByText(/Ranges only work inside a function/)).toBeInTheDocument();
    expect(tips.getByText(/recalculate automatically/)).toBeInTheDocument();
  });
});

describe('formula guide is read-only', () => {
  it('has no insert controls anywhere', () => {
    openGuide();
    expect(within(guide()).queryByText(/insert/i)).not.toBeInTheDocument();
    expect(within(guide()).queryByRole('button', { name: /insert/i })).not.toBeInTheDocument();
    const buttons = within(guide()).getAllByRole('button');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName('Close formula guide');
  });

  it('does not change any cell content when opened or closed', () => {
    enterValue('A1', '7');
    enterValue('B1', '=A1+1');
    const before = JSON.parse(JSON.stringify(store().cells)) as unknown;
    const displaysBefore = [cellText('A1'), cellText('B1')];

    openGuide();
    // =SUM(A1:A5) is intentionally listed in both the functions and reference sections.
    fireEvent.mouseDown(within(guide()).getAllByText('=SUM(A1:A5)')[0], { button: 0 });
    fireEvent.click(within(guide()).getByText('=ABS(A1)'));
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(JSON.parse(JSON.stringify(store().cells))).toEqual(before);
    expect(store().getRaw('B1')).toBe('=A1+1');
    expect([cellText('A1'), cellText('B1')]).toEqual(displaysBefore);
    expect(store().history.past).toHaveLength(2);
  });

  it('does not move the grid selection while it is open', () => {
    const before = { ...store().selection.focus };
    openGuide();
    fireEvent.keyDown(guide(), { key: 'ArrowDown' });
    fireEvent.keyDown(guide(), { key: 'Tab' });
    expect(store().selection.focus).toEqual(before);
  });

  it('closes when the backdrop is clicked', () => {
    openGuide();
    fireEvent.mouseDown(guide(), { button: 0 });
    expect(screen.queryByTestId('formula-helper-dialog')).not.toBeInTheDocument();
  });
});

describe('formula guide accessibility', () => {
  it('moves focus into the dialog on open', () => {
    openGuide();
    expect(guide()).toHaveFocus();
    expect(guide()).toHaveAttribute('aria-labelledby', 'formula-guide-title');
  });

  it('keeps focus inside the dialog on Tab and Shift + Tab', () => {
    openGuide();
    fireEvent.keyDown(guide(), { key: 'Tab' });
    expect(guide().contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(guide(), { key: 'Tab', shiftKey: true });
    expect(guide().contains(document.activeElement)).toBe(true);
  });

  it('closes with Escape and restores focus to the grid', () => {
    openGuide();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('formula-helper-dialog')).not.toBeInTheDocument();
    expect(document.getElementById('sheetflow-grid')).toHaveFocus();
  });

  it('closes with the close button', () => {
    openGuide();
    fireEvent.click(screen.getByRole('button', { name: 'Close formula guide' }));
    expect(screen.queryByTestId('formula-helper-dialog')).not.toBeInTheDocument();
  });
});

describe('new mathematical functions in the sheet', () => {
  it('calculates ABS, SQRT, ROUND, MOD and COUNT', () => {
    enterValue('A1', '9');
    enterValue('A2', 'text');
    enterValue('B1', '=ABS(-4)+SQRT(A1)');
    enterValue('B2', '=ROUND(2.675,2)');
    enterValue('B3', '=MOD(7,3)');
    enterValue('B4', '=COUNT(A1:A5)');
    expect(cellText('B1')).toBe('7');
    expect(cellText('B2')).toBe('2.68');
    expect(cellText('B3')).toBe('1');
    expect(cellText('B4')).toBe('1');
  });

  it('recalculates dependents when a referenced cell changes', () => {
    enterValue('A1', '9');
    enterValue('B1', '=SQRT(A1)');
    expect(cellText('B1')).toBe('3');

    const cell = clickCell('A1');
    fireEvent.doubleClick(cell);
    const editor = screen.getByLabelText('Edit cell A1');
    fireEvent.change(editor, { target: { value: '16' } });
    fireEvent.keyDown(editor, { key: 'Enter' });

    expect(cellText('B1')).toBe('4');
  });

  it('propagates errors and keeps circular references safe', () => {
    enterValue('A1', 'text');
    enterValue('B1', '=SQRT(A1)');
    expect(cellText('B1')).toBe('#VALUE!');

    enterValue('C1', '=ABS(C1)');
    expect(cellText('C1')).toBe('#CYCLE!');

    enterValue('D1', '=MOD(7,0)');
    expect(cellText('D1')).toBe('#DIV/0!');
  });

  it('survives a reload through LocalStorage persistence', () => {
    enterValue('A1', '16');
    enterValue('B1', '=SQRT(A1)');
    store().hydrate();
    expect(store().getRaw('B1')).toBe('=SQRT(A1)');
    expect(store().getDisplay('B1')).toBe('4');
  });
});
