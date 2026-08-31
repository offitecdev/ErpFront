import { useMemo, useRef, useState } from 'react';
import { LuPaperclip } from 'react-icons/lu';
import { Camera01, Check, FileDownload02, Trash01, UploadCloud02, XClose } from '@/components/icons/antIconCompat';
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
import { DrawingPad } from './DrawingPad';
import { SignatureField } from './SignatureField';
import {
    downloadDataUrl,
    fileToDataUrl,
    formatBytes,
    imageFileToScaledDataUrl,
    INPUT_CLASS,
    SELECT_CLASS,
    TEXTAREA_CLASS,
} from '../ui';

/**
 * Rendert die Felder einer Vorlage zum Ausfüllen (oder nur zum Ansehen).
 *
 * Bedingte Felder: `computeFieldVisibility` (Spiegel des Servers) entscheidet
 * je Render, was sichtbar ist — "Kernbohrung nötig? = Ja" blendet
 * Bohrdurchmesser/Wandstärke/Anzahl ein, sobald der Wert steht; verschwindet
 * die Bedingung, verschwinden die Felder wieder (ihre Werte bleiben im
 * Zustand, der Server prüft nur SICHTBARE Pflichtfelder).
 *
 * `errors` = Ids der Pflichtfelder ohne Wert (nach einem Abschluss-Versuch):
 * die Zeile bekommt einen roten Rand und einen Hinweis. Ein Ausfüllen läuft
 * über `onChange(fieldId, wert)`; die Wertformen stehen in lib/formFields.ts.
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
        return <div className="py-10 text-center text-[13px] text-slate-400 dark:text-white/50">{emptyText ?? t('forms.render.empty')}</div>;
    }

    const set = (fieldId: string, value: unknown) => onChange?.(fieldId, value);

    return (
        <div className={dense ? 'space-y-2' : 'space-y-3'}>
            {visibleFields.map((field) => {
                if (field.type === 'SECTION') {
                    return (
                        <div key={field.id} className="flex items-center gap-3 pt-3 first:pt-0">
                            <span className="h-4 w-1 rounded-full bg-[#1f2654] dark:bg-amber-400" />
                            <h3 className="text-[14px] font-bold text-[#1f2654] dark:text-white">{field.label}</h3>
                            {field.help && <span className="text-[12px] text-slate-400">{field.help}</span>}
                            <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                        </div>
                    );
                }
                const invalid = Boolean(errors?.has(field.id));
                return (
                    <div
                        key={field.id}
                        data-field-id={field.id}
                        className={`rounded-xl border bg-white px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:bg-white/5 ${
                            invalid ? 'border-red-400 dark:border-red-500/60' : 'border-slate-200 dark:border-white/15'
                        } ${field.visibleWhen ? 'ml-4 border-l-4 border-l-[#1f2654]/40 dark:border-l-amber-400/50' : ''}`}
                    >
                        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                            <label className="text-[13px] font-semibold text-slate-800 dark:text-white">
                                {field.label}
                                {field.required && <span className="ml-0.5 text-red-500">*</span>}
                            </label>
                            {field.help && <span className="text-[11.5px] text-slate-500 dark:text-white/60">{field.help}</span>}
                        </div>
                        <FieldControl field={field} value={values[field.id]} onChange={(value) => set(field.id, value)} readOnly={readOnly} />
                        {invalid && <div className="mt-1.5 text-[11.5px] font-semibold text-red-600 dark:text-red-400">{t('forms.render.required')}</div>}
                    </div>
                );
            })}
        </div>
    );
};

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
                    className={TEXTAREA_CLASS}
                />
            ) : (
                <input
                    value={typeof value === 'string' ? value : ''}
                    onChange={(event) => onChange(event.target.value)}
                    placeholder={field.placeholder}
                    disabled={readOnly}
                    className={INPUT_CLASS}
                />
            );
        case 'DATE':
            // QuoteDatePicker statt <input type="date">: das native Feld zeigt
            // Format und Kalender in der BROWSER-Sprache (CrmFilterBar-Regel).
            return readOnly ? (
                <span className="text-[13.5px] text-slate-700 dark:text-white/80">{formatFormValue(field, value) || '—'}</span>
            ) : (
                <div className="max-w-xs">
                    <QuoteDatePicker
                        value={typeof value === 'string' ? value : ''}
                        onChange={(next) => onChange(next)}
                        ariaLabel={field.label}
                        placeholder={field.placeholder || t('forms.render.datePlaceholder')}
                        className={INPUT_CLASS}
                    />
                </div>
            );
        case 'CHECKBOX':
            return <CheckboxControl checked={value === true} onChange={onChange} disabled={readOnly} />;
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
            return <span className="text-[13px] text-slate-500">{formatFormValue(field, value)}</span>;
    }
};

const NumberControl = ({ field, value, onChange, disabled }: { field: FormFieldDef; value: unknown; onChange: (value: unknown) => void; disabled: boolean }) => {
    // Eigener Textzustand: "1," oder "-" sind gültige Zwischenzustände beim
    // Tippen, die als Zahl noch nicht bestehen. Gespeichert wird die Zahl.
    const [text, setText] = useState(() => (typeof value === 'number' ? String(value) : ''));
    // Kommt von aussen ein anderer Wert (Neuladen, Zurücksetzen), zieht der
    // Text nach — aber nur, wenn er nicht ohnehin schon diese Zahl bedeutet
    // ("1,5" bleibt beim Tippen stehen). Zustand aus Prop ableiten, wie React
    // es vorsieht: beim Rendern vergleichen, kein Effekt.
    const [seenValue, setSeenValue] = useState(value);
    if (seenValue !== value) {
        setSeenValue(value);
        const parsed = text.trim() === '' ? null : Number(text.replace(',', '.'));
        if (parsed !== value) setText(typeof value === 'number' ? String(value) : '');
    }
    const unit = FIELD_UNITS[field.type];
    return (
        <div className="relative max-w-xs">
            <input
                inputMode="decimal"
                value={text}
                disabled={disabled}
                placeholder={field.placeholder}
                onChange={(event) => {
                    const next = event.target.value;
                    setText(next);
                    const parsed = Number(next.replace(',', '.'));
                    onChange(next.trim() === '' || Number.isNaN(parsed) ? null : parsed);
                }}
                className={`${INPUT_CLASS} font-mono ${unit ? 'pr-12' : ''}`}
            />
            {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-[12.5px] font-semibold text-slate-400">{unit}</span>}
        </div>
    );
};

const CheckboxControl = ({ checked, onChange, disabled }: { checked: boolean; onChange: (value: unknown) => void; disabled: boolean }) => (
    <div className="flex items-center gap-3">
        <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onChange(!checked)}
            className={`flex size-9 items-center justify-center rounded-lg border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                checked ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white text-transparent hover:border-emerald-500 dark:border-white/25 dark:bg-transparent'
            }`}
        >
            <Check size={20} strokeWidth={3} />
        </button>
        <span className="text-[13px] text-slate-600 dark:text-white/70">{checked ? t('forms.value.yes') : t('forms.value.no')}</span>
    </div>
);

const SelectControl = ({ field, value, onChange, disabled }: { field: FormFieldDef; value: string; onChange: (value: unknown) => void; disabled: boolean }) => {
    const options = field.options || [];
    if (field.display === 'radio') {
        return (
            <div className="flex flex-wrap gap-2">
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
                            className={`rounded-lg border px-4 py-2 text-[13px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                                active
                                    ? 'border-[#1f2654] bg-[#1f2654] text-white dark:border-amber-500 dark:bg-amber-500 dark:text-slate-900'
                                    : 'border-slate-300 bg-white text-slate-700 hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:bg-transparent dark:text-white/80'
                            }`}
                        >
                            {option.label}
                        </button>
                    );
                })}
            </div>
        );
    }
    return (
        <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} className={`${SELECT_CLASS} max-w-md`}>
            <option value="">{field.placeholder || t('forms.render.selectPlaceholder')}</option>
            {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
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
        <div className="space-y-2">
            {value.length > 0 && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                    {value.map((photo, index) => (
                        <div key={index} className="group overflow-hidden rounded-lg border border-slate-200 bg-slate-50 dark:border-white/15 dark:bg-white/5">
                            <div className="relative aspect-[4/3]">
                                <img src={photo.dataUrl} alt="" className="h-full w-full object-cover" />
                                {!disabled && (
                                    <button
                                        type="button"
                                        title={t('common.delete')}
                                        onClick={() => onChange(value.filter((_, i) => i !== index))}
                                        className="absolute right-1 top-1 grid size-7 place-items-center rounded-full bg-black/55 text-white transition-opacity hover:bg-black/75 md:opacity-0 md:group-hover:opacity-100"
                                    >
                                        <XClose size={14} />
                                    </button>
                                )}
                            </div>
                            <input
                                value={photo.caption || ''}
                                disabled={disabled}
                                placeholder={t('forms.render.captionPlaceholder')}
                                onChange={(event) => onChange(value.map((item, i) => (i === index ? { ...item, caption: event.target.value } : item)))}
                                className="h-8 w-full border-t border-slate-200 bg-transparent px-2 text-[12px] text-slate-700 placeholder:text-slate-400 focus:outline-none dark:border-white/10 dark:text-white"
                            />
                        </div>
                    ))}
                </div>
            )}
            {!disabled && value.length < MAX_PHOTOS && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] disabled:cursor-wait dark:border-white/20 dark:bg-white/5 dark:text-white/70"
                >
                    <Camera01 size={16} />
                    {busy ? t('common.loading') : t('forms.render.addPhoto')}
                </button>
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
        <div className="space-y-2">
            {value.length > 0 && (
                <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-white/10 dark:border-white/15">
                    {value.map((file, index) => (
                        <li key={index} className="flex items-center gap-3 px-3 py-2">
                            <LuPaperclip size={15} className="shrink-0 text-slate-400" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate text-[13px] font-medium text-slate-800 dark:text-white">{file.name}</span>
                                <span className="block text-[11.5px] text-slate-400">{formatBytes(file.size)}{file.mimeType ? ` · ${file.mimeType}` : ''}</span>
                            </span>
                            <button type="button" title={t('forms.render.download')} onClick={() => downloadDataUrl(file.dataUrl, file.name)} className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/15">
                                <FileDownload02 size={14} />
                            </button>
                            {!disabled && (
                                <button type="button" title={t('common.delete')} onClick={() => onChange(value.filter((_, i) => i !== index))} className="inline-flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-400 hover:border-red-400 hover:text-red-600 dark:border-white/15">
                                    <Trash01 size={14} />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {!disabled && value.length < MAX_FILES && (
                <button
                    type="button"
                    disabled={busy}
                    onClick={() => inputRef.current?.click()}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] disabled:cursor-wait dark:border-white/20 dark:bg-white/5 dark:text-white/70"
                >
                    <UploadCloud02 size={16} />
                    {busy ? t('common.loading') : t('forms.render.addFile')}
                </button>
            )}
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(event) => void addFiles(event.target.files)} />
        </div>
    );
};
