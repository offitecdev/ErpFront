import type { DeviceStage } from './deviceStages';

type Props = {
    stage: DeviceStage;
};

/**
 * ── DIE FLÄCHE EINER STUFE (24.09.2026) ─────────────────────────────────────
 *
 * Vorgabe Samet: «büyük bir alan olması lazım tüm içerikler için» — und nach
 * der ersten Fassung: «başlık olmayacak, açıklama ve 'Adım 1 / 7' de yazma»,
 * dann «kare içinde de olmayacak, direkt orası boş olsun». Also nur der
 * freie Platz, der den Rest des Fensters füllt — ohne Kopf, ohne Hinweis,
 * ohne Rahmen. Hier kommt der Inhalt der Stufe hinein, sobald er gebaut ist.
 * Welche Stufe es ist, sagt die Leiste darüber.
 */
export const DeviceStagePanel = ({ stage }: Props) => (
    <section
        id="ofi-pdev-panel"
        className="ofi-pdev-panel"
        role="tabpanel"
        aria-labelledby={`ofi-pdev-tab-${stage.id}`}
        data-stage={stage.id}
    />
);
