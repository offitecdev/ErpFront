import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, FolderTree, LayoutTemplate, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText, readBomTemplates } from '@/lib/api/productionBom';
import { LoadingState } from '../bomUi';
import { categoryOfArea, type Bom, type BomCode, type BomTemplate, type BomTemplateSummary } from '@/types/productionBom';

/**
 * ── «ALT BOM EKLE» (27.09.2026, Vorgabe Samet) ──────────────────────────────
 *
 * «Alt BOM kodları ayarlardan Mekanik ve Elektrik için ayrı ayrı belirlenir …
 *  illa şablondan eklemek zorunda değiliz, boş BOM da olabilir.» Ein Kod aus
 * den Einstellungen → eine leere Alt-BOM unter der Haupt-BOM; ihre Nummer
 * zählt der Kod (MAK-COOL-00001).
 */
export const AddSubBomDialog = ({
    open,
    main,
    codes,
    deviceId,
    onClose,
    onCreated,
}: {
    open: boolean;
    main: Bom;
    codes: BomCode[];
    deviceId: string;
    onClose: () => void;
    onCreated: (bom: Bom) => void;
}) => {
    const navigate = useNavigate();
    const [chosen, setChosen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const selected = chosen && codes.some((code) => code.prefix === chosen) ? chosen : codes[0]?.prefix ?? null;

    const create = async () => {
        if (!selected || busy) return;
        setBusy(true);
        try {
            const result = await productionBomApi.createSub(deviceId, main.area, selected);
            toast.success(t('productionBom.sub.created', { number: result.bom.bomNumber }));
            onCreated(result.bom);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={() => { if (!busy) onClose(); }}
            title={t('productionBom.sub.addTitle')}
            subtitle={t('productionBom.sub.addSubtitle', { main: main.bomNumber })}
            icon={<FolderTree size={18} />}
            width={480}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={busy}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton variant="primary" disabled={!selected} loading={busy} onClick={() => void create()}>
                        {t('productionBom.sub.add')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-bom-pop ofi-bom-pickpanel">
                {codes.length ? (
                    <div className="ofi-bom-pickpanel__list" role="radiogroup" aria-label={t('productionBom.sub.codes')}>
                        {codes.map((code) => {
                            const on = code.prefix === selected;
                            return (
                                <button
                                    key={code.prefix}
                                    type="button"
                                    role="radio"
                                    aria-checked={on}
                                    className={`ofi-bom-pickpanel__row ofi-nosize${on ? ' is-on' : ''}`}
                                    onClick={() => setChosen(code.prefix)}
                                >
                                    <span className="ofi-bom-pickpanel__radio" aria-hidden>{on && <Check />}</span>
                                    <span className="ofi-bom-pickpanel__text">
                                        <b>{code.name}</b>
                                        <small className="ofi-bom-code">{code.prefix}</small>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ) : (
                    <div className="ofi-bom-pickpanel__empty">
                        <b>{t('productionBom.sub.noCodes')}</b>
                        <small>{t('productionBom.sub.noCodesHint')}</small>
                        <button type="button" className="ofi-bom-btn is-small ofi-nosize" onClick={() => navigate('/production/settings')}>
                            <Settings2 />
                            {t('productionBom.settings.title')}
                        </button>
                    </div>
                )}
                <p className="ofi-bom-pickpanel__hint">{t('productionBom.sub.emptyHint')}</p>
            </div>
        </PopupDialog>
    );
};

/**
 * ── «ŞABLONDAN EKLE» (27.09.2026, Vorgabe Samet) ────────────────────────────
 *
 * «Şablon dediğimiz şey opsiyon … açılmış bir BOM'un altına da şablondan
 *  ekleyebilir … satırların altında.» Die Zeilen der gewählten Vorlage kommen
 * UNTER die bestehenden dieser BOM (die Menge × Stückzahl der Position); eine
 * Karte, die schon da ist, erhöht ihre Menge. Keine neue BOM entsteht.
 */
export const InsertTemplateDialog = ({
    open,
    bom,
    factor,
    onClose,
    onInsert,
}: {
    open: boolean;
    bom: Bom;
    factor: number;
    onClose: () => void;
    onInsert: (template: BomTemplate) => void;
}) => {
    const navigate = useNavigate();
    const [templates, setTemplates] = useState<BomTemplateSummary[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (!open) return;
        setLoading(true);
        setError(null);
        return readBomTemplates(
            (value) => { setTemplates(value.items.filter((entry) => entry.category === categoryOfArea(bom.area))); setLoading(false); },
            (failure) => { setError(productionBomErrorText(failure)); setLoading(false); },
        );
    }, [open, bom.area, retry]);
    const [chosen, setChosen] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const selected = chosen && templates.some((template) => template.id === chosen) ? chosen : null;

    const groups = new Map<string, BomTemplateSummary[]>();
    for (const template of templates) {
        const key = template.mainCard || '—';
        groups.set(key, [...(groups.get(key) ?? []), template]);
    }

    const insert = async () => {
        if (!selected || busy) return;
        setBusy(true);
        try {
            const template = await productionBomApi.template(selected);
            onInsert(template);
            setChosen(null);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={() => { if (!busy) onClose(); }}
            title={t('productionBom.insert.title')}
            subtitle={t('productionBom.insert.subtitle', { number: bom.bomNumber })}
            icon={<LayoutTemplate size={18} />}
            width={520}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={busy}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton variant="primary" disabled={!selected || loading || Boolean(error)} loading={busy} onClick={() => void insert()}>
                        {t('productionBom.insert.add')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-bom-pop ofi-bom-pickpanel">
                {loading ? <LoadingState /> : error ? <div className="ofi-bom-state is-error"><b>{error}</b>
                    <button type="button" className="ofi-bom-btn ofi-nosize" onClick={() => setRetry((value) => value + 1)}>{t('productionBom.common.retry')}</button>
                </div> : templates.length ? (
                    [...groups.entries()].map(([mainCard, list]) => (
                        <div key={mainCard} className="ofi-bom-pickpanel__group">
                            <span className="ofi-bom-pickpanel__caption">{mainCard}</span>
                            <div className="ofi-bom-pickpanel__list" role="radiogroup" aria-label={mainCard}>
                                {list.map((template) => {
                                    const on = template.id === selected;
                                    return (
                                        <button
                                            key={template.id}
                                            type="button"
                                            role="radio"
                                            aria-checked={on}
                                            className={`ofi-bom-pickpanel__row ofi-nosize${on ? ' is-on' : ''}`}
                                            onClick={() => setChosen(template.id)}
                                        >
                                            <span className="ofi-bom-pickpanel__radio" aria-hidden>{on && <Check />}</span>
                                            <span className="ofi-bom-pickpanel__text">
                                                <b>{template.name}</b>
                                                <small>{t('productionBom.insert.lines', { count: template.lineCount })}</small>
                                            </span>
                                            {template.isExample && <span className="ofi-bom-tag">{t('productionBom.templates.example')}</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className="ofi-bom-pickpanel__empty">
                        <b>{t('productionBom.pick.empty')}</b>
                        <button type="button" className="ofi-bom-btn is-small ofi-nosize" onClick={() => navigate('/production/templates/bom')}>
                            <Settings2 />
                            {t('productionBom.pick.manage')}
                        </button>
                    </div>
                )}
                <p className="ofi-bom-pickpanel__hint">
                    {factor > 1 ? t('productionBom.pick.multiplied', { count: factor }) : t('productionBom.insert.hint')}
                </p>
            </div>
        </PopupDialog>
    );
};
