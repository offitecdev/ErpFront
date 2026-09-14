import { useMemo, useRef, useState, type ReactNode } from 'react';
import { LuCamera, LuDownload, LuPaperclip, LuTrash2, LuUpload, LuX } from 'react-icons/lu';
import { toast } from 'sonner';
import { t } from '@/i18n/translate';
import {
    computeFieldVisibility,
    FIELD_UNITS,
    formatFormValue,
    NUMERIC_FIELD_TYPES,
    type FormFieldDef,
    type FormFileValue,
    type FormPhotoValue,
    type FormSignatureValue,
    type FormValues,
} from '@/lib/formFields';
import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { Switch } from '@/components/ui-shared/Switch';
import { DrawingPad } from './DrawingPad';
import { SignatureField } from './SignatureField';
import { downloadDataUrl, fileToDataUrl, formatBytes, imageFileToScaledDataUrl } from '../ui';
import '@/styles/modules/reportEditor.css';
import '@/styles/modules/checklists.css';

/**
 * ── DIE FELDER EINER CHECKLISTE ─────────────────────────────────────────────
 * Rendert die Felder einer Vorlage zum Ausfüllen (oder nur zum Ansehen) — seit
 * dem 02.09.2026 im Apple-Kleid («Inset Grouped» wie die iOS-Einstellungen,
 * dasselbe Kleid wie der Rapport-Editor): je Abschnitt eine WEISSE, runde
 * Gruppe mit kleiner grauer Überschrift darüber; darin eine Zeile je Feld mit
 * der Beschriftung links und dem Feld rechts (44px Zeilenhöhe, eingerückte
 * Haarlinie). Was breit ist — mehrzeiliger Text, Fotos, Dateien, Zeichnung,
 * Unterschrift — steht in einer gestapelten Zeile unter seiner Beschriftung.
 *
 * Bedingte Felder: `computeFieldVisibility` (Spiegel des Servers) entscheidet
 * je Render, was sichtbar ist — "Kernbohrung nötig? = Ja" blendet
 * Bohrdurchmesser/Wandstärke/Anzahl ein; verschwindet die Bedingung,
 * verschwinden die Felder wieder (ihre Werte bleiben im Zustand).
 *
 * `errors` = Ids der Pflichtfelder ohne Wert: die Zeile wird rot markiert.
 */
export const FormRenderer = ({
    fields,
    values,
    onChange,
    readOnly = false,
    errors,
    /** Für die Vorschau im Vorlagen-Editor: leere Vorlage sagt es. */
    emptyText,
    dense = false,
}: {
    fields: FormFieldDef[];
    values: FormValues;
    onChange?: (fieldId: string, value: unknown) => void;
    readOnly?: boolean;
    errors?: ReadonlySet<string>;
    emptyText?: string;
    dense?: boolean;
}) => {
    const visibility = useMemo(() => computeFieldVisibility(fields, values), [fields, values]);
    const visibleFields = fields.filter((field) => visibility[field.id] !== false);

    if (visibleFields.length === 0) {
        return <div className="ofi-chk-empty">{emptyText ?? t('forms.render.empty')}</div>;
    }

    const set = (fieldId: string, value: unknown) => onChange?.(fieldId, value);

    /* Gruppen: ein Abschnitt öffnet eine neue; was vor dem ersten Abschnitt
       steht, heisst «Allgemein». Eine Überschrift ohne Felder darunter bleibt
       trotzdem stehen — sie ist in der Vorlage gewollt. */
    type Group = { key: string; title: string | null; help?: string; fields: FormFieldDef[] };
    const groups: Group[] = [];
    let current: Group | null = null;
    for (const field of visibleFields) {
        if (field.type === 'SECTION') {
            current = { key: field.id, title: field.label, help: field.help, fields: [] };
            groups.push(current);
            continue;
        }
        if (!current) {
            current = { key: 'general', title: null, fields: [] };
            groups.push(current);
        }
        current.fields.push(field);
    }

    let ordinal = 0;

    return (
        <div className={`ofi-chk-groups ${dense ? 'is-dense' : ''}`}>
            {groups.map((group) => (
                <section key={group.key} className="ofi-chk-group">
                    <div className="ofi-ios-group__title">{group.title ?? t('forms.fill.sectionGeneral')}</div>
                    {group.fields.length > 0 && (
                        <div className="ofi-chk-card">
                            {group.fields.map((field) => {
                                ordinal += 1;
                                const invalid = Boolean(errors?.has(field.id));
                                const stacked = STACKED_TYPES.has(field.type) || (field.type === 'TEXT' && Boolean(field.multiline));
                                return (
                                    <div
                                        key={field.id}
                                        data-field-id={field.id}
                                        className={`ofi-chk-row ${stacked ? 'is-stack' : ''} ${invalid ? 'is-invalid' : ''} ${field.visibleWhen ? 'is-conditional' : ''}`}
                                    >
                                        <div className="ofi-chk-row__label">
                                            <span className="ofi-chk-row__num">{ordinal}</span>
                                            <span className="min-w-0">
                                                <span className="ofi-chk-row__text">
                                                    {field.label}
                                                    {field.required && <span className="ofi-chk-row__req" aria-hidden> *</span>}
                                                </span>
                                                {field.help && <span className="ofi-chk-row__help">{field.help}</span>}
                                                {invalid && <span className="ofi-chk-row__error">{t('forms.render.required')}</span>}
                                            </span>
                                        </div>
                                        <div className="ofi-chk-row__control">
                                            <FieldControl field={field} value={values[field.id]} onChange={(value) => set(field.id, value)} readOnly={readOnly} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {group.help && <div className="ofi-ios-group__footer">{group.help}</div>}
                </section>
            ))}
        </div>
    );
};

/** Feldtypen, die ihre ganze Zeile brauchen. */
const STACKED_TYPES: ReadonlySet<string> = new Set(['PHOTO', 'FILE', 'DRAWING', 'SIGNATURE']);

// ── Einzelne Eingabesteuerungen ─────────────────────────────────────────────

const FieldControl = ({
    field,
    value,
    onChange,
    readOnly,
}: {
    field: FormFieldDef;
    value: unknown;
    onChange: (value: unknown) => void;
    readOnly: boolean;
}) => {
    switch (field.type) {
        case 'TEXT':
            return field.multiline ? (
                <textarea
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={field.placeholder}
                    disabled={readOnly}
                    rows={3}
                    className="ofi-chk-input is-area"
                />
            ) : (
                <input
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={field.placeholder || '…'}
                    disabled={readOnly}
                    className="ofi-chk-input"
                />
            );
        case 'DATE':
            // QuoteDatePicker statt <input type="date">: das native Feld zeigt
            // Format und Kalender in der BROWSER-Sprache (CrmFilterBar-Regel).
            return readOnly ? (
                <span className="ofi-chk-readout">{formatFormValue(field, value) || '—'}</span>
            ) : (
                <div className="ofi-chk-datefield">
                    <QuoteDatePicker
                        value={typeof value === 'string' ? value : ''}
                        onChange={(next) => onChange(next)}
                        ariaLabel={field.label}
                        placeholder={field.placeholder || t('forms.render.datePlaceholder')}
                        className="ofi-chk-input"
                    />
                </div>
            );
        case 'CHECKBOX':
            return (
                <span className="ofi-chk-toggle">
                    <span className={`ofi-chk-toggle__word ${value === true ? 'is-on' : ''}`}>{value === true ? t('forms.value.yes') : t('forms.value.no')}</span>
                    <Switch checked={value === true} onChange={(next) => onChange(next)} label={field.label} disabled={readOnly} />
                </span>
            );
        case 'SELECT':
            return <SelectControl field={field} value={typeof value === 'string' ? value : ''} onChange={onChange} disabled={readOnly} />;
        case 'PHOTO':
            return <PhotoControl value={Array.isArray(value) ? (value as FormPhotoValue[]) : []} onChange={onChange} disabled={readOnly} />;
        case 'FILE':
            return <FileControl value={Array.isArray(value) ? (value as FormFileValue[]) : []} onChange={onChange} disabled={readOnly} />;
        case 'DRAWING':
            return <DrawingPad value={typeof value === 'string' ? value : null} onChange={onChange} disabled={readOnly} label={field.label} />;
        case 'SIGNATURE':
            return <SignatureField value={(value as FormSignatureValue | null) ?? null} onChange={onChange} disabled={readOnly} label={field.label} />;
        default:
            if (NUMERIC_FIELD_TYPES.has(field.type)) {
                return <NumberControl field={field} value={value} onChange={onChange} disabled={readOnly} />;
            }
            return <span className="ofi-chk-readout">{formatFormValue(field, value)}</span>;
    }
};

const NumberControl = ({ field, value, onChange, disabled }: { field: FormFieldDef; value: unknown; onChange: (value: unknown) => void; disabled: boolean }) => {
    // Eigener Textzustand: "1," oder "-" sind gültige Zwischenzustände beim
    // Tippen, die als Zahl noch nicht bestehen. Gespeichert wird die Zahl.
    const [text, setText] = useState(() => (typeof value === 'number' ? String(value) : ''));
    // Kommt von aussen ein anderer Wert (Neuladen), zieht der Text nach — aber
    // nur, wenn er nicht ohnehin schon diese Zahl bedeutet ("1,5" bleibt beim
    // Tippen stehen). Zustand aus Prop ableiten: beim Rendern, kein Effekt.
    const [seenValue, setSeenValue] = useState(value);
    if (seenValue !== value) {
        setSeenValue(value);
        const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'));
        if (parsed !== value) setText(typeof value === 'number' ? String(value) : '');
    }
    const unit = FIELD_UNITS[field.type];
    return (
        <span className={`ofi-chk-unitfield ${unit ? 'has-unit' : ''}`}>
            <input
                inputMode="decimal"
                value={text}
                disabled={disabled}
                placeholder={field.placeholder || '0'}
                onChange={(event) => {
                    const next = event.target.value;
                    setText(next);
                    const parsed = Number(next.replace(',', '.'));
                    onChange(next.trim() === '' || Number.isNaN(parsed) ? null : parsed);
                }}
                className="ofi-chk-input is-number"
            />
            {unit && <span className="ofi-chk-unitfield__unit">{unit}</span>}
        </span>
    );
};

/** Bis zu vier Optionen: Segmentwähler (iOS); mehr: Aufklappliste. */
const SEGMENT_MAX = 4;

const SelectControl = ({ field, value, onChange, disabled }: { field: FormFieldDef; value: string; onChange: (value: unknown) => void; disabled: boolean }) => {
    const options = field.options || [];
    if (field.display === 'radio' && options.length <= SEGMENT_MAX) {
        return (
            <span className="ofi-chk-seg" role="radiogroup" aria-label={field.label}>
                {options.map((option) => {
                    const active = option.id === value;
                    return (
                        <button
                            key={option.id}
                            type="button"
                            role="radio"
                            aria-checked={active}
                            disabled={disabled}
                            onClick={() => onChange(active ? '' : option.id)}
                            className={`ofi-chk-seg__item ${active ? 'is-on' : ''}`}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </span>
        );
    }
    return (
        <SelectMenu
            value={value}
            disabled={disabled}
            ariaLabel={field.label}
            placeholder={field.placeholder || t('forms.render.selectPlaceholder')}
            buttonClassName="ofi-chk-input is-select"
            className="ofi-chk-selectwrap"
            listWidth={280}
            options={[{ value: '', label: field.placeholder || t('forms.render.selectPlaceholder') }, ...options.map((option) => ({ value: option.id, label: option.label }))]}
            onChange={(next) => onChange(next)}
        />
    );
};

const MAX_PHOTOS = 30;

const PhotoControl = ({ value, onChange, disabled }: { value: FormPhotoValue[]; onChange: (value: unknown) => void; disabled: boolean }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    const addFiles = async (list: FileList | null) => {
        if (!list?.length) return;
        setBusy(true);
        try {
            const room = Math.max(0, MAX_PHOTOS - value.length);
            const files = Array.from(list).filter((file) => file.type.startsWith('image/')).slice(0, room);
            const scaled = await Promise.all(files.map((file) => imageFileToScaledDataUrl(file)));
            if (scaled.length) onChange([...value, ...scaled.map((dataUrl) => ({ dataUrl }))]);
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="ofi-chk-media">
            {value.length > 0 && (
                <div className="ofi-chk-photos">
                    {value.map((photo, index) => (
                        <figure key={index} className="ofi-chk-photo">
                            <span className="ofi-chk-photo__frame">
                                <img src={photo.dataUrl} alt="" />
                                {!disabled && (
                                    <button
                                        type="button"
                                        title={t('common.delete')}
                                        aria-label={t('common.delete')}
                                        onClick={() => onChange(value.filter((_, i) => i !== index))}
                                        className="ofi-chk-photo__remove"
                                    >
                                        <LuX size={13} />
                                    </button>
                                )}
                            </span>
                            <input
                                value={photo.caption || ''}
                                disabled={disabled}
                                placeholder={t('forms.render.captionPlaceholder')}
                                onChange={(event) => onChange(value.map((item, i) => (i === index ? { ...item, caption: event.target.value } : item)))}
                                className="ofi-chk-photo__caption"
                            />
                        </figure>
                    ))}
                </div>
            )}
            {!disabled && value.length < MAX_PHOTOS && (
                <AddLine busy={busy} icon={<LuCamera size={15} />} onClick={() => inputRef.current?.click()}>
                    {t('forms.render.addPhoto')}
                </AddLine>
            )}
            <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
        </div>
    );
};

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 20;

const FileControl = ({ value, onChange, disabled }: { value: FormFileValue[]; onChange: (value: unknown) => void; disabled: boolean }) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);

    const addFiles = async (list: FileList | null) => {
        if (!list?.length) return;
        setBusy(true);
        try {
            const room = Math.max(0, MAX_FILES - value.length);
            const accepted: FormFileValue[] = [];
            for (const file of Array.from(list).slice(0, room)) {
                if (file.size > MAX_FILE_BYTES) {
                    toast.error(t('forms.render.fileTooLarge', { name: file.name, max: formatBytes(MAX_FILE_BYTES) }));
                    continue;
                }
                accepted.push({ name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, dataUrl: await fileToDataUrl(file) });
            }
            if (accepted.length) onChange([...value, ...accepted]);
        } finally {
            setBusy(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className="ofi-chk-media">
            {value.length > 0 && (
                <ul className="ofi-chk-files">
                    {value.map((file, index) => (
                        <li key={index} className="ofi-chk-file">
                            <LuPaperclip size={15} className="ofi-chk-file__icon" />
                            <span className="min-w-0 flex-1">
                                <span className="ofi-chk-file__name">{file.name}</span>
                                <span className="ofi-chk-file__meta">{formatBytes(file.size)}{file.mimeType ? ` · ${file.mimeType}` : ''}</span>
                            </span>
                            <button type="button" title={t('forms.render.download')} aria-label={t('forms.render.download')} onClick={() => downloadDataUrl(file.dataUrl, file.name)} className="ofi-chk-iconbtn">
                                <LuDownload size={15} />
                            </button>
                            {!disabled && (
                                <button type="button" title={t('common.delete')} aria-label={t('common.delete')} onClick={() => onChange(value.filter((_, i) => i !== index))} className="ofi-chk-iconbtn is-danger">
                                    <LuTrash2 size={15} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {!disabled && value.length < MAX_FILES && (
                <AddLine busy={busy} icon={<LuUpload size={15} />} onClick={() => inputRef.current?.click()}>
                    {t('forms.render.addFile')}
                </AddLine>
            )}
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
        </div>
    );
};

/** Die Hinzufügen-Zeile im iOS-Stil: Ring mit Symbol, daneben das Wort. */
const AddLine = ({ busy, icon, onClick, children }: { busy: boolean; icon: ReactNode; onClick: () => void; children: ReactNode }) => (
    <button type="button" disabled={busy} onClick={onClick} className="ofi-chk-addline">
        <span className="ofi-chk-addline__ring">{icon}</span>
        <span>{busy ? t('common.loading') : children}</span>
    </button>
);
