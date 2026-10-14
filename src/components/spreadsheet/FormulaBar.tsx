import { Sigma } from 'lucide-react';

import { useSheetStore } from '../../store/sheetStore';
import { toKey } from '../../utils/address';

export default function FormulaBar() {
  const focusRow = useSheetStore((s) => s.selection.focus.row);
  const focusCol = useSheetStore((s) => s.selection.focus.col);
  const cellKey = toKey(focusRow, focusCol);
  const editing = useSheetStore(
    (s) => (s.editing && s.editing.key === cellKey ? s.editing : null),
  );
  const raw = useSheetStore((s) => s.cells[cellKey]?.raw ?? '');

  const value = editing ? editing.draft : raw;

  return (
    <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 py-1.5">
      <div
        className="flex h-7 min-w-14 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 px-2 font-mono text-xs font-semibold text-slate-700"
        aria-label="Active cell reference"
      >
        {cellKey}
      </div>
      <div
        className="hidden h-7 w-7 shrink-0 items-center justify-center text-slate-400 sm:flex"
        title="Formula"
        aria-hidden="true"
      >
        <Sigma size={14} />
        <span className="sr-only">fx</span>
      </div>
      <input
        type="text"
        aria-label="Formula bar"
        className="h-7 min-w-0 flex-1 rounded-md border border-slate-200 px-2 font-mono text-sm text-slate-800 outline-none focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB]"
        value={value}
        onFocus={() => {
          const store = useSheetStore.getState();
          if (!store.editing) store.beginEdit('formulaBar');
        }}
        onChange={(event) => useSheetStore.getState().changeDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            useSheetStore.getState().commitEdit(null);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            useSheetStore.getState().cancelEdit();
          }
        }}
        onBlur={() => {
          const store = useSheetStore.getState();
          if (store.editing && store.editing.key === cellKey) store.commitEdit(null);
        }}
      />
    </div>
  );
}
