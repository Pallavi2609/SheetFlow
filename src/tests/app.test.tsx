import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

beforeEach(() => {
  window.localStorage.clear();
  store().resetSheet();
  render(<App />);
});

describe('layout', () => {
  it('renders the header, toolbar, formula bar, grid, and status bar', () => {
    expect(screen.getByRole('heading', { name: 'SheetFlow' })).toBeInTheDocument();
    for (const label of [
      'Undo',
      'Redo',
      'Copy',
      'Paste',
      'Clear',
      'Bold',
      'Italic',
      'Import CSV',
      'Export CSV',
      'Reset spreadsheet',
      'Keyboard shortcuts help',
    ]) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByLabelText('Formula bar')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Spreadsheet' })).toBeInTheDocument();
    expect(screen.getByTestId('active-cell')).toHaveTextContent('A1');
  });

  it('renders alphabetic column headers and numbered rows', () => {
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('Z')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByTestId('grid-dimensions')).toHaveTextContent('100 rows × 26 columns');
  });

  it('disables undo/redo when there is no history', () => {
    expect(screen.getByRole('button', { name: 'Undo' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
  });
});

describe('cell editing', () => {
  it('typing a character starts an edit; Enter commits and moves down', () => {
    typeIntoCell('7');
    commitWith('Enter');
    expect(cellText('A1')).toBe('7');
    expect(screen.getByTestId('active-cell')).toHaveTextContent('A2');
  });

  it('commits with Tab and moves right', () => {
    typeIntoCell('7');
    commitWith('Tab');
    expect(cellText('A1')).toBe('7');
    expect(screen.getByTestId('active-cell')).toHaveTextContent('B1');
  });

  it('double-clicking a cell opens the editor with its content', () => {
    typeIntoCell('5');
    commitWith('Enter');
    const cell = clickCell('A1');
    fireEvent.doubleClick(cell);
    expect(screen.getByLabelText('Edit cell A1')).toHaveValue('5');
  });

  it('Escape cancels an in-progress edit', () => {
    typeIntoCell('9');
    commitWith('Enter');
    const cell = clickCell('A1');
    fireEvent.doubleClick(cell);
    fireEvent.change(screen.getByLabelText('Edit cell A1'), {
      target: { value: '999' },
    });
    fireEvent.keyDown(screen.getByLabelText('Edit cell A1'), { key: 'Escape' });
    expect(screen.queryByLabelText('Edit cell A1')).not.toBeInTheDocument();
    expect(cellText('A1')).toBe('9');
  });

  it('Delete clears the selected cell', () => {
    typeIntoCell('3');
    commitWith('Enter');
    fireEvent.keyDown(body(), { key: 'ArrowUp' });
    fireEvent.keyDown(body(), { key: 'Delete' });
    expect(cellText('A1')).toBe('');
  });
});

describe('formula bar', () => {
  it('shows the active cell address and raw input', () => {
    typeIntoCell('raw text');
    commitWith('Enter');
    fireEvent.keyDown(body(), { key: 'ArrowUp' });
    expect(screen.getByLabelText('Formula bar')).toHaveValue('raw text');
  });

  it('editing in the formula bar commits to the active cell', () => {
    const bar = screen.getByLabelText('Formula bar');
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: '=1+2' } });
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(cellText('A1')).toBe('3');
    expect(bar).toHaveValue('=1+2');
  });

  it('keeps raw formula text in the bar while the grid shows the calculated value', () => {
    const bar = screen.getByLabelText('Formula bar');
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: '=SUM(B1:B2)' } });
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(cellText('A1')).toBe('0');
    expect(bar).toHaveValue('=SUM(B1:B2)');
  });
});

describe('formulas end to end in the UI', () => {
  it('C1 = =A1+B1 shows 30, then 70 after A1 becomes 50', () => {
    typeIntoCell('10');
    commitWith('Tab');
    typeIntoCell('20');
    commitWith('Tab');
    const bar = screen.getByLabelText('Formula bar');
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: '=A1+B1' } });
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(cellText('C1')).toBe('30');

    clickCell('A1');
    typeIntoCell('50');
    commitWith('Enter');
    expect(cellText('C1')).toBe('70');
  });

  it('invalid formulas display error states', () => {
    const bar = screen.getByLabelText('Formula bar');
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: '=SUM(' } });
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(cellText('A1')).toBe('#ERROR!');
  });

  it('circular formulas display #CYCLE! and never freeze', () => {
    const bar = screen.getByLabelText('Formula bar');
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: '=A1' } });
    fireEvent.keyDown(bar, { key: 'Enter' });
    expect(cellText('A1')).toBe('#CYCLE!');
  });
});

describe('keyboard navigation', () => {
  it('arrow keys move the active cell', () => {
    fireEvent.keyDown(body(), { key: 'ArrowRight' });
    expect(screen.getByTestId('active-cell')).toHaveTextContent('B1');
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    expect(screen.getByTestId('active-cell')).toHaveTextContent('B2');
    fireEvent.keyDown(body(), { key: 'ArrowUp' });
    fireEvent.keyDown(body(), { key: 'ArrowLeft' });
    expect(screen.getByTestId('active-cell')).toHaveTextContent('A1');
  });

  it('Tab moves right and Shift+Tab moves left', () => {
    fireEvent.keyDown(body(), { key: 'Tab' });
    expect(screen.getByTestId('active-cell')).toHaveTextContent('B1');
    fireEvent.keyDown(body(), { key: 'Tab', shiftKey: true });
    expect(screen.getByTestId('active-cell')).toHaveTextContent('A1');
  });

  it('Shift+Arrow extends the selection and the status bar summarizes it', () => {
    fireEvent.keyDown(body(), { key: 'ArrowDown', shiftKey: true });
    fireEvent.keyDown(body(), { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByTestId('selection-summary')).toHaveTextContent('4 cells');
  });

  it('shortcuts do not fire while typing in the formula bar', () => {
    const bar = screen.getByLabelText('Formula bar');
    fireEvent.focus(bar);
    fireEvent.change(bar, { target: { value: 'a' } });
    fireEvent.keyDown(bar, { key: 'z' });
    fireEvent.change(bar, { target: { value: 'az' } });
    expect(store().editing?.source).toBe('formulaBar');
    expect(store().editing?.draft).toBe('az');
    expect(screen.queryByLabelText(/^Edit cell/)).not.toBeInTheDocument();
  });
});

describe('copy and paste', () => {
  it('Ctrl+C then Ctrl+V duplicates the selected cell', async () => {
    typeIntoCell('8');
    commitWith('Enter');
    fireEvent.keyDown(body(), { key: 'ArrowUp' });
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });

    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    fireEvent.keyDown(body(), { key: 'ArrowDown' });
    fireEvent.keyDown(body(), { key: 'ArrowRight' });
    fireEvent.keyDown(body(), { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });
    await vi.waitFor(() => expect(cellText('C3')).toBe('8'));
  });

  it('toolbar copy/paste buttons work', async () => {
    typeIntoCell('4');
    commitWith('Enter');
    fireEvent.keyDown(body(), { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    fireEvent.keyDown(body(), { key: 'ArrowRight' });
    fireEvent.click(screen.getByRole('button', { name: 'Paste' }));
    await vi.waitFor(() => expect(cellText('B1')).toBe('4'));
  });
});

describe('undo and redo', () => {
  it('undo/redo buttons step through history', () => {
    typeIntoCell('1');
    commitWith('Enter');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).not.toBeDisabled();
    expect(redo).toBeDisabled();

    fireEvent.click(undo);
    expect(cellText('A1')).toBe('');
    expect(redo).not.toBeDisabled();

    fireEvent.click(redo);
    expect(cellText('A1')).toBe('1');
  });

  it('Ctrl+Z and Ctrl+Shift+Z work from the keyboard', () => {
    typeIntoCell('6');
    commitWith('Enter');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(cellText('A1')).toBe('');
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true, shiftKey: true });
    expect(cellText('A1')).toBe('6');
  });
});

describe('formatting buttons', () => {
  it('bold toggles the active cell format and reflects its state', () => {
    typeIntoCell('b');
    commitWith('Enter');
    fireEvent.keyDown(body(), { key: 'ArrowUp' });
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(bold);
    expect(store().cells['A1']?.format?.bold).toBe(true);
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(bold);
    expect(store().cells['A1']?.format?.bold).toBe(false);
    expect(bold).toHaveAttribute('aria-pressed', 'false');
  });

  it('alignment buttons set cell alignment', () => {
    typeIntoCell('centered');
    commitWith('Enter');
    fireEvent.keyDown(body(), { key: 'ArrowUp' });
    fireEvent.click(screen.getByRole('button', { name: 'Align center' }));
    expect(store().cells['A1']?.format?.align).toBe('center');
  });
});

describe('shortcuts help dialog', () => {
  it('opens with the toolbar button and closes with Escape', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts help' }));
    expect(screen.getByTestId('shortcuts-dialog')).toBeInTheDocument();
    expect(screen.getByText('Move the active cell')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('shortcuts-dialog')).not.toBeInTheDocument();
  });
});

describe('reset with confirmation', () => {
  it('resets only when the user confirms', () => {
    typeIntoCell('1');
    commitWith('Enter');

    const confirmSpy = vi.spyOn(window, 'confirm');
    confirmSpy.mockReturnValue(false);
    fireEvent.click(screen.getByRole('button', { name: 'Reset spreadsheet' }));
    expect(cellText('A1')).toBe('1');

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: 'Reset spreadsheet' }));
    expect(cellText('A1')).toBe('');
    expect(window.localStorage.getItem('sheetflow:spreadsheet')).toBeNull();
  });
});

describe('persistence', () => {
  it('data survives a simulated refresh (hydrate from localStorage)', () => {
    typeIntoCell('55');
    commitWith('Enter');
    store().hydrate();
    expect(store().getRaw('A1')).toBe('55');
    expect(cellText('A1')).toBe('55');
  });
});

describe('save status', () => {
  it('shows the save indicator after a commit', () => {
    typeIntoCell('2');
    commitWith('Enter');
    expect(screen.getByTestId('save-status')).toBeInTheDocument();
  });
});

describe('accessibility (ISS-03)', () => {
  it('exposes a focusable grid whose aria-activedescendant tracks the active cell', () => {
    const grid = screen.getByRole('grid', { name: 'Spreadsheet grid' });
    expect(grid).toHaveAttribute('aria-activedescendant', 'cell-A1');
    expect(grid).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(body(), { key: 'ArrowRight' });
    expect(grid).toHaveAttribute('aria-activedescendant', 'cell-B1');
  });

  it('announces the save status through a polite live region', () => {
    const status = screen.getByTestId('save-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });

  it('moves focus into the shortcuts dialog and does not move the grid selection on Tab', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts help' }));
    const dialog = screen.getByTestId('shortcuts-dialog');
    expect(dialog).toHaveFocus();
    const before = { ...store().selection.focus };
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(store().selection.focus).toEqual(before);
  });

  it('restores focus to the grid after the dialog closes', () => {
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard shortcuts help' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('shortcuts-dialog')).not.toBeInTheDocument();
    expect(document.getElementById('sheetflow-grid')).toHaveFocus();
  });

  it('renders an accessible fill handle on the active cell', () => {
    expect(screen.getByTestId('fill-handle-A1')).toBeInTheDocument();
  });

  it('renders column and row resize separators', () => {
    expect(screen.getByTestId('col-resize-0')).toBeInTheDocument();
    expect(screen.getByTestId('row-resize-0')).toBeInTheDocument();
  });
});
