import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { GRID_ID } from '../../types';

interface ShortcutRow {
  keys: string;
  description: string;
}

const SHORTCUTS: ShortcutRow[] = [
  { keys: '↑ ↓ ← →', description: 'Move the active cell' },
  { keys: 'Shift + ↑ ↓ ← →', description: 'Extend the selection' },
  { keys: 'Enter', description: 'Start editing / commit and move down' },
  { keys: 'Shift + Enter', description: 'Commit and move up' },
  { keys: 'Tab / Shift + Tab', description: 'Move right / left' },
  { keys: 'F2', description: 'Edit the selected cell' },
  { keys: 'Escape', description: 'Cancel editing' },
  { keys: 'Delete / Backspace', description: 'Clear selected cells' },
  { keys: 'Ctrl or ⌘ + C', description: 'Copy selection (including formulas)' },
  { keys: 'Ctrl or ⌘ + V', description: 'Paste at the selection start' },
  { keys: 'Ctrl or ⌘ + Z', description: 'Undo' },
  { keys: 'Ctrl or ⌘ + Shift + Z', description: 'Redo' },
  { keys: 'Ctrl + Y', description: 'Redo' },
  { keys: 'Type any character', description: 'Start editing the selected cell' },
];

export default function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        const dialog = dialogRef.current;
        if (!dialog) return;
        const focusables = Array.from(
          dialog.querySelectorAll<HTMLElement>(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || active === dialog)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      const target =
        previouslyFocused && previouslyFocused !== document.body
          ? previouslyFocused
          : document.getElementById(GRID_ID);
      target?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      data-testid="shortcuts-dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Keyboard shortcuts</h2>
          <button
            type="button"
            aria-label="Close keyboard shortcuts"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <X size={16} />
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <th scope="col" className="pb-2 pr-4 font-semibold">
                Keys
              </th>
              <th scope="col" className="pb-2 font-semibold">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUTS.map((row) => (
              <tr key={row.keys} className="border-b border-slate-100 last:border-0">
                <td className="py-1.5 pr-4 font-mono text-xs text-slate-700">{row.keys}</td>
                <td className="py-1.5 text-slate-600">{row.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-4 text-xs text-slate-400">
          Ctrl works on Windows/Linux, ⌘ works on macOS.
        </p>
      </div>
    </div>
  );
}
