import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';

import { GRID_ID } from '../../types';

export interface GuideEntry {
  name: string;
  example: string;
  description: string;
  /** Error codes render in red text so they read differently from examples. */
  tone?: 'error';
}

export interface GuideSection {
  id: string;
  heading: string;
  entries: GuideEntry[];
}

/**
 * Everything listed here is verified against src/formulas — the operators the
 * tokenizer accepts (`+ - * / ^`, unary `-`) and the functions the evaluator
 * implements. Never add a row for something the engine cannot calculate.
 */
export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'arithmetic',
    heading: 'Basic Arithmetic',
    entries: [
      { name: 'Addition', example: '=A1+B1', description: 'Add values' },
      { name: 'Subtraction', example: '=A1-B1', description: 'Subtract values' },
      { name: 'Multiplication', example: '=A1*B1', description: 'Multiply values' },
      { name: 'Division', example: '=A1/B1', description: 'Divide values' },
      { name: 'Exponentiation', example: '=A1^2', description: 'Raise a value to a power' },
      { name: 'Parentheses', example: '=(A1+B1)*2', description: 'Control calculation order' },
      { name: 'Negative numbers', example: '=-A1', description: 'Negate a value' },
      {
        name: 'Mixed operations',
        example: '=A1+B1*2',
        description: 'Multiplication happens before addition',
      },
    ],
  },
  {
    id: 'functions',
    heading: 'Mathematical Functions',
    entries: [
      { name: 'SUM', example: '=SUM(A1:A5)', description: 'Add the values in a range' },
      {
        name: 'AVERAGE',
        example: '=AVERAGE(A1:A5)',
        description: 'Average of the numbers in a range',
      },
      { name: 'MIN', example: '=MIN(A1:A5)', description: 'Smallest value in a range' },
      { name: 'MAX', example: '=MAX(A1:A5)', description: 'Largest value in a range' },
      { name: 'COUNT', example: '=COUNT(A1:A5)', description: 'How many cells contain numbers' },
      { name: 'ABS', example: '=ABS(A1)', description: 'Absolute (unsigned) value of a number' },
      { name: 'ROUND', example: '=ROUND(A1,2)', description: 'Round to 2 decimal places' },
      { name: 'POWER', example: '=POWER(A1,2)', description: 'Raise a number to a power (=A1^2)' },
      { name: 'SQRT', example: '=SQRT(A1)', description: 'Square root of a number' },
      { name: 'MOD', example: '=MOD(A1,3)', description: 'Remainder after dividing by 3' },
    ],
  },
  {
    id: 'references',
    heading: 'Cell References & Ranges',
    entries: [
      { name: 'Single cell', example: '=A1', description: 'Show the value of another cell' },
      { name: 'Two cells', example: '=A1+B1', description: 'Combine the values of two cells' },
      { name: 'Cell and number', example: '=A1*2', description: 'Use a cell with a fixed number' },
      {
        name: 'Range',
        example: '=SUM(A1:A5)',
        description: 'A block of cells, used inside a function',
      },
      {
        name: 'Several arguments',
        example: '=SUM(A1,B1,C1)',
        description: 'Pass individual cells or ranges to one function',
      },
    ],
  },
  {
    id: 'errors',
    heading: 'Formula Errors',
    entries: [
      {
        name: 'Invalid syntax',
        example: '#ERROR!',
        description: 'The formula cannot be read — check for typos, missing parentheses, or stray characters',
        tone: 'error',
      },
      {
        name: 'Invalid reference',
        example: '#REF!',
        description: 'A cell reference points outside the grid, such as =A9999999',
        tone: 'error',
      },
      {
        name: 'Division by zero',
        example: '#DIV/0!',
        description: 'A value is divided by zero, or AVERAGE has no numbers to average',
        tone: 'error',
      },
      {
        name: 'Invalid value',
        example: '#VALUE!',
        description: 'Text was used where a number is needed, or a function received the wrong arguments',
        tone: 'error',
      },
      {
        name: 'Unknown name',
        example: '#NAME?',
        description: 'SheetFlow does not recognise this function or name',
        tone: 'error',
      },
      {
        name: 'Circular reference',
        example: '#CYCLE!',
        description: 'A formula depends on its own result, directly or through other cells',
        tone: 'error',
      },
    ],
  },
];

const TIPS: string[] = [
  'Every formula starts with an equals sign, like =A1+B1.',
  'References use A1 style: the column letter followed by the row number.',
  'A range such as A1:A5 covers every cell between the two corners.',
  'Ranges only work inside a function — use =SUM(A1:A5), not =A1:A5.',
  'Referenced cells recalculate automatically whenever their value changes.',
  'Empty cells count as 0 in arithmetic and are ignored by SUM, AVERAGE, MIN, MAX and COUNT.',
  'Text is ignored by SUM and COUNT, but causes #VALUE! in arithmetic.',
  'Operator order is ^ first, then * and /, then + and -. Use parentheses to be explicit.',
];

const TITLE_ID = 'formula-guide-title';

export default function FormulaHelper({ onClose }: { onClose: () => void }) {
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

  const renderSection = (section: GuideSection) => {
    const headingId = `guide-heading-${section.id}`;
    return (
      <section
        key={section.id}
        className="mb-4"
        aria-labelledby={headingId}
        data-testid={`guide-section-${section.id}`}
      >
        <h3
          id={headingId}
          className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"
        >
          {section.heading}
        </h3>
        {/* Horizontal scroll keeps long formulas intact on narrow screens. */}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full min-w-[26rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200">
                <th
                  scope="col"
                  className="w-[28%] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500"
                >
                  Operation
                </th>
                <th
                  scope="col"
                  className="w-[30%] bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500"
                >
                  Example
                </th>
                <th
                  scope="col"
                  className="bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-500"
                >
                  Description
                </th>
              </tr>
            </thead>
            <tbody>
              {section.entries.map((entry) => (
                <tr
                  key={`${section.id}-${entry.name}`}
                  className="border-b border-slate-100 last:border-0"
                >
                  <td className="px-3 py-2 text-sm font-medium text-slate-800">{entry.name}</td>
                  <td className="px-3 py-2">
                    <code
                      className={[
                        'whitespace-nowrap font-mono text-xs',
                        entry.tone === 'error' ? 'text-red-600' : 'text-[#1d4ed8]',
                      ].join(' ')}
                    >
                      {entry.example}
                    </code>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{entry.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    );
  };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 focus:outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby={TITLE_ID}
      data-testid="formula-helper-dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id={TITLE_ID} className="text-base font-semibold text-slate-900">
              Formula Guide
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Read-only reference of every formula SheetFlow can calculate
            </p>
          </div>
          <button
            type="button"
            aria-label="Close formula guide"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]"
          >
            <X size={16} />
          </button>
        </div>

        {GUIDE_SECTIONS.map(renderSection)}

        <section className="rounded-lg bg-slate-50 p-3" data-testid="guide-section-tips">
          <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Quick Tips
          </h3>
          <ul className="list-inside list-disc space-y-0.5 text-xs text-slate-600">
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
