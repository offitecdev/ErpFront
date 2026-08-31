import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { File02, Save01, Trash01, UploadCloud02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { DateField } from '@/components/ui-shared/DateField';
import { personnelHrApi } from '@/lib/api/personnel';
import { passwordRequestApi, personAccessApi, type PersonAccess } from '@/lib/api/authorization';
import { useAuthStore } from '@/store/authStore';
import '@/styles/personnel.css';

import type { PersonProfile, StaffDocumentRow, WorkLocation } from '../../types/personnel';
import { GhostButton, PrimaryButton } from '../../components/primitives';
import { formatDate, formatDateTime, formatFileSize, toInputDate } from '../../utils/format';
import { openStaffDocument } from '../../utils/openStaffDocument';
import { WORK_LOCATIONS } from '../../utils/personnel';

/**
 * ── REITER «PROFIL» (Neuaufbau 27.08.2026, Vorgabe Samet) ────────────────────
 *
 * DIE GANZE AKTE AUF EINER FLÄCHE, in Gruppen statt als Turm: links die
 * Grunddaten und der Zugang (Rolle, Kennwort, sichtbare Firmen — der eigene
 * Reiter «Zugang» ist abgeschafft), rechts Arbeitsvertrag und Unterlagen mit
 * den Ablageknöpfen OBEN, nicht am Fussende.
 *
 * WAS WEG IST: die Personalrolle («Verwaltung», «Buchhaltung» — abgelöst durch
 * die Rollen der Einstellungen), das Anlagedatum (sagt nichts über die
 * Person), die Seitenrechte-Tabelle (sie gehört zur ROLLE und steht unter
 * Einstellungen → Berechtigungen).
 *
 * DIE FELDER SIND KLEIN UND RUHIG (`.ofi-pf-input` auf dem Google-Feldkleid),
 * Auswahl und Datum sind eigene Bauteile — kein Systemsteuerelement mehr.
 *
 * ZWEI SERVERWEGE, EIN SPEICHERN: die Stammdaten gehen an die Akte
 * (PATCH profile, employees.update), Rolle/Kennwort/Firmen an die
 * Zugangsverwaltung (PUT authorization, roles.manage). Wer nur das eine Recht
 * trägt, sieht die andere Gruppe gesperrt.
 */

const INPUT = 'ofi-cal-input ofi-pf-input w-full';

const readError = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

/** Beschriftetes Kompaktfeld — Label klein über der Eingabe. */
const Field = ({
    label,
    required,
    children,
    className = '',
}: {
    label: string;
    required?: boolean;
    children: React.ReactNode;
    className?: string;
}) => (
    <label className={`flex min-w-0 flex-col gap-1 ${className}`}>
        <span className="text-[11.5px] font-semibold text-slate-500 dark:text-white/60">
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {children}
    </label>
);

const DocumentRow = ({
    row,
    canEdit,
    onDeleted,
}: {
    row: StaffDocumentRow;
    canEdit: boolean;
    onDeleted: () => void;
}) => {
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        if (!window.confirm(t('personnel.doc.deleteConfirm', { name: row.title }))) return;
        setBusy(true);
        try {
            await personnelHrApi.deleteDocument(row.id);
            toast.success(t('personnel.doc.deleted'));
            onDeleted();
        } catch (error) {
            toast.error(readError(error, t('personnel.doc.deleteFailed')));
        } finally {
            setBusy(false);
        }
    };

    return (
        <li className="flex items-center gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-white/10">
            <File02 size={15} className="shrink-0 text-slate-400" />
            <button
                type="button"
                onClick={() => void openStaffDocument(row)}
                className="min-w-0 flex-1 text-left"
            >
                <span className="block truncate text-[12.5px] font-medium text-slate-800 underline-offset-2 hover:underline dark:text-white">
                    {row.title}
                </span>
                <span className="block truncate text-[11px] text-slate-400 dark:text-white/45">
                    {formatFileSize(row.sizeBytes)} · {formatDate(row.createdAt)}
                </span>
            </button>
            {canEdit && (
                <button
                    type="button"
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                    disabled={busy}
                    onClick={() => void remove()}
                    className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-rose-600 disabled:opacity-40 dark:hover:bg-white/10"
                >
                    <Trash01 size={13} />
                </button>
            )}
        </li>
    );
};

/**
 * DIE ABLAGEFLÄCHE: eine gestrichelte Kachel OBEN in der Karte, die als
 * Ganzes klickt (Vorgabe: «die Knöpfe sollen einladender sein und nicht ganz
 * unten stehen»). Ein Fusszeilen-Knopf war leicht zu übersehen.
 */
const UploadTile = ({
    label,
    hint,
    employeeId,
    kind,
    onUploaded,
}: {
    label: string;
    hint: string;
    employeeId: string;
    kind: 'CONTRACT' | 'DOCUMENT';
    onUploaded: () => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    const pick = async (file: File | undefined) => {
        if (!file) return;
        setBusy(true);
        try {
            await personnelHrApi.uploadDocument(employeeId, file, { kind, title: file.name });
            toast.success(t('personnel.doc.uploaded'));
            onUploaded();
        } catch (error) {
            toast.error(readError(error, t('personnel.doc.uploadFailed')));
        } finally {
            setBusy(false);
            // Dieselbe Datei zweimal wählen zu können, verlangt das Zurücksetzen.
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <>
            <input
                ref={inputRef}
                type="file"
                hidden
                accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx,.odt,.txt"
                onChange={(event) => void pick(event.target.files?.[0])}
            />
            <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="ofi-pf-upload"
            >
                <span className="ofi-pf-upload__icon"><UploadCloud02 size={17} /></span>
                <span className="min-w-0 text-left">
                    <span className="block text-[12.5px] font-semibold text-slate-700 dark:text-white/85">
                        {busy ? t('common.loading') : label}
                    </span>
                    <span className="block text-[11px] text-slate-400 dark:text-white/45">{hint}</span>
                </span>
            </button>
        </>
    );
};

export const PersonProfileTab = ({
    employeeId,
    isSelf,
    pendingRequest,
    onChanged,
}: {
    employeeId: string;
    isSelf: boolean;
    pendingRequest: { id: string; createdAt: string; note: string | null } | null;
    onChanged: () => void;
}) => {
    const permissions = useAuthStore((state) => state.permissions);
    const canManageAccess = permissions.includes('roles.manage');
    /* Kennwortwünsche entscheiden Administrator UND Projektleitung (Vorgabe
       27.08.2026) — employees.update genügt, roles.manage bleibt der Vollzugang. */
    const canDecidePassword = canManageAccess || permissions.includes('employees.update');

    const [data, setData] = useState<PersonProfile | null>(null);
    const [access, setAccess] = useState<PersonAccess | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Formularzustand — getrennt vom geladenen Stand, damit ein Neuladen im
    // Hintergrund keine halb getippte Eingabe wegwirft.
    const [form, setForm] = useState({
        firstName: '', lastName: '', email: '', phone: '', title: '',
        hireDate: '', workLocation: 'OFFICE' as WorkLocation,
    });
    const [roleId, setRoleId] = useState('');
    const [password, setPassword] = useState('');
    const [allowedTenantIds, setAllowedTenantIds] = useState<string[] | null>(null);

    const load = useCallback(() => {
        setLoading(true);
        Promise.allSettled([
            personnelHrApi.profile(employeeId),
            canManageAccess ? personAccessApi.get(employeeId) : Promise.resolve(null),
        ])
            .then(([profileResult, accessResult]) => {
                if (profileResult.status === 'fulfilled') {
                    const value = profileResult.value;
                    setData(value);
                    setForm({
                        firstName: value.person.firstName,
                        lastName: value.person.lastName,
                        email: value.person.email,
                        phone: value.person.phone ?? '',
                        title: value.person.title ?? '',
                        hireDate: toInputDate(value.person.hireDate),
                        workLocation: value.person.workLocation,
                    });
                    setRoleId(value.person.roleId ?? '');
                } else {
                    toast.error(readError(profileResult.reason, t('personnel.person.loadFailed')));
                }
                if (accessResult.status === 'fulfilled' && accessResult.value) {
                    setAccess(accessResult.value);
                    setRoleId(accessResult.value.roleId ?? '');
                    setAllowedTenantIds(accessResult.value.allowedTenantIds);
                }
            })
            .finally(() => setLoading(false));
    }, [employeeId, canManageAccess]);

    useEffect(load, [load]);

    /** Nur die Unterlagen neu holen — das Formular bleibt, wie es ist. */
    const reloadDocuments = useCallback(() => {
        personnelHrApi.profile(employeeId)
            .then((value) => setData((current) => (current
                ? { ...current, contract: value.contract, documents: value.documents }
                : value)))
            .catch(() => { /* Die Liste bleibt stehen; der Fehler stand schon im Toast. */ });
    }, [employeeId]);

    const save = async () => {
        if (!data) return;
        setSaving(true);
        try {
            if (data.canEdit) {
                await personnelHrApi.saveProfile(employeeId, {
                    firstName: form.firstName.trim(),
                    lastName: form.lastName.trim(),
                    email: form.email.trim(),
                    phone: form.phone.trim() || null,
                    title: form.title.trim() || null,
                    hireDate: form.hireDate || null,
                    workLocation: form.workLocation,
                });
            }
            if (canManageAccess) {
                await personAccessApi.save(employeeId, {
                    roleId: roleId || null,
                    password: password || undefined,
                    allowedTenantIds: allowedTenantIds ?? [],
                });
                setPassword('');
            }
            toast.success(t('personnel.profile.saved'));
            load();
            onChanged();
        } catch (error) {
            toast.error(readError(error, t('personnel.profile.saveFailed')));
        } finally {
            setSaving(false);
        }
    };

    const decideRequest = async (approve: boolean) => {
        if (!pendingRequest) return;
        try {
            setSaving(true);
            await passwordRequestApi.decide(pendingRequest.id, approve);
            toast.success(approve ? t('personnel.person.requestApproved') : t('personnel.person.requestRejected'));
            onChanged();
        } catch (error) {
            toast.error(readError(error, t('personnel.person.requestDecideFailed')));
        } finally {
            setSaving(false);
        }
    };

    if (loading && !data) return <InlineLoading />;
    if (!data) return null;

    const canEdit = data.canEdit;
    const patch = (next: Partial<typeof form>) => setForm((current) => ({ ...current, ...next }));
    const roleOptions = (access?.roles ?? data.roles.map((role) => ({ id: role.id, roleName: role.name })))
        .map((role) => ({ value: role.id, label: role.roleName }));
    /* Die Firmen kommen aus der Zugangsantwort, NICHT aus dem Firmenumschalter
       (der zeigt seit dem 31.08.2026 nur noch die zugeteilten Firmen). Ohne
       gespeicherte Zuteilung gilt genau die Firma, unter der die Person
       angelegt wurde. */
    const companies = access?.companies ?? [];
    const defaultTenantIds = access?.homeTenantId ? [access.homeTenantId] : [];
    const allowedSet = new Set(allowedTenantIds ?? defaultTenantIds);

    const toggleTenant = (tenantId: string) => {
        setAllowedTenantIds((current) => {
            const selected = new Set(current ?? defaultTenantIds);
            if (selected.has(tenantId)) selected.delete(tenantId);
            else selected.add(tenantId);
            // Immer eine ausdrückliche Liste: «alle angehakt» ist nicht mehr
            // dasselbe wie «keine Zuteilung» (das hiesse jetzt: nur die eigene).
            return [...selected];
        });
    };

    return (
        <div className="ofi-pf flex flex-col gap-4">
            {/* Offener Kennwortwunsch — für die Verwaltung mit Entscheidung,
                für die betroffene Person als Standmeldung. */}
            {pendingRequest && (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 dark:border-amber-400/30 dark:bg-amber-500/10">
                    <div className="min-w-0">
                        <span className="block text-[12.5px] font-semibold text-amber-900 dark:text-amber-200">
                            {t('personnel.person.pendingPasswordTitle')}
                        </span>
                        <span className="block text-[11.5px] text-amber-800/80 dark:text-amber-200/70">
                            {formatDateTime(pendingRequest.createdAt)}
                            {pendingRequest.note ? ` · ${pendingRequest.note}` : ''}
                        </span>
                    </div>
                    {canDecidePassword && !isSelf && (
                        <div className="flex shrink-0 items-center gap-2">
                            <GhostButton disabled={saving} onClick={() => void decideRequest(false)}>
                                {t('personnel.person.reject')}
                            </GhostButton>
                            <PrimaryButton disabled={saving} onClick={() => void decideRequest(true)}>
                                {t('personnel.person.approve')}
                            </PrimaryButton>
                        </div>
                    )}
                </div>
            )}

            <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="flex min-w-0 flex-col gap-4">
                    {/* ── GRUNDDATEN ────────────────────────────────────────── */}
                    <SectionCard
                        title={t('personnel.profile.basics')}
                        action={(canEdit || canManageAccess) ? (
                            <PrimaryButton icon={<Save01 size={13} />} onClick={() => void save()} disabled={saving}>
                                {saving ? t('common.loading') : t('common.save')}
                            </PrimaryButton>
                        ) : undefined}
                    >
                        <div className="grid gap-x-4 gap-y-3 p-3.5 sm:grid-cols-2">
                            <Field label={t('personnel.field.firstName')} required>
                                <input
                                    value={form.firstName}
                                    disabled={!canEdit}
                                    onChange={(event) => patch({ firstName: event.target.value })}
                                    className={INPUT}
                                />
                            </Field>
                            <Field label={t('personnel.field.lastName')} required>
                                <input
                                    value={form.lastName}
                                    disabled={!canEdit}
                                    onChange={(event) => patch({ lastName: event.target.value })}
                                    className={INPUT}
                                />
                            </Field>
                            <Field label={t('personnel.profile.workEmail')} required>
                                <input
                                    type="email"
                                    value={form.email}
                                    disabled={!canEdit}
                                    onChange={(event) => patch({ email: event.target.value })}
                                    className={INPUT}
                                />
                            </Field>
                            <Field label={t('personnel.profile.workPhone')}>
                                <input
                                    type="tel"
                                    value={form.phone}
                                    disabled={!canEdit}
                                    onChange={(event) => patch({ phone: event.target.value })}
                                    className={INPUT}
                                />
                            </Field>
                            <Field label={t('personnel.person.jobTitle')}>
                                <input
                                    value={form.title}
                                    disabled={!canEdit}
                                    onChange={(event) => patch({ title: event.target.value })}
                                    className={INPUT}
                                />
                            </Field>
                            {/* Vom Eintritt zählt das Urlaubskonto (Reiter
                                «Urlaub») — deshalb steht er hier und nicht das
                                Anlagedatum, das nichts über die Person sagt. */}
                            <Field label={t('personnel.person.hireDate')}>
                                <DateField
                                    value={form.hireDate}
                                    onChange={(next) => patch({ hireDate: next })}
                                    ariaLabel={t('personnel.person.hireDate')}
                                    disabled={!canEdit}
                                    clearable
                                    buttonClassName={INPUT}
                                />
                            </Field>
                            <Field label={t('personnel.field.workLocation')}>
                                <SelectMenu
                                    value={form.workLocation}
                                    disabled={!canEdit}
                                    onChange={(next) => patch({ workLocation: next as WorkLocation })}
                                    ariaLabel={t('personnel.field.workLocation')}
                                    buttonClassName={INPUT}
                                    options={WORK_LOCATIONS.map((location) => ({
                                        value: location,
                                        label: t(`personnel.workLocation.${location}`),
                                    }))}
                                />
                            </Field>
                            <Field label={t('personnel.field.staffNumber')}>
                                <input value={String(data.person.staffNumber ?? '')} disabled className={INPUT} />
                            </Field>
                        </div>
                    </SectionCard>

                    {/* ── ZUGANG — Rolle, Kennwort, sichtbare Firmen ─────────
                        Der frühere Reiter «Zugang» ist hier aufgegangen
                        (Vorgabe 27.08.2026); die Seitenrechte-Tabelle ist weg —
                        sie gehört zur Rolle, nicht zur Person. */}
                    <SectionCard title={t('personnel.person.accessSection')}>
                        {canManageAccess ? (
                            <div className="grid gap-x-4 gap-y-3 p-3.5 sm:grid-cols-2">
                                <Field label={t('settings.roles.colRole')}>
                                    <SelectMenu
                                        value={roleId}
                                        onChange={setRoleId}
                                        ariaLabel={t('settings.roles.colRole')}
                                        buttonClassName={INPUT}
                                        listWidth={280}
                                        options={[
                                            { value: '', label: t('personnel.person.noRole') },
                                            ...roleOptions,
                                        ]}
                                    />
                                </Field>
                                <Field label={t('personnel.person.newPassword')}>
                                    <input
                                        type="password"
                                        value={password}
                                        autoComplete="new-password"
                                        onChange={(event) => setPassword(event.target.value)}
                                        placeholder={t('personnel.person.passwordHint')}
                                        className={INPUT}
                                    />
                                </Field>
                                <div className="sm:col-span-2">
                                    <span className="mb-1 block text-[11.5px] font-semibold text-slate-500 dark:text-white/60">
                                        {t('personnel.person.companies')}
                                    </span>
                                    {/* Anhak-Kacheln statt Listenkästchen — eine
                                        Reihe, die sich wie Chips liest. */}
                                    <div className="flex flex-wrap gap-1.5">
                                        {companies.map((tenant) => {
                                            const active = allowedSet.has(tenant.id);
                                            return (
                                                <button
                                                    key={tenant.id}
                                                    type="button"
                                                    aria-pressed={active}
                                                    onClick={() => toggleTenant(tenant.id)}
                                                    className={`ofi-pf-chip ${active ? 'is-active' : ''}`}
                                                >
                                                    {tenant.tenantName}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <span className="mt-1 block text-[11px] text-slate-400 dark:text-white/45">
                                        {t('personnel.person.companiesHint')}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="grid gap-x-4 gap-y-3 p-3.5 sm:grid-cols-2">
                                <Field label={t('settings.roles.colRole')}>
                                    <input
                                        value={data.person.roleName ?? t('personnel.person.noRole')}
                                        disabled
                                        className={INPUT}
                                    />
                                </Field>
                                <Field label={t('personnel.field.email')}>
                                    <input value={data.person.email} disabled className={INPUT} />
                                </Field>
                            </div>
                        )}
                    </SectionCard>
                </div>

                <div className="flex min-w-0 flex-col gap-4">
                    {/* ── ARBEITSVERTRAG: genau EIN Platz ──────────────────── */}
                    <SectionCard title={t('personnel.profile.contract')}>
                        {canEdit && (
                            <div className="px-3 pt-3">
                                <UploadTile
                                    label={data.contract ? t('personnel.profile.contractReplace') : t('personnel.profile.contractUpload')}
                                    hint={t('personnel.profile.uploadHint')}
                                    employeeId={employeeId}
                                    kind="CONTRACT"
                                    onUploaded={reloadDocuments}
                                />
                            </div>
                        )}
                        {data.contract ? (
                            <ul className="list-none">
                                <DocumentRow row={data.contract} canEdit={canEdit} onDeleted={reloadDocuments} />
                            </ul>
                        ) : (
                            <p className="px-4 py-4 text-center text-[12px] text-slate-400 dark:text-white/45">
                                {t('personnel.profile.contractEmpty')}
                            </p>
                        )}
                    </SectionCard>

                    {/* ── DIE ÜBRIGEN UNTERLAGEN ───────────────────────────── */}
                    <SectionCard title={t('personnel.profile.documents', { count: data.documents.length })}>
                        {canEdit && (
                            <div className="px-3 pt-3">
                                <UploadTile
                                    label={t('personnel.profile.documentUpload')}
                                    hint={t('personnel.profile.uploadHint')}
                                    employeeId={employeeId}
                                    kind="DOCUMENT"
                                    onUploaded={reloadDocuments}
                                />
                            </div>
                        )}
                        {data.documents.length > 0 ? (
                            <ul className="list-none">
                                {data.documents.map((row) => (
                                    <DocumentRow key={row.id} row={row} canEdit={canEdit} onDeleted={reloadDocuments} />
                                ))}
                            </ul>
                        ) : (
                            <p className="px-4 py-4 text-center text-[12px] text-slate-400 dark:text-white/45">
                                {t('personnel.profile.documentsEmpty')}
                            </p>
                        )}
                    </SectionCard>
                </div>
            </div>
        </div>
    );
};
