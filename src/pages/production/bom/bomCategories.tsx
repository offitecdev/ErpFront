import { useState } from 'react';
import { Cpu, Layers, Tags, Wrench } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { primeBomSettings, productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import {
    BUILT_IN_CATEGORY_CODE,
    type BomCategory,
    type BomCustomCategory,
    type BomSettings,
} from '@/types/productionBom';

/** Makine: Schraubenschlüssel, Elektrik: Chip, eigene Kategorie: Ebenen. Helfer in `bomCategoryOptions.ts`. */
export const BomCategoryIcon = ({ category }: { category: BomCategory }) =>
    (category === 'ELECTRICAL' ? <Cpu /> : category === 'MACHINE' ? <Wrench /> : <Layers />);

/** Wie der Server den Kod liest: gross, nur A–Z/0–9. */
const cleanCode = (value: string): string => value.toUpperCase().replace(/İ/g, 'I').replace(/[^A-Z0-9]/g, '').slice(0, 8);

interface DialogProps {
    open: boolean;
    category: BomCustomCategory | null;
    onClose: () => void;
    /** Die ganzen Einstellungen danach (der Speicher ist schon frisch). */
    onSaved: (settings: BomSettings) => void;
}

/**
 * Anlegen (ohne `category`) oder Ändern einer eigenen Kategorie, mit Löschen.
 * Der Inhalt entsteht bei jedem Öffnen neu — er beginnt mit dem Stand der Kategorie.
 */
export const BomCategoryDialog = (props: DialogProps) =>
    (props.open ? <CategoryDialogBody key={props.category?.id ?? 'new'} {...props} /> : null);

const CategoryDialogBody = ({ category, onClose, onSaved }: DialogProps) => {
    const [name, setName] = useState(category?.name ?? '');
    const [code, setCode] = useState(category?.code ?? '');
    const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);

    const builtIn = (Object.values(BUILT_IN_CATEGORY_CODE) as string[]).includes(code);
    const valid = name.trim().length > 0 && /^[A-Z0-9]{2,8}$/.test(code) && !builtIn;

    const save = async () => {
        if (!valid || busy) return;
        setBusy('save');
        try {
            const input = { name: name.trim(), code };
            const next = category
                ? await productionBomApi.updateCategory(category.id, input)
                : await productionBomApi.createCategory(input);
            void primeBomSettings(next);
            toast.success(t(category ? 'productionBom.categories.saved' : 'productionBom.categories.created', { name: input.name }));
            onSaved(next);
        } catch (error) {
            toast.error(productionBomErrorText(error));
            setBusy(null);
        }
    };

    const remove = async () => {
        if (!category || busy) return;
        setBusy('delete');
        try {
            const next = await productionBomApi.deleteCategory(category.id);
            void primeBomSettings(next);
            toast.success(t('productionBom.categories.deleted', { name: category.name }));
            onSaved(next);
        } catch (error) {
            toast.error(productionBomErrorText(error));
            setBusy(null);
        }
    };

    return (
        <PopupDialog
            open
            onClose={() => { if (!busy) onClose(); }}
            title={t(category ? 'productionBom.categories.editTitle' : 'productionBom.categories.newTitle')}
            subtitle={t('productionBom.categories.dialogSub')}
            icon={<Tags size={18} />}
            width={460}
            footer={confirmDelete ? (
                <PopupActions start={<PopupButton onClick={() => setConfirmDelete(false)} disabled={Boolean(busy)}>{t('productionBom.common.cancel')}</PopupButton>}>
                    <PopupButton variant="danger" loading={busy === 'delete'} onClick={() => void remove()}>
                        {t('productionBom.categories.deleteConfirm')}
                    </PopupButton>
                </PopupActions>
            ) : (
                <PopupActions start={category ? (
                    <PopupButton variant="danger" disabled={Boolean(busy)} onClick={() => setConfirmDelete(true)}>{t('productionBom.common.delete')}</PopupButton>
                ) : undefined}>
                    <PopupButton onClick={onClose} disabled={Boolean(busy)}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={busy === 'save'} disabled={!valid} onClick={() => void save()}>
                        {t(category ? 'productionBom.common.save' : 'productionBom.categories.create')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            {confirmDelete && category ? (
                <PopupNote tone="danger">{t('productionBom.categories.deleteText', { name: category.name })}</PopupNote>
            ) : (
                <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
                    <PopupField label={t('productionBom.categories.name')} required>
                        <input
                            className="ofi-cal-input w-full"
                            value={name}
                            maxLength={60}
                            autoFocus
                            placeholder={t('productionBom.categories.namePlaceholder')}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </PopupField>
                    <PopupField label={t('productionBom.categories.code')} hint={t('productionBom.categories.codeHint')} required>
                        <input
                            className="ofi-cal-input w-full font-mono uppercase"
                            value={code}
                            maxLength={8}
                            spellCheck={false}
                            placeholder="HYD"
                            onChange={(event) => setCode(cleanCode(event.target.value))}
                        />
                    </PopupField>
                    <PopupNote tone={builtIn ? 'warning' : 'neutral'}>
                        {builtIn
                            ? t('productionBom.categories.codeBuiltIn', { code })
                            : t('productionBom.categories.preview', { number: `BOM-${code || '…'}-00001` })}
                    </PopupNote>
                    <button type="submit" hidden aria-hidden tabIndex={-1} />
                </form>
            )}
        </PopupDialog>
    );
};
