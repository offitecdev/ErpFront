import type { ProductionMailbox, ProductionMailboxes } from '@/types/purchasing';

/** Was das Formular eines Postfachs hält — Passwort leer = das gespeicherte bleibt. */
export interface MailboxDraft {
    isActive: boolean;
    fromEmail: string;
    fromName: string;
    password: string;
    smtpHost: string;
    smtpPort: string;
    imapHost: string;
    imapPort: string;
    smtpUser: string;
    imapFolder: string;
}

export const draftOf = (box: ProductionMailbox | null, defaults: ProductionMailboxes['defaults']): MailboxDraft => ({
    isActive: box?.isActive ?? true,
    fromEmail: box?.fromEmail ?? '',
    fromName: box?.fromName ?? '',
    password: '',
    smtpHost: box?.smtpHost ?? defaults.host,
    smtpPort: String(box?.smtpPort ?? defaults.smtpPort),
    imapHost: box?.imapHost ?? defaults.host,
    imapPort: String(box?.imapPort ?? defaults.imapPort),
    smtpUser: box?.smtpUser ?? '',
    imapFolder: box?.imapFolder ?? '',
});

const EMAIL = /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/;
export const emailValid = (value: string): boolean => EMAIL.test(value.trim());

/** Die Anfrage an den Server: SSL folgt dem Port (465/993), ein leeres Passwort wird nicht gesendet. */
export const bodyOf = (draft: MailboxDraft): Record<string, unknown> => {
    const smtpPort = Number(draft.smtpPort) || 465;
    const imapPort = Number(draft.imapPort) || 993;
    return {
        isActive: draft.isActive,
        fromEmail: draft.fromEmail.trim(),
        fromName: draft.fromName.trim() || null,
        smtpHost: draft.smtpHost.trim(),
        smtpPort,
        smtpSecure: smtpPort === 465,
        imapHost: draft.imapHost.trim(),
        imapPort,
        imapSecure: imapPort === 993,
        smtpUser: draft.smtpUser.trim() || null,
        imapUser: draft.smtpUser.trim() || null,
        imapFolder: draft.imapFolder.trim() || null,
        ...(draft.password ? { password: draft.password } : {}),
    };
};

/** Hat sich gegenüber dem Gespeicherten etwas geändert? (Das Passwort zählt, sobald eines getippt ist.) */
export const isDirty = (draft: MailboxDraft, box: ProductionMailbox | null, defaults: ProductionMailboxes['defaults']): boolean => {
    const base = draftOf(box, defaults);
    return Boolean(draft.password) || (Object.keys(base) as Array<keyof MailboxDraft>)
        .some((key) => key !== 'password' && String(draft[key]) !== String(base[key]));
};
