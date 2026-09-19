/**
 * ── BELEGAUFSICHT (16.09.2026, Schritt 4) ───────────────────────────────────
 *
 *   governance.ts            wer darf was (Spiegel der Serverrechte) + Ausnahme-Politik
 *   DocumentHistoryButton    Knopf «Verlauf» für jede Belegkopfzeile (mit Eingriffspunkt)
 *   DocumentHistoryPopup     das Verlaufsfenster
 *   OverrideDialog           die Ausnahmetür der Systemverwaltung
 *   blockerText              ein Satz je Sperre
 */
export * from './governance';
export { DocumentHistoryButton } from './DocumentHistoryButton';
export { DocumentHistoryPopup } from './DocumentHistoryPopup';
export { OverrideDialog } from './OverrideDialog';
export { blockerText } from './blockerText';
