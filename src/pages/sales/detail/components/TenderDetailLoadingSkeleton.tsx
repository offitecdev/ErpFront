export const TenderDetailLoadingSkeleton = () => (
    <div className="ofi-quote-page ofi-quote-apple ofi-quote-loading animate-pulse space-y-5" aria-busy="true">
        <div className="pb-4">
            <div className="mb-2 h-3 w-36 rounded bg-slate-100" />
            <div className="h-6 w-60 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-80 max-w-full rounded bg-slate-100" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
                <div key={i} className="ofi-quote-panel-skeleton h-44" />
            ))}
        </div>
        <div className="ofi-quote-panel-skeleton h-72" />
    </div>
);
