import { useState } from 'react';
import { TriangleAlert } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';

/**
 * ── «KAYDEDİLMEMİŞ DEĞİŞİKLİKLER VAR» (27.09.2026, Vorgabe Samet) ───────────
 *
 * «BOM listede otomatik kaydetme olmaması lazım … normal Kaydet butonu olmalı;
 *  başka aşamaya ya da menüden geçerken dikkat, kaydedilmemiş değişiklikler
 *  var demesi lazım.» Das Fenster der Wache (useUnsavedChangesGuard): weiter
 * bearbeiten, verwerfen oder speichern — und danach dorthin gehen, wohin man
 * wollte. Dieselben drei Knöpfe wie in den BOM-Vorlagen.
 */
export const BomUnsavedDialog = ({
    guard,
    text,
    onSave,
}: {
    guard: { isOpen: boolean; cancel: () => void; proceed: () => void };
    text: string;
    /** Speichert; `true` = geklappt, dann geht es weiter. */
    onSave: () => Promise<boolean>;
}) => {
    const [saving, setSaving] = useState(false);
    const saveAndGo = async () => {
        setSaving(true);
        try {
            if (await onSave()) guard.proceed();
        } finally {
            setSaving(false);
        }
    };
    return (
        <PopupDialog
            open={guard.isOpen}
            onClose={() => { if (!saving) guard.cancel(); }}
            title={t('productionBom.editor.unsavedTitle')}
            subtitle={text}
            icon={<TriangleAlert size={18} />}
            tone="danger"
            width={480}
            footer={(
                <PopupActions start={<PopupButton onClick={guard.cancel} disabled={saving}>{t('productionBom.editor.keepEditing')}</PopupButton>}>
                    <PopupButton variant="danger" onClick={guard.proceed} disabled={saving}>{t('productionBom.editor.discard')}</PopupButton>
                    <PopupButton variant="primary" loading={saving} onClick={() => void saveAndGo()}>{t('productionBom.common.save')}</PopupButton>
                </PopupActions>
            )}
        />
    );
};
