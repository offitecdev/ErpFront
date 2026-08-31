import { useRef, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'sonner';
import { Printer, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import type { StaffRow } from '../types/personnel';
import { formatDate, fullName } from '../utils/format';
import { PersonnelSheet } from './PersonnelSheet';
import { GhostButton, PrimaryButton } from './primitives';

/**
 * ── DER QR-AUSWEIS EINER PERSON ──────────────────────────────────────────────
 *
 * Ein Code je Person, zwei Verwendungen: an der Anmeldeseite meldet er an, am
 * Tablet stempelt er ein und aus. Deshalb steht der Hinweis dazu direkt im
 * Fenster — wer die Karte in der Hand hält, soll wissen, was sie kann.
 *
 * NUR der Ausweis: Personalrolle und Arbeitsort standen hier einmal zum
 * Ändern, sind aber am 18.08.2026 entfallen. Beide werden beim ANLEGEN der
 * Person unmittelbar gewählt (`StaffCreateSheet`), die Rechtevergabe läuft
 * über die Einstellungen — dieses Fenster gibt nur die Karte heraus.
 *
 * DRUCKEN ohne Bibliothek: das gezeichnete SVG wird ausgelesen und in ein
 * eigenes Druckfenster geschrieben. `window.print()` auf der Seite selbst würde
 * die ganze Anwendung drucken; ein SVG-in-Bild-Umweg bräuchte eine Leinwand und
 * verlöre beim Skalieren an Schärfe — das SVG druckt in jeder Grösse sauber.
 */

const escapeHtml = (value: string) =>
    value.replace(/[&<>"']/g, (character) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character] ?? character));

export const StaffQrSheet = ({
    open,
    person,
    onClose,
    onRotated,
}: {
    open: boolean;
    person: StaffRow | null;
    onClose: () => void;
    onRotated: (employeeId: string, qrToken: string) => void;
}) => {
    const svgHostRef = useRef<HTMLDivElement | null>(null);
    const [rotating, setRotating] = useState(false);

    if (!person) return null;

    const name = fullName(person);
    const token = person.qrToken;

    const print = () => {
        const svg = svgHostRef.current?.querySelector('svg');
        if (!svg) return;
        const markup = new XMLSerializer().serializeToString(svg);
        const printWindow = window.open('', '_blank', 'width=520,height=680');
        if (!printWindow) {
            toast.error(t('personnel.qr.popupBlocked'));
            return;
        }
        const numberLine = person.staffNumber != null
            ? `<p class="meta">${escapeHtml(t('personnel.field.staffNumber'))}: ${person.staffNumber}</p>`
            : '';
        printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8">
            <title>${escapeHtml(name)}</title>
            <style>
                body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 28px;
                       display: flex; flex-direction: column; align-items: center; gap: 12px; }
                h1 { font-size: 20px; margin: 0; }
                .meta { font-size: 12px; color: #555; margin: 0; }
                svg { width: 260px; height: 260px; }
                .hint { font-size: 11px; color: #777; margin-top: 10px; text-align: center; max-width: 300px; }
            </style></head><body>
            <h1>${escapeHtml(name)}</h1>
            ${numberLine}
            <p class="meta">${escapeHtml(person.email)}</p>
            ${markup}
            <p class="hint">${escapeHtml(t('personnel.qr.printHint'))}</p>
            </body></html>`);
        printWindow.document.close();
        printWindow.focus();
        // Ohne den Aufschub druckt Safari das noch leere Fenster.
        window.setTimeout(() => printWindow.print(), 250);
    };

    const rotate = async () => {
        setRotating(true);
        try {
            const result = await personnelApi.rotateQr(person.id);
            onRotated(person.id, result.qrToken);
            toast.success(t('personnel.qr.rotated'));
        } catch (error) {
            toast.error((error as { response?: { data?: { error?: string } } })?.response?.data?.error || t('personnel.qr.rotateFailed'));
        } finally {
            setRotating(false);
        }
    };

    return (
        <PersonnelSheet
            open={open}
            onClose={onClose}
            title={t('personnel.person.title')}
            subtitle={name}
            width={560}
            height={760}
            footer={(
                <>
                    <GhostButton icon={<RefreshCcw01 size={14} />} onClick={() => void rotate()} disabled={rotating}>
                        {rotating ? t('common.loading') : t('personnel.qr.rotate')}
                    </GhostButton>
                    <PrimaryButton icon={<Printer size={14} />} onClick={print} disabled={!token}>
                        {t('personnel.qr.print')}
                    </PrimaryButton>
                </>
            )}
        >
            <div className="flex flex-col items-center gap-4">
                {token ? (
                    <div ref={svgHostRef} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-white/15">
                        <QRCodeSVG value={token} size={220} level="M" marginSize={2} />
                    </div>
                ) : (
                    <p className="py-10 text-center text-[13px] text-slate-400">{t('personnel.qr.missing')}</p>
                )}

                <dl className="w-full max-w-sm space-y-1.5 text-[12.5px]">
                    <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-white/60">{t('personnel.field.staffNumber')}</dt>
                        <dd className="font-mono text-slate-800 dark:text-white">{person.staffNumber ?? '—'}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-white/60">{t('personnel.field.email')}</dt>
                        <dd className="truncate text-slate-800 dark:text-white">{person.email}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                        <dt className="text-slate-500 dark:text-white/60">{t('personnel.field.createdAt')}</dt>
                        <dd className="text-slate-800 dark:text-white">{formatDate(person.createdAt)}</dd>
                    </div>
                </dl>

                <p className="max-w-sm text-center text-[11.5px] leading-relaxed text-slate-400 dark:text-white/45">
                    {t('personnel.qr.usageHint')}
                </p>

            </div>
        </PersonnelSheet>
    );
};
