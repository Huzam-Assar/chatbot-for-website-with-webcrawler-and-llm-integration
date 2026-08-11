const quickButtons = ['Create CV', 'Post Project', 'Become Teacher', 'Payments'];

export default function QuickButtons({ onSelect }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.25em] text-slate-500">
        Quick options
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {quickButtons.map((button) => (
          <button
            key={button}
            type="button"
            onClick={() => onSelect(button)}
            className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-medium text-slate-700 transition hover:border-amber-400 hover:bg-amber-50"
          >
            <span>{button}</span>
            <span className="text-xs text-slate-400">↗</span>
          </button>
        ))}
      </div>
    </div>
  );
}
