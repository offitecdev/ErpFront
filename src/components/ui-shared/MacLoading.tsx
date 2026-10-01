import '@/styles/macLoading.css';

/** The macOS wheel alone: twelve spokes fading in turn. `small` fits buttons and fields. */
export const MacWheel = ({ small = false }: { small?: boolean }) => (
    <span className={`ofi-mac-loading__wheel${small ? ' is-small' : ''}`} aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <i key={index} style={{ transform: `rotate(${index * 30}deg)`, animationDelay: `${index / 12 - 1}s` }} />)}
    </span>
);

/** Indeterminate progress: no invented percentages while the server works. */
export const MacLoading = ({ label, detail, compact = false }: { label: string; detail?: string; compact?: boolean }) => (
    <div className={`ofi-mac-loading${compact ? ' is-compact' : ''}`} role="status" aria-live="polite" aria-busy="true">
        <MacWheel />
        <div><b>{label}</b>{detail && <small>{detail}</small>}</div>
    </div>
);
