import { AlertCircle, CheckCircle2, Grid3x3, RefreshCw } from 'lucide-react';

import { useSheetStore } from '../../store/sheetStore';

export default function Header() {
  const saveStatus = useSheetStore((s) => s.saveStatus);

  return (
    <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-white px-4 py-2.5">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#2563EB] text-white">
        <Grid3x3 size={18} aria-hidden="true" />
      </div>
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">SheetFlow</h1>
        <span className="hidden text-xs font-medium text-slate-400 sm:inline">
          Mini Spreadsheet
        </span>
      </div>

      <div
        className="ml-auto flex items-center gap-2 whitespace-nowrap text-xs font-medium"
        data-testid="save-status"
        role="status"
        aria-live="polite"
      >
        {saveStatus === 'saved' && (
          <>
            <CheckCircle2 size={14} className="text-emerald-600" aria-hidden="true" />
            <span className="text-emerald-700">All changes saved</span>
          </>
        )}
        {saveStatus === 'saving' && (
          <>
            <RefreshCw size={14} className="animate-spin text-amber-500" aria-hidden="true" />
            <span className="text-amber-700">Saving…</span>
          </>
        )}
        {saveStatus === 'error' && (
          <>
            <AlertCircle size={14} className="text-red-600" aria-hidden="true" />
            <span className="text-red-700">Could not save — storage unavailable</span>
          </>
        )}
      </div>
    </header>
  );
}
