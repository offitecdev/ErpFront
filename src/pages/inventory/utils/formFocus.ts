/**
 * Kaydetme zorunlu alan yüzünden reddedildi: ilk eksik satıra kaydırır ve
 * onun ilk alanına odaklanır (satırlar `FormRow`, eksik olan `data-invalid`
 * taşır). Bir kare beklenir ki kırmızı işaretler önce çizilsin.
 */
export const focusFirstInvalid = (root: HTMLElement | null): void => {
    window.requestAnimationFrame(() => {
        const row = root?.querySelector<HTMLElement>('[data-invalid]');
        if (!row) return;
        row.scrollIntoView({ block: 'center', behavior: 'smooth' });
        row.querySelector<HTMLElement>('input, button:not([disabled]), [tabindex="0"]')?.focus({ preventScroll: true });
    });
};
