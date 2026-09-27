import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Check, Hash, Plus, ScanLine, Trash2 } from 'lucide-react';

import { t } from '@/i18n/translate';

import { cleanScan } from '../hooks/scanRules';
import { fmtDate } from '../warehouseFormat';
import { deviceLabel, projectLabel } from '../warehouseText';
import { CameraView } from './CameraView';

export interface SerialRowModel {
    /** Kennung am Server — oder ein vorläufiger Schlüssel, solange die Karte neu ist. */
    key: string;
    id: string | null;
    serialNumber: string;
    /** Nur Anzeige: eine Zuordnung, die schon besteht (künftig die Reservierung der Produktion). */
    project: { id: string; number: string; name: string; isActive?: boolean } | null;
    device: { id: string; name: string; positionNumber?: string | null; isActive?: boolean } | null;
    createdAt: string | null;
}

/** Löschen in zwei Schritten: erst wird das × rot, ein zweiter Klick löscht. */
const RemoveButton = ({ onConfirm, disabled }: { onConfirm: () => void; disabled?: boolean }) => {
    const [armed, setArmed] = useState(false);
    useEffect(() => {
        if (!armed) return undefined;
        const timer = window.setTimeout(() => setArmed(false), 3000);
        return () => window.clearTimeout(timer);
    }, [armed]);
    return (
        <button
            type="button"
            className={`ofi-wh-btn is-small ofi-nosize ${armed ? 'is-danger' : 'is-quiet is-icon'}`}
            disabled={disabled}
            title={t('warehouse.serials.remove')}
            aria-label={t('warehouse.serials.remove')}
            onClick={() => {
                if (armed) { setArmed(false); onConfirm(); } else setArmed(true);
            }}
        >
            {armed ? t('warehouse.actions.delete') : <Trash2 />}
        </button>
    );
};

const sameSerial = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

/**
 * ── DER REITER «SERİ NUMARALARI» ─────────────────────────────────────────────
 * «seri numaraları tabında seri numarası ve proje ismi ve cihaz ismi olması
 *  gerekmektedir.»
 *
 * Zweiter Durchgang (26.09.2026): «Seri kodu ürün detayında ekle deyince o
 * yer açılacak, ama altında okutma yeri de olacak — okutulup eklenecek diğer
 * tarafa.» In Ruhe zeigt der Reiter nur die Tabelle. «Ekle» öffnet links den
 * Platz zum Erfassen: oben das Feld (Handscanner/Tastatur), darunter die
 * Kamera; jede gelesene Nummer wird sofort gebucht und erscheint rechts in
 * der Tabelle (kurz hervorgehoben).
 *
 * Dritter Durchgang: «seri numaralarında proje veya cihaz girme yeri
 * olmasın, direkt eklesin» — hier wird nichts zugeordnet; eine schon
 * bestehende Zuordnung (künftig die Reservierung aus der Produktion) steht
 * nur zum Lesen in der Zeile.
 */
export const SerialNumbersPanel = ({
    rows,
    canEdit,
    pending,
    onAdd,
    onRemove,
    startOpen = false,
}: {
    rows: SerialRowModel[];
    canEdit: boolean;
    /** Neue Karte: die Nummern werden erst mit der Karte gespeichert. */
    pending: boolean;
    /** Eine Seriennummer buchen; false = abgelehnt (Meldung macht die Seite). */
    onAdd: (serialNumber: string) => Promise<boolean>;
    onRemove: (row: SerialRowModel) => Promise<void>;
    /** Den Erfassungsplatz gleich offen zeigen. */
    startOpen?: boolean;
}) => {
    const [adding, setAdding] = useState(startOpen);
    const [serial, setSerial] = useState('');
    const [busy, setBusy] = useState(false);
    const [rowBusy, setRowBusy] = useState<string | null>(null);
    const [flash, setFlash] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const queueRef = useRef<string[]>([]);
    const drainingRef = useRef(false);
    const onAddRef = useRef(onAdd);

    useEffect(() => { onAddRef.current = onAdd; }, [onAdd]);

    const focusInput = () => window.setTimeout(() => inputRef.current?.focus(), 0);

    /* Die neue Zeile sichtbar machen, sobald sie in der Tabelle steht. */
    useEffect(() => {
        if (!flash) return undefined;
        const row = scrollRef.current?.querySelector<HTMLElement>(`[data-serial="${CSS.escape(flash.toLocaleLowerCase())}"]`);
        row?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        const timer = window.setTimeout(() => setFlash(null), 1800);
        return () => window.clearTimeout(timer);
    }, [flash, rows]);

    /** Nummern der Reihe nach buchen — Kamera und Handscanner können schneller sein als der Server. */
    const drain = useCallback(async () => {
        if (drainingRef.current) return;
        drainingRef.current = true;
        setBusy(true);
        try {
            while (queueRef.current.length) {
                const value = queueRef.current.shift()!;
                const ok = await onAddRef.current(value);
                if (ok) setFlash(value);
            }
        } finally {
            drainingRef.current = false;
            setBusy(false);
            focusInput();
        }
    }, []);

    const enqueue = useCallback((raw: string) => {
        const value = cleanScan(raw);
        if (!value) return;
        queueRef.current.push(value);
        void drain();
    }, [drain]);

    /* Gelesen wird, was im Feld STEHT — ein schneller Handscanner verliert so kein Zeichen. */
    const submit = (event: FormEvent) => {
        event.preventDefault();
        enqueue(inputRef.current?.value ?? serial);
        setSerial('');
    };

    const remove = async (row: SerialRowModel) => {
        setRowBusy(row.key);
        try {
            await onRemove(row);
        } finally {
            setRowBusy(null);
        }
    };

    const open = adding && canEdit;
    // Projekt und Gerät nur, wenn eine Zeile eines trägt (ältere Zuordnung,
    // später die Reservierung) — sonst wären es zwei leere Spalten.
    const showTargets = rows.some((row) => row.project || row.device);

    return (
        <section className="ofi-wh-serials" aria-label={t('warehouse.serials.title')}>
            <div className="ofi-wh-serials__top">
                <span className="ofi-wh-serials__count">{t('warehouse.serials.count', { count: rows.length })}</span>
                {pending && canEdit && <span className="ofi-wh-row__hint">{t('warehouse.serials.pendingHint')}</span>}
                <span className="ofi-wh-spacer" />
                {canEdit && !open && (
                    <button type="button" className="ofi-wh-btn is-primary ofi-nosize" onClick={() => { setAdding(true); focusInput(); }}>
                        <Plus />
                        {t('warehouse.serials.add')}
                    </button>
                )}
                {open && (
                    <button type="button" className="ofi-wh-btn ofi-nosize" onClick={() => setAdding(false)}>
                        <Check />
                        {t('warehouse.serials.done')}
                    </button>
                )}
            </div>

            <div className={`ofi-wh-serials__body ${open ? 'is-adding' : ''}`}>
                {open && (
                    <aside className="ofi-wh-serials__add" aria-label={t('warehouse.serials.scanTitle')}>
                        <form onSubmit={submit} className="ofi-wh-serials__form">
                            <div className="ofi-wh-field is-large is-serial">
                                <ScanLine className="ofi-wh-field__lead" />
                                <input
                                    ref={inputRef}
                                    value={serial}
                                    autoFocus
                                    autoComplete="off"
                                    autoCapitalize="off"
                                    spellCheck={false}
                                    enterKeyHint="send"
                                    placeholder={t('warehouse.serials.inputPlaceholder')}
                                    aria-label={t('warehouse.serials.inputPlaceholder')}
                                    onChange={(event) => setSerial(event.target.value)}
                                />
                                {busy && <span className="ofi-wh-spinner" aria-hidden />}
                            </div>
                            <button type="submit" className="ofi-wh-btn is-primary is-large ofi-nosize" disabled={!serial.trim()}>
                                {t('warehouse.serials.addOne')}
                            </button>
                        </form>
                        {/* «altında okutma yeri de olacak» — die Kamera unter dem Feld. */}
                        <CameraView active compact prefer="serial" onCode={enqueue} />
                        <p className="ofi-wh-row__hint">{t('warehouse.serials.addHint')}</p>
                    </aside>
                )}

                <div className="ofi-wh-tablewrap">
                    <div ref={scrollRef} className="ofi-wh-tablescroll">
                        <table className={`ofi-wh-table is-serials ${showTargets ? '' : 'is-lean'}`} data-unstyled-table>
                            <colgroup>
                                <col style={{ width: 52 }} />
                                <col style={showTargets ? { width: '26%' } : undefined} />
                                {showTargets && <col />}
                                {showTargets && <col />}
                                <col style={{ width: 110 }} />
                                {canEdit && <col style={{ width: 92 }} />}
                            </colgroup>
                            <thead>
                                <tr>
                                    <th><span className="ofi-wh-th is-static">#</span></th>
                                    <th><span className="ofi-wh-th is-static">{t('warehouse.serials.columns.serial')}</span></th>
                                    {showTargets && <th><span className="ofi-wh-th is-static">{t('warehouse.serials.columns.project')}</span></th>}
                                    {showTargets && <th><span className="ofi-wh-th is-static">{t('warehouse.serials.columns.device')}</span></th>}
                                    <th><span className="ofi-wh-th is-static">{t('warehouse.serials.columns.added')}</span></th>
                                    {canEdit && <th aria-label={t('warehouse.serials.remove')} />}
                                </tr>
                            </thead>
                            <tbody>
                                {!rows.length && (
                                    <tr>
                                        <td colSpan={3 + (showTargets ? 2 : 0) + (canEdit ? 1 : 0)} style={{ height: 'auto', padding: 0 }}>
                                            <div className="ofi-wh-state">
                                                <Hash />
                                                <b>{t('warehouse.serials.empty')}</b>
                                                {canEdit && <span>{open ? t('warehouse.serials.emptyHintOpen') : t('warehouse.serials.emptyHint')}</span>}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                                {rows.map((row, index) => (
                                    <tr
                                        key={row.key}
                                        data-serial={row.serialNumber.toLocaleLowerCase()}
                                        className={flash && sameSerial(flash, row.serialNumber) ? 'is-flash' : ''}
                                    >
                                        <td className="ofi-wh-cell-sub" style={{ fontVariantNumeric: 'tabular-nums' }}>{index + 1}</td>
                                        <td><span className="ofi-wh-code">{row.serialNumber}</span></td>
                                        {showTargets && (
                                            <td>
                                                {row.project ? (
                                                    <span title={projectLabel(row.project)}>
                                                        {projectLabel(row.project)}
                                                        {row.project.isActive === false && <span className="ofi-wh-inactive">{t('warehouse.serials.inactive')}</span>}
                                                    </span>
                                                ) : <span className="ofi-wh-empty-cell">—</span>}
                                            </td>
                                        )}
                                        {showTargets && (
                                            <td>
                                                {row.device
                                                    ? <span title={deviceLabel(row.device)}>{deviceLabel(row.device)}</span>
                                                    : <span className="ofi-wh-empty-cell">—</span>}
                                            </td>
                                        )}
                                        <td className="ofi-wh-cell-sub">{row.createdAt ? fmtDate(row.createdAt) : '—'}</td>
                                        {canEdit && (
                                            <td className="is-tool">
                                                <RemoveButton disabled={rowBusy === row.key} onConfirm={() => void remove(row)} />
                                            </td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </section>
    );
};
