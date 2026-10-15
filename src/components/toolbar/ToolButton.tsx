import type { ReactNode } from 'react';

interface ToolButtonProps {
  label: string;
  tooltip?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  children: ReactNode;
}

export default function ToolButton({
  label,
  tooltip,
  onClick,
  disabled,
  danger,
  active,
  children,
}: ToolButtonProps) {
  return (
    <button
      type="button"
      title={tooltip ?? label}
      aria-label={label}
      disabled={disabled}
      aria-pressed={active === undefined ? undefined : active}
      onClick={(event) => {
        onClick();
        event.currentTarget.blur();
      }}
      className={[
        'inline-flex h-8 items-center justify-center rounded-md border px-2 text-slate-600 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-1',
        'hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white',
        danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-slate-200 bg-white',
        active ? 'border-[#2563EB] bg-[#EFF6FF] text-[#2563EB]' : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}
