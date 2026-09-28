import '@/styles/macLoading.css';

/** Indeterminate progress: no invented percentages while the server works. */
export const MacLoading = ({ label, detail, compact = false }: { label: string; detail?: string; compact?: boolean }) => (
    <div className={`ofi-mac-loading${compact ? ' is-compact' : ''}`} role="status" aria-live="polite" aria-busy="true">
        <span className="ofi-mac-loading__wheel" aria-hidden="true">
            {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ transform: `rotate(${index * 30}deg)`, animationDelay: `${index / 12 - 1}s` }} />)}
        </span>
        <div><b>{label}</b>{detail && <small>{detail}</small>}</div>
    </div>
);
