import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import {
    Check,
    Edit01 as Pencil,
    List,
    Plus,
    Save01 as Save,
    Trash01 as Trash,
} from '@/components/icons/antIconCompat';
import { PopupButton } from '@/components/ui-shared/PopupKit';
import { SignaturePad } from '@/components/ui-shared/SignaturePad';
import { ReportImageUploader } from '@/components/ui-shared/ReportImageUploader';
import {
    checklistApi,
    deliveryReportApi,
    type ChecklistTemplateDto,
    type DeliveryReportDto,
    type DeliveryResponseItem,
} from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

import { orderPayloadId } from '../../../utils/projectOrderScope';
import { ChecklistEditorDialog, type EditableCheck } from './delivery/ChecklistEditorDialog';
import { ChecklistFillDialog } from './delivery/ChecklistFillDialog';
import { ChecklistPickerDialog } from './delivery/ChecklistPickerDialog';
import {
    answeredCount,
    checklistNameOf,
    groupChecklists,
    newRowId,
    statusLabelKey,
    type ReportChecklist,
} from './delivery/checklistModel';

/**
 * Übergabe-/Abnahme-Rapport — Editor (neu gebaut 19.08.2026, Benutzerwunsch:
 * "die Checklisten im Liefer-Rapport sind nicht gut").
 *
 * Der Rapport ist eine RUHIGE Liste von Checklisten-Karten. Gearbeitet wird in
 * drei Popups, nicht mehr im Fliesstext der Seite:
 *  • Hinzufügen  — `ChecklistPickerDialog` (kein zweiter Abschnitt mit einer
 *    Liste von Listen mehr; der EINE "+"-Knopf sitzt unten und wandert mit,
 *    wenn Listen dazukommen).
 *  • Bearbeiten  — `ChecklistEditorDialog` (Name, Punkte, Beschreibung DIREKT
 *    unter dem Punkt; optional zusätzlich als Vorlage ablegen).
 *  • Ausfüllen   — `ChecklistFillDialog` (Ja / Nein / N/A gross, Beschreibung
 *    darunter über die ganze Breite).
 *
 * Darunter Bemerkungen, Fotos und die beiden UNTERSCHRIFTEN: Techniker und
 * Kunde. Alle Änderungen bleiben lokal und gehen mit "Speichern" in EINEM
 * Aufruf zum Server.
 *
 * Die Unterschriften sind hier NUR ANSICHT (Vorgabe 19.08.2026): der
 * Projektleiter unterschreibt für niemanden. Der Techniker signiert auf seinem
 * eigenen Gerät (/montage), der Kunde dort oder über die Signaturanfrage —
 * darum trägt der Speichern-Aufruf dieser Fläche gar keine Signatur mehr.
 */
export const DeliveryChecklistView = ({
    project,
    order,
    appointment,
    onChanged,
    actionsHost,
}: {
    project: ProjectDto;
    order: { id: string } | null;
    appointment: any;
    /** Informs the sheet when the report appears/changes (drives its PDF glyph). */
    onChanged?: (report: DeliveryReportDto | null) => void;
    /** Fester Aktionsbereich im Popup-Kopf — "Speichern" wird dorthin portiert. */
    actionsHost?: HTMLElement | null;
}) => {
    const [report, setReport] = useState<DeliveryReportDto | null>(null);
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [technicianSignature, setTechnicianSignature] = useState<string | null>(null);
    const [customerSignature, setCustomerSignature] = useState<string | null>(null);
    const [templates, setTemplates] = useState<ChecklistTemplateDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [pickerOpen, setPickerOpen] = useState(false);
    /** Zu bearbeitende Liste; `{ checklist: null }` = neue Liste von Hand. */
    const [editing, setEditing] = useState<{ checklist: ReportChecklist | null } | null>(null);
    const [filling, setFilling] = useState<ReportChecklist | null>(null);

    const adopt = (row: DeliveryReportDto | null) => {
        setReport(row);
        setResponses(((row?.responses || []) as DeliveryResponseItem[]).map((item) => ({ ...item })));
        setNotes(row?.notes || '');
        setImages((row?.images || []).map((img) => img.imageData).filter(Boolean));
        setTechnicianSignature(row?.technicianSignature || null);
        setCustomerSignature(row?.customerSignature || null);
        onChanged?.(row);
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        Promise.all([
            deliveryReportApi.getByAppointment(appointment.id).catch(() => null),
            checklistApi.list().catch(() => [] as ChecklistTemplateDto[]),
        ]).then(([row, tpls]) => {
            if (cancelled) return;
            adopt(row);
            setTemplates(tpls);
        }).finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appointment.id]);

    const fallbackName = report?.checklistName || t('projects.delivery.uncategorized');
    const checklists = useMemo(() => groupChecklists(responses, fallbackName), [responses, fallbackName]);
    const addedNames = useMemo(() => new Set(checklists.map((entry) => entry.name)), [checklists]);

    // ── lokale Mutationen ────────────────────────────────────────────────────
    const addTemplate = (tpl: ChecklistTemplateDto) => {
        const items = Array.isArray(tpl.items) ? tpl.items : [];
        if (items.length === 0) return toast.error(t('projects.delivery.emptyTemplate'));
        // Ein zweites Mal dieselbe Liste würde mit der ersten verschmelzen.
        if (addedNames.has(tpl.name)) return toast.error(t('projects.delivery.alreadyAdded'));
        setResponses((prev) => [...prev, ...items.map((item) => ({
            id: newRowId(),
            category: tpl.name,
            label: item.label,
            status: null,
            measurement: '',
            measurementEnabled: Boolean(item.measurement),
        }))]);
    };

    const removeChecklist = (name: string) =>
        setResponses((prev) => prev.filter((row) => checklistNameOf(row, fallbackName) !== name));

    /** Ergebnis des Bearbeiten-Popups: Punkte der Liste ersetzen, Reihenfolge halten. */
    const applyEdit = (previous: ReportChecklist | null, name: string, checks: EditableCheck[], asTemplate: boolean) => {
        const rows: DeliveryResponseItem[] = checks.map((check) => {
            const old = previous?.items.find((item) => item.id === check.id);
            return {
                id: check.id,
                category: name,
                label: check.label,
                status: old?.status ?? null,
                measurement: check.measurement,
                measurementEnabled: check.measurementEnabled,
            };
        });
        setResponses((prev) => {
            if (!previous) return [...prev, ...rows];
            const at = prev.findIndex((row) => checklistNameOf(row, fallbackName) === previous.name);
            const rest = prev.filter((row) => checklistNameOf(row, fallbackName) !== previous.name);
            const index = at < 0 ? rest.length : Math.min(at, rest.length);
            return [...rest.slice(0, index), ...rows, ...rest.slice(index)];
        });
        if (!asTemplate) return;
        void checklistApi.create({
            name,
            description: null,
            items: checks.map((check) => ({ id: check.id, category: '', label: check.label, measurement: check.measurementEnabled })),
            isActive: true,
        })
            .then((saved) => {
                setTemplates((prev) => [saved, ...prev.filter((tpl) => tpl.id !== saved.id)]);
                toast.success(t('settings.checklist.saved'));
            })
            .catch((error: any) => toast.error(error?.response?.data?.error || t('settings.checklist.saveError')));
    };

    /** Ergebnis des Ausfüll-Popups: nur Status/Beschreibung der Liste ersetzen. */
    const applyFill = (name: string, items: DeliveryResponseItem[]) => {
        const byId = new Map(items.map((item) => [item.id, item]));
        setResponses((prev) => prev.map((row) =>
            (checklistNameOf(row, fallbackName) === name && byId.has(row.id))
                ? { ...row, ...byId.get(row.id)!, category: row.category }
                : row));
    };

    // ── speichern ────────────────────────────────────────────────────────────
    const save = async () => {
        if (responses.length === 0) return toast.error(t('projects.delivery.needChecklist'));
        setSaving(true);
        try {
            const imagePayload = images.map((imageData) => ({ imageData }));
            const updated = report
                ? await deliveryReportApi.update(report.id, {
                    responses,
                    notes: notes.trim() || null,
                    checklistName: checklists[0]?.name || report.checklistName,
                    images: imagePayload,
                })
                : await deliveryReportApi.create({
                    projectId: project.id,
                    salesOrderId: orderPayloadId(order as any),
                    appointmentId: appointment.id,
                    checklistName: checklists[0]?.name || null,
                    responses,
                    notes: notes.trim() || null,
                    images: imagePayload,
                });
            adopt(updated);
            toast.success(t('projects.delivery.admin.saved'));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('projects.delivery.admin.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const saveButton = (
        <PopupButton variant="primary" icon={<Save size={15} />} loading={saving} disabled={loading} onClick={() => void save()}>
            {t('common.save')}
        </PopupButton>
    );

    if (loading) return <div className="ofi-shimmer h-40 rounded-xl" />;

    return (
        <div className="ofi-dlv">
            {actionsHost ? createPortal(saveButton, actionsHost) : null}

            {report?.isSigned && (
                <div className="ofi-tp-note is-success">{t('projects.delivery.admin.signedNote')}</div>
            )}

            {/* ── Die Checklisten des Rapports ─────────────────────────────── */}
            {checklists.map((checklist) => {
                const done = answeredCount(checklist.items);
                return (
                    <section key={checklist.name} className="ofi-dlv-card">
                        <header className="ofi-dlv-card__head">
                            <span className="ofi-dlv-card__icon"><List size={15} /></span>
                            <span className="ofi-dlv-card__title">{checklist.name}</span>
                            <span className={`ofi-dlv-card__count ${done === checklist.items.length ? 'is-done' : ''}`}>
                                {done}/{checklist.items.length}
                            </span>
                            <span className="ofi-dlv-card__actions">
                                <button
                                    type="button"
                                    className="ofi-dlv-iconbtn"
                                    title={t('projects.delivery.fillChecklist')}
                                    aria-label={t('projects.delivery.fillChecklist')}
                                    onClick={() => setFilling(checklist)}
                                >
                                    <Check size={18} />
                                </button>
                                <button
                                    type="button"
                                    className="ofi-dlv-iconbtn"
                                    title={t('projects.delivery.editChecklist')}
                                    aria-label={t('projects.delivery.editChecklist')}
                                    onClick={() => setEditing({ checklist })}
                                >
                                    <Pencil size={17} />
                                </button>
                                <button
                                    type="button"
                                    className="ofi-dlv-iconbtn is-danger"
                                    title={t('projects.delivery.removeChecklist')}
                                    aria-label={t('projects.delivery.removeChecklist')}
                                    onClick={() => removeChecklist(checklist.name)}
                                >
                                    <Trash size={19} />
                                </button>
                            </span>
                        </header>

                        <div className="ofi-dlv-items">
                            {checklist.items.map((item) => (
                                <button
                                    key={item.id}
                                    type="button"
                                    className="ofi-dlv-item"
                                    onClick={() => setFilling(checklist)}
                                >
                                    <span className="ofi-dlv-item__main">
                                        <span className="ofi-dlv-item__label">{item.label}</span>
                                        {item.measurement ? <span className="ofi-dlv-item__desc">{item.measurement}</span> : null}
                                    </span>
                                    <span className={`ofi-dlv-status is-${(item.status || 'open').toLowerCase()}`}>
                                        {item.status ? t(statusLabelKey[item.status]) : t('projects.delivery.open')}
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                );
            })}

            {checklists.length === 0 && (
                <div className="ofi-dlv-blank">{t('projects.delivery.noChecklistYet')}</div>
            )}

            {/* Der EINE "+"-Knopf: immer unter der letzten Liste. */}
            <button type="button" className="ofi-dlv-add" onClick={() => setPickerOpen(true)}>
                <Plus size={18} />
                {t('projects.delivery.addChecklist')}
            </button>

            {/* ── Bemerkungen ──────────────────────────────────────────────── */}
            <section className="ofi-dlv-card">
                <header className="ofi-dlv-card__head">
                    <span className="ofi-dlv-card__title">{t('projects.delivery.notes')}</span>
                </header>
                <div className="ofi-dlv-card__body">
                    <textarea
                        rows={3}
                        className="ofi-cal-input w-full"
                        value={notes}
                        placeholder={t('projects.delivery.notesPlaceholder')}
                        onChange={(event) => setNotes(event.target.value)}
                    />
                </div>
            </section>

            {/* ── Fotos ────────────────────────────────────────────────────── */}
            <section className="ofi-dlv-card">
                <header className="ofi-dlv-card__head">
                    <span className="ofi-dlv-card__title">{t('projects.delivery.photos')}</span>
                </header>
                <div className="ofi-dlv-card__body">
                    <ReportImageUploader value={images} onChange={setImages} />
                </div>
            </section>

            {/* ── Unterschriften: Techniker UND Kunde — NUR ANSICHT ─────────
                Dieser Editor ist die Projektleiter-Fläche, und der
                Projektleiter unterschreibt nie (Vorgabe 19.08.2026): der
                Techniker signiert auf seinem eigenen Gerät (/montage), der
                Kunde dort oder über die Signaturanfrage. Beide Felder zeigen
                hier also nur den Stand — deshalb wandert von hier auch keine
                Unterschrift mehr in den Speicher-Aufruf. */}
            <section className="ofi-dlv-card">
                <header className="ofi-dlv-card__head">
                    <span className="ofi-dlv-card__title">{t('signatures.section')}</span>
                </header>
                <div className="ofi-dlv-card__body">
                    <div className="ofi-tp-note">{t('signatures.readOnlyNote')}</div>
                    <div className="ofi-sign-grid pt-3">
                        <SignaturePad
                            label={t('projects.delivery.technicianSignature')}
                            value={technicianSignature}
                            onChange={() => { /* nur Ansicht — siehe oben. */ }}
                            caption={report?.technicianSignedAt
                                ? dayjs(report.technicianSignedAt).format('DD.MM.YYYY HH:mm')
                                : t('projects.delivery.technicianSignatureHint')}
                            readOnly
                        />
                        <SignaturePad
                            label={t('projects.delivery.customerSignature')}
                            value={customerSignature}
                            onChange={() => { /* nur Ansicht — siehe oben. */ }}
                            caption={report?.signedAt
                                ? dayjs(report.signedAt).format('DD.MM.YYYY HH:mm')
                                : project.customer?.companyName || undefined}
                            readOnly
                        />
                    </div>
                </div>
            </section>

            {!actionsHost && <div className="flex items-center justify-end">{saveButton}</div>}

            <ChecklistPickerDialog
                open={pickerOpen}
                templates={templates}
                addedNames={addedNames}
                onPick={addTemplate}
                onCreateNew={() => { setPickerOpen(false); setEditing({ checklist: null }); }}
                onClose={() => setPickerOpen(false)}
            />

            <ChecklistEditorDialog
                open={Boolean(editing)}
                checklist={editing?.checklist || null}
                takenNames={checklists
                    .map((entry) => entry.name)
                    .filter((name) => name !== editing?.checklist?.name)}
                onClose={() => setEditing(null)}
                onSave={(name, checks, asTemplate) => applyEdit(editing?.checklist || null, name, checks, asTemplate)}
            />

            <ChecklistFillDialog
                open={Boolean(filling)}
                checklist={filling}
                onClose={() => setFilling(null)}
                onApply={(items) => { if (filling) applyFill(filling.name, items); }}
            />
        </div>
    );
};
