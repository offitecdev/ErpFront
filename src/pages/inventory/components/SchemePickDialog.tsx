import { useEffect, useMemo, useState } from 'react';

import { t } from '@/i18n/translate';
import { articleCodesApi, type CodeCategory, type CodeScheme } from '@/lib/api/articleCodes';
import { PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';

/**
 * NUMMERNKREIS WÄHLEN (10.09.2026) — für Wege, die neue Artikel OHNE Code
 * anlegen (die Lieferantenbestellung mit Zeilen ohne Produktcode). Seit dem
 * ERP-Code kommt jede Nummer aus einem von der IT freigegebenen Kreis:
 * Kategorie → Unterkategorie, der nächste Code steht daneben. Gibt es keinen
 * freigegebenen Kreis, sagt das Fenster, wo die IT ihn freigibt.
 */
export const SchemePickDialog = ({ open, onClose, onPick }: {
    open: boolean;
    onClose: () => void;
    onPick: (scheme: CodeScheme, category: CodeCategory) => void;
}) => {
    const [categories, setCategories] = useState<CodeCategory[] | null>(null);
    const [categoryId, setCategoryId] = useState('');
    const [schemeId, setSchemeId] = useState('');

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setCategories(null);
        articleCodesApi.list({ active: true })
            .then((rows) => {
                if (cancelled) return;
                setCategories(rows);
                // Ein einziger Kreis: gleich vorgewählt — ein Klick weniger.
                if (rows.length === 1 && rows[0]!.schemes.length === 1) {
                    setCategoryId(rows[0]!.id);
                    setSchemeId(rows[0]!.schemes[0]!.id);
                }
            })
            .catch(() => { if (!cancelled) setCategories([]); });
        return () => { cancelled = true; };
    }, [open]);

    const category = useMemo(() => categories?.find((row) => row.id === categoryId) ?? null, [categories, categoryId]);
    const scheme = useMemo(() => category?.schemes.find((row) => row.id === schemeId) ?? null, [category, schemeId]);
    const none = categories !== null && categories.length === 0;

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            title={t('inv.newProduct.codeFromScheme')}
            subtitle={t('inv.newProduct.codeAuto')}
            width={440}
            footer={(
                <div className="ofi-tp-actions">
                    <div className="ofi-tp-actions__start" />
                    <div className="ofi-tp-actions__end">
                        <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                        <PopupButton variant="primary" disabled={!scheme || !category} onClick={() => { if (scheme && category) onPick(scheme, category); }}>
                            {t('common.apply')}
                        </PopupButton>
                    </div>
                </div>
            )}
        >
            {none ? (
                <PopupNote tone="warning">{t('inv.newProduct.codeNoSchemes')}</PopupNote>
            ) : (
                <>
                    <PopupField label={t('inv.newProduct.codeCategory')}>
                        <select
                            value={categoryId}
                            onChange={(event) => { setCategoryId(event.target.value); setSchemeId(''); }}
                            className="ofi-cal-input w-full"
                        >
                            <option value="">{t('inv.newProduct.pickCategory')}</option>
                            {categories?.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
                        </select>
                    </PopupField>
                    <PopupField label={t('inv.newProduct.codeSub')} className="mt-3">
                        <select
                            value={schemeId}
                            disabled={!category}
                            onChange={(event) => setSchemeId(event.target.value)}
                            className="ofi-cal-input w-full"
                        >
                            <option value="">{t('inv.newProduct.pickSub')}</option>
                            {category?.schemes.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
                        </select>
                    </PopupField>
                    {scheme && (
                        <p className="mt-3 font-mono text-[13px] font-semibold text-[color:var(--ofi-cal-text)]">
                            {t('inv.newProduct.codeNext', { code: scheme.nextCode })}
                        </p>
                    )}
                </>
            )}
        </PopupDialog>
    );
};
