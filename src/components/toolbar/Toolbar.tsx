import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ClipboardPaste,
  Copy,
  Eraser,
  FileDown,
  FileUp,
  FileText,
  Italic,
  Keyboard,
  Redo2,
  RotateCcw,
  Undo2,
} from 'lucide-react';
import { useRef, useState } from 'react';

import { exportCsvText, useSheetStore } from '../../store/sheetStore';
import { clipboardText, writeSystemClipboard } from '../../utils/clipboard';
import { toKey } from '../../utils/address';
import ShortcutsHelp from '../spreadsheet/ShortcutsHelp';
import ToolButton from './ToolButton';

export default function Toolbar() {
  const undo = useSheetStore((s) => s.undo);
  const redo = useSheetStore((s) => s.redo);
  const clearSelectionRange = useSheetStore((s) => s.clearSelectionRange);
  const importCsvText = useSheetStore((s) => s.importCsvText);
  const resetSheet = useSheetStore((s) => s.resetSheet);
  const applyFormat = useSheetStore((s) => s.applyFormat);
  const canUndo = useSheetStore((s) => s.history.past.length > 0);
  const canRedo = useSheetStore((s) => s.history.future.length > 0);

  const activeFormat = useSheetStore((s) => {
    const { row, col } = s.selection.focus;
    return s.cells[toKey(row, col)]?.format;
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  const handleCopy = () => {
    const payload = useSheetStore.getState().copy();
    if (payload) void writeSystemClipboard(clipboardText(payload));
  };

  const handlePaste = () => {
    void useSheetStore.getState().paste();
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      importCsvText(String(reader.result ?? ''));
    };
    reader.onerror = () => {
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const handleExport = (neutralize: boolean) => {
    const cells = useSheetStore.getState().cells;
    try {
      const csv = exportCsvText(cells, { neutralize });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = neutralize ? 'sheetflow.csv' : 'sheetflow.raw.csv';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Export unavailable (e.g. blocked environment) — nothing else to do.
    }
  };

  const handleReset = () => {
    if (window.confirm('Reset the spreadsheet?\n\nAll cells and history will be permanently cleared.')) {
      resetSheet();
    }
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-slate-200 bg-white px-3 py-2">
      <ToolButton label="Undo" onClick={undo} disabled={!canUndo}>
        <Undo2 size={15} />
      </ToolButton>
      <ToolButton label="Redo" onClick={redo} disabled={!canRedo}>
        <Redo2 size={15} />
      </ToolButton>

      <div className="mx-1 h-5 w-px bg-slate-200" role="separator" />

      <ToolButton label="Copy" onClick={handleCopy}>
        <Copy size={15} />
      </ToolButton>
      <ToolButton label="Paste" onClick={handlePaste}>
        <ClipboardPaste size={15} />
      </ToolButton>
      <ToolButton label="Clear" onClick={clearSelectionRange}>
        <Eraser size={15} />
      </ToolButton>

      <div className="mx-1 h-5 w-px bg-slate-200" role="separator" />

      <ToolButton
        label="Bold"
        active={activeFormat?.bold === true}
        onClick={() => applyFormat({ bold: !activeFormat?.bold })}
      >
        <Bold size={15} />
      </ToolButton>
      <ToolButton
        label="Italic"
        active={activeFormat?.italic === true}
        onClick={() => applyFormat({ italic: !activeFormat?.italic })}
      >
        <Italic size={15} />
      </ToolButton>
      <ToolButton
        label="Align left"
        active={activeFormat?.align === 'left'}
        onClick={() => applyFormat({ align: 'left' })}
      >
        <AlignLeft size={15} />
      </ToolButton>
      <ToolButton
        label="Align center"
        active={activeFormat?.align === 'center'}
        onClick={() => applyFormat({ align: 'center' })}
      >
        <AlignCenter size={15} />
      </ToolButton>
      <ToolButton
        label="Align right"
        active={activeFormat?.align === 'right'}
        onClick={() => applyFormat({ align: 'right' })}
      >
        <AlignRight size={15} />
      </ToolButton>

      <div className="mx-1 h-5 w-px bg-slate-200" role="separator" />

      <ToolButton label="Import CSV" onClick={() => fileInputRef.current?.click()}>
        <FileUp size={15} />
      </ToolButton>
      <ToolButton label="Export CSV" onClick={() => handleExport(true)}>
        <FileDown size={15} />
      </ToolButton>
      <ToolButton label="Export raw CSV with formulas" onClick={() => handleExport(false)}>
        <FileText size={15} />
      </ToolButton>

      <div className="mx-1 h-5 w-px bg-slate-200" role="separator" />

      <ToolButton label="Reset spreadsheet" danger onClick={handleReset}>
        <RotateCcw size={15} />
      </ToolButton>
      <ToolButton label="Keyboard shortcuts help" onClick={() => setHelpOpen(true)}>
        <Keyboard size={15} />
      </ToolButton>

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        className="hidden"
        aria-label="Import CSV file"
        onChange={handleImportFile}
      />

      {helpOpen && <ShortcutsHelp onClose={() => setHelpOpen(false)} />}
    </div>
  );
}
