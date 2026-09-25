import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { ArrowLeft } from '../icons/antIconCompat';
import { useBackTarget } from '../../lib/backNav';
import { useNavGuardStore } from '../../store/navGuardStore';

/**
 * ── DER RÜCKWEG IN DER SCHMALEN LEISTE (24.09.2026) ─────────────────────────
 *
 * Vorgabe Samet für die Geräteseite der Produktion: «ev ikonunun üstünde açık
 * mavi, yine Apple mavisi bir geri butonu olsun — sidebar'da, yanda, bu sayfa
 * açılınca». Die Seite hat keine Kopfleiste und damit keinen Blitz-Pfeil
 * (QuickBackButton); der Rückweg sitzt darum hier, rund und hellblau, über dem
 * Startseiten-Zeichen. WOHIN er führt, sagt wie überall `lib/backNav.ts`:
 * zuerst der Bildschirm davor (ein echter Verlaufsschritt, dann stehen die
 * Karten des Projekts wieder an ihrer Stelle), sonst das Projekt des Geräts.
 */
export const RailBackButton: React.FC = () => {
    const { t } = useTranslation();
    const back = useBackTarget();
    const navigate = useNavigate();
    if (!back) return null;

    const targetName = back.labelKey ? t(back.labelKey) : '';
    const label = targetName ? t('nav.backTo', { page: targetName }) : t('common.back');

    const goBack = () => {
        // Dieselbe Schranke für ungespeicherte Änderungen wie Menü und Blitz.
        const proceed = () => {
            if (back.historyStep && !useNavGuardStore.getState().historyPinned) navigate(-1);
            else navigate(back.to);
        };
        const { attempt } = useNavGuardStore.getState();
        if (attempt) attempt(proceed);
        else proceed();
    };

    return (
        <button
            type="button"
            className="ofi-rail-slim__back ofi-nosize rounded-full"
            aria-label={label}
            title={label}
            onClick={goBack}
        >
            <ArrowLeft size={16} strokeWidth={2.4} />
        </button>
    );
};
