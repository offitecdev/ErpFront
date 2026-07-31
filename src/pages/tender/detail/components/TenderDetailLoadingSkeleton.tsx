export const TenderDetailLoadingSkeleton = () => (
    <div className="animate-pulse space-y-5">
        <div className="border-b border-slate-200/60 pb-4">
            <div className="mb-2 h-3 w-36 rounded bg-slate-100" />
            <div className="h-6 w-60 rounded bg-slate-200" />
            <div className="mt-2 h-3 w-80 max-w-full rounded bg-slate-100" />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-20 rounded-[2px] border border-slate-100 bg-slate-50" />
            ))}
        </div>
        <div className="h-72 rounded-[2px] border border-slate-100 bg-slate-50" />
    </div>
);
