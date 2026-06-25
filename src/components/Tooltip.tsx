"use client";

/** A small "?" affordance that reveals explanatory text on hover/focus. */
export function Tooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        tabIndex={0}
        aria-label={text}
        className="grid h-4 w-4 place-items-center rounded-full border border-white/20
          text-[10px] leading-none text-slate-400 transition hover:border-skip/50
          hover:text-skip focus:outline-none focus:ring-2 focus:ring-skip/40"
      >
        ?
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-56
          -translate-x-1/2 rounded-lg border border-white/10 bg-midnight-800 px-3 py-2
          text-xs font-normal normal-case tracking-normal text-slate-200 opacity-0 shadow-card
          transition group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}
