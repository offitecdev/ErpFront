import { useState } from 'react';
import { toast } from 'sonner';
import {
    Plus,
    Edit01 as EditIcon,
    Trash01 as TrashIcon,
    Save01 as Save,
    X as XIcon,
    User01 as UserIcon,
    MarkerPin01 as MapPin,
    Mail01 as Mail,
    Phone,
} from '@/components/icons/antIconCompat';

import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Textarea } from '../../components/ui-shared/Field';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { t as i18nT } from '@/i18n/translate';
import { customerApi } from '../../lib/api/customer';

// Clickable contact links: mailto: for email, tel: (digits/+ only) for phone.
const mailHref = (v: string) => `mailto:${v.trim()}`;
const telHref = (v: string) => `tel:${v.replace(/[^+\d]/g, '')}`;
const contactLinkClass = 'flex items-center gap-1.5 text-blue-700 hover:underline';

type FieldType = 'text' | 'number' | 'textarea' | 'email' | 'checkbox';

interface FieldDef {
    key: string;
    label: string;
    type?: FieldType;
    required?: boolean;
    colSpan?: 1 | 2;
    placeholder?: string;
}

interface EditableListProps<T extends { id: string }> {
    title: string;
    icon: React.ReactNode;
    addLabel: string;
    emptyText: string;
    emptyIcon: React.ReactNode;
    items: T[];
    fields: FieldDef[];
    blankForm: Record<string, any>;
    create: (body: any) => Promise<unknown>;
    update: (id: string, body: any) => Promise<unknown>;
    remove: (id: string) => Promise<unknown>;
    renderSummary: (item: T) => React.ReactNode;
    savedMsg: string;
    deletedMsg: string;
    deleteConfirm: string;
    onChanged: () => void;
}

function EditableList<T extends { id: string }>(props: EditableListProps<T>) {
    const { fields, blankForm } = props;
    const [mode, setMode] = useState<'idle' | 'new' | 'edit'>('idle');
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<Record<string, any>>(blankForm);
    const [saving, setSaving] = useState(false);
    const [confirmId, setConfirmId] = useState<string | null>(null);
    const [deleting, setDeleting] = useState(false);

    const openNew = () => {
        setForm(blankForm);
        setEditingId(null);
        setMode('new');
    };

    const openEdit = (item: T) => {
        const next: Record<string, any> = {};
        for (const f of fields) {
            const v = (item as any)[f.key];
            next[f.key] = v ?? (f.type === 'checkbox' ? false : '');
        }
        setForm(next);
        setEditingId(item.id);
        setMode('edit');
    };

    const closeForm = () => {
        setMode('idle');
        setEditingId(null);
    };

    const buildBody = () => {
        const body: Record<string, any> = {};
        for (const f of fields) {
            let v = form[f.key];
            if (f.type === 'number') {
                v = v === '' || v === null || v === undefined ? null : Number(v);
            } else if (f.type === 'checkbox') {
                v = !!v;
            }
            body[f.key] = v;
        }
        return body;
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const requiredMissing = fields.some(f => f.required && !String(form[f.key] ?? '').trim());
        if (requiredMissing) {
            toast.error(i18nT('crm.fillRequired'));
            return;
        }
        try {
            setSaving(true);
            const body = buildBody();
            if (mode === 'edit' && editingId) {
                await props.update(editingId, body);
            } else {
                await props.create(body);
            }
            toast.success(props.savedMsg);
            closeForm();
            props.onChanged();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || i18nT('common.error'));
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!confirmId) return;
        try {
            setDeleting(true);
            await props.remove(confirmId);
            toast.success(props.deletedMsg);
            setConfirmId(null);
            props.onChanged();
        } catch (err: any) {
            toast.error(err?.response?.data?.error || i18nT('common.error'));
        } finally {
            setDeleting(false);
        }
    };

    return (
        <Card
            title={props.title}
            icon={props.icon}
            actions={
                mode === 'idle'
                    ? <Button variant="primary" size="sm" icon={<Plus size={11} />} onClick={openNew}>{props.addLabel}</Button>
                    : null
            }
        >
            {mode !== 'idle' && (
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3 pb-4 mb-4 border-b border-slate-100">
                    {fields.map((f) => (
                        f.type === 'checkbox' ? (
                            <Field key={f.key} label={f.label} className={f.colSpan === 2 ? 'md:col-span-2' : ''}>
                                <Checkbox
                                    label={f.label}
                                    size="sm"
                                    isSelected={!!form[f.key]}
                                    onChange={(checked) => setForm({ ...form, [f.key]: checked })}
                                    className="rounded-lg bg-primary px-2.5 py-2 ring-1 ring-secondary ring-inset"
                                />
                            </Field>
                        ) : (
                            <Field key={f.key} label={f.label} required={f.required} className={f.colSpan === 2 || f.type === 'textarea' ? 'md:col-span-2' : ''}>
                                {f.type === 'textarea' ? (
                                    <Textarea
                                        rows={2}
                                        value={form[f.key] ?? ''}
                                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                                        placeholder={f.placeholder}
                                    />
                                ) : (
                                    <Input
                                        type={f.type === 'number' ? 'number' : f.type === 'email' ? 'email' : 'text'}
                                        value={form[f.key] ?? ''}
                                        onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                                        placeholder={f.placeholder}
                                    />
                                )}
                            </Field>
                        )
                    ))}
                    <div className="md:col-span-2 flex items-center justify-end gap-2">
                        <Button variant="secondary" type="button" icon={<XIcon size={13} />} onClick={closeForm}>{i18nT('common.cancel')}</Button>
                        <Button variant="primary" type="submit" loading={saving} icon={<Save size={13} />}>{i18nT('common.save')}</Button>
                    </div>
                </form>
            )}

            {props.items.length === 0 && mode === 'idle' ? (
                <EmptyState icon={props.emptyIcon} title={props.emptyText} />
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {props.items.map((item) => (
                        <div key={item.id} className="group relative border border-slate-200 rounded-md p-3 bg-white hover:border-slate-300 transition-colors">
                            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button type="button" onClick={() => openEdit(item)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title={i18nT('common.edit')}>
                                    <EditIcon size={13} />
                                </button>
                                <button type="button" onClick={() => setConfirmId(item.id)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title={i18nT('common.delete')}>
                                    <TrashIcon size={13} />
                                </button>
                            </div>
                            {props.renderSummary(item)}
                        </div>
                    ))}
                </div>
            )}

            <Modal
                open={confirmId !== null}
                title={i18nT('common.delete')}
                description={props.deleteConfirm}
                onClose={() => !deleting && setConfirmId(null)}
                width="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setConfirmId(null)} disabled={deleting}>{i18nT('common.cancel')}</Button>
                        <Button variant="danger" loading={deleting} icon={<TrashIcon size={13} />} onClick={handleDelete}>{i18nT('common.delete')}</Button>
                    </>
                }
            >
                <p className="text-[13px] text-slate-600">{props.deleteConfirm}</p>
            </Modal>
        </Card>
    );
}

/* ----------------------------- Contacts (Kontaktpersonen) ----------------------------- */
export const ContactsTab: React.FC<{ customerId: string; items: any[]; onChanged: () => void }> = ({ customerId, items, onChanged }) => (
    <EditableList
        title={i18nT('crm.tab_contacts')}
        icon={<UserIcon size={13} />}
        addLabel={i18nT('crm.contactsAdd')}
        emptyText={i18nT('crm.contactsEmpty')}
        emptyIcon={<UserIcon size={28} />}
        items={items}
        fields={[
            { key: 'firstName', label: i18nT('crm.firstName'), required: true },
            { key: 'lastName', label: i18nT('crm.lastName'), required: true },
            { key: 'title', label: i18nT('crm.contactTitleLabel') },
            { key: 'email', label: i18nT('common.email'), type: 'email' },
            { key: 'phone', label: i18nT('common.phone') },
            { key: 'mobilePhone', label: i18nT('crm.customers.mobilePhone') },
            { key: 'notes', label: i18nT('crm.note_content'), type: 'textarea' },
            { key: 'isPrimaryContact', label: i18nT('crm.contactPrimary'), type: 'checkbox' },
        ]}
        blankForm={{ firstName: '', lastName: '', title: '', email: '', phone: '', mobilePhone: '', notes: '', isPrimaryContact: false }}
        create={(body) => customerApi.addContact(customerId, body)}
        update={(cid, body) => customerApi.updateContact(customerId, cid, body)}
        remove={(cid) => customerApi.deleteContact(customerId, cid)}
        savedMsg={i18nT('crm.contactSaved')}
        deletedMsg={i18nT('crm.contactDeleted')}
        deleteConfirm={i18nT('crm.contactDeleteConfirm')}
        onChanged={onChanged}
        renderSummary={(c: any) => (
            <div className="pr-12">
                <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-slate-900 text-[13px]">{c.firstName} {c.lastName}</span>
                    {c.isPrimaryContact && <StatusChip variant="active">{i18nT('crm.contactPrimary')}</StatusChip>}
                </div>
                {c.title && <div className="text-[11.5px] text-slate-500 mt-0.5">{c.title}</div>}
                <div className="mt-1.5 space-y-0.5 text-[12px] text-slate-600">
                    {c.email && <a href={mailHref(c.email)} className={contactLinkClass}><Mail size={11} className="text-slate-400" /> {c.email}</a>}
                    {c.phone && <a href={telHref(c.phone)} className={contactLinkClass}><Phone size={11} className="text-slate-400" /> {c.phone}</a>}
                    {c.mobilePhone && <a href={telHref(c.mobilePhone)} className={contactLinkClass}><Phone size={11} className="text-slate-400" /> {c.mobilePhone}</a>}
                </div>
                {c.notes && <div className="mt-1.5 text-[11.5px] text-slate-500 leading-relaxed whitespace-pre-wrap">{c.notes}</div>}
            </div>
        )}
    />
);

/* ----------------------------- Addresses (Installation / Billing) ----------------------------- */
const ADDRESS_FIELDS: FieldDef[] = [
    { key: 'name', label: i18nT('crm.locationName'), required: true, colSpan: 2 },
    { key: 'address', label: i18nT('common.address'), colSpan: 2 },
    { key: 'postalCode', label: i18nT('crm.postalCode') },
    { key: 'city', label: i18nT('crm.city') },
    { key: 'country', label: i18nT('crm.country') },
    { key: 'contactPerson', label: i18nT('crm.locationContactPerson') },
    { key: 'phone', label: i18nT('common.phone') },
    { key: 'email', label: i18nT('common.email'), type: 'email' },
    { key: 'notes', label: i18nT('crm.note_content'), type: 'textarea' },
    { key: 'isPrimary', label: i18nT('crm.locationPrimary'), type: 'checkbox' },
];
const ADDRESS_BLANK = { name: '', address: '', postalCode: '', city: '', country: '', contactPerson: '', phone: '', email: '', notes: '', isPrimary: false };

const renderAddressSummary = (l: any) => (
    <div className="pr-12">
        <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-slate-900 text-[13px]">{l.name}</span>
            {l.isPrimary && <StatusChip variant="active">{i18nT('crm.locationPrimary')}</StatusChip>}
        </div>
        <div className="mt-1 text-[12px] text-slate-600 leading-relaxed">
            {[l.address, [l.postalCode, l.city].filter(Boolean).join(' '), l.country].filter(Boolean).join(', ')}
        </div>
        {l.contactPerson && <div className="text-[11.5px] text-slate-500 mt-1 flex items-center gap-1.5"><UserIcon size={11} className="text-slate-400" /> {l.contactPerson}</div>}
        <div className="mt-0.5 space-y-0.5 text-[12px] text-slate-600">
            {l.email && <a href={mailHref(l.email)} className={contactLinkClass}><Mail size={11} className="text-slate-400" /> {l.email}</a>}
            {l.phone && <a href={telHref(l.phone)} className={contactLinkClass}><Phone size={11} className="text-slate-400" /> {l.phone}</a>}
        </div>
    </div>
);

// One independent address list, scoped to a kind (INSTALLATION or BILLING).
const AddressList: React.FC<{ customerId: string; items: any[]; onChanged: () => void; kind: string; title: string; addLabel: string }> = ({ customerId, items, onChanged, kind, title, addLabel }) => (
    <EditableList
        title={title}
        icon={<MapPin size={13} />}
        addLabel={addLabel}
        emptyText={i18nT('crm.addressesEmpty')}
        emptyIcon={<MapPin size={28} />}
        items={items.filter((l) => (l.kind ?? 'INSTALLATION') === kind)}
        fields={ADDRESS_FIELDS}
        blankForm={ADDRESS_BLANK}
        create={(body) => customerApi.addLocation(customerId, { ...body, kind })}
        update={(lid, body) => customerApi.updateLocation(customerId, lid, body)}
        remove={(lid) => customerApi.deleteLocation(customerId, lid)}
        savedMsg={i18nT('crm.addressSaved')}
        deletedMsg={i18nT('crm.addressDeleted')}
        deleteConfirm={i18nT('crm.addressDeleteConfirm')}
        onChanged={onChanged}
        renderSummary={renderAddressSummary}
    />
);

export const AddressesTab: React.FC<{ customerId: string; items: any[]; onChanged: () => void }> = ({ customerId, items, onChanged }) => (
    <div className="flex flex-col gap-5">
        <AddressList customerId={customerId} items={items} onChanged={onChanged} kind="INSTALLATION" title={i18nT('crm.installationAddresses')} addLabel={i18nT('crm.installationAddressAdd')} />
        <AddressList customerId={customerId} items={items} onChanged={onChanged} kind="DELIVERY" title={i18nT('crm.deliveryAddresses')} addLabel={i18nT('crm.deliveryAddressAdd')} />
        <AddressList customerId={customerId} items={items} onChanged={onChanged} kind="BILLING" title={i18nT('crm.billingAddresses')} addLabel={i18nT('crm.billingAddressAdd')} />
    </div>
);

