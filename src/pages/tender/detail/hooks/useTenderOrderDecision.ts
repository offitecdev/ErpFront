import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { tenderApi } from '@/lib/api/tender';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';

import { projectApi, type SalesOrderMode } from '../../../../lib/api/project';
import type { ProjectDto } from '../../../../types/project';
import type { TenderListItem } from '../../../../types/tender';
import { bytesToBase64 } from '../tenderDetailUtils';

type UseTenderOrderDecisionParams = {
    tender: TenderListItem | undefined;
    isDirty: boolean;
    overtimeHourlyRate: number;
    fetchDetail: (id: string, silent?: boolean) => Promise<void>;
    navigate: NavigateFunction;
    // Flushes all staged line/meta edits (the top-bar Save); Approve and the
    // order flows call this automatically instead of demanding a manual save.
    saveAll: () => Promise<boolean>;
};

// An order needs somewhere to work and somewhere to invoice. Both slots normally
// carry the customer's Hauptadresse, so this only bites when the customer has no
// address at all: the check stays deliberately lenient — either the Projekt- or
// the Lieferadresse satisfies the first half — so quotes written under the older
// single-slot model can still be turned into orders. Shows a toast naming
// whichever is missing and returns false so the caller can bail out.
const hasRequiredAddresses = (tender: TenderListItem): boolean => {
    const installation = String((tender as any).installationAddress ?? '').trim();
    const delivery = String((tender as any).deliveryAddress ?? '').trim();
    const active = installation || delivery;
    // Legacy quotes could mirror billing off the project address instead of
    // storing it; honour that flag when the billing slot itself is empty.
    const sameAsInstallation = !!(tender as any).billingSameAsInstallation;
    const billing = String((tender as any).billingAddress ?? '').trim() || (sameAsInstallation ? active : '');
    if (!active) {
        toast.error(t('tenders.installation_address_required'));
        return false;
    }
    if (!billing) {
        toast.error(t('tenders.billing_address_required'));
        return false;
    }
    return true;
};

/**
 * Auftragsbestätigung an den Kunden — läuft unmittelbar nach dem Erstellen des
 * Auftrags. Die Offerte wird dafür noch einmal als PDF gerendert (derselbe
 * Generator wie Vorschau und Export) und als Anhang mitgeschickt; Empfänger und
 * CC bestimmt der Server aus der Offerte.
 *
 * Ein Fehler hier darf den erstellten Auftrag NICHT zurücknehmen: er wird als
 * Warnung gemeldet, der Ablauf geht weiter — die Mail lässt sich danach von
 * Hand aus dem Offert-Mailfenster nachreichen.
 */
const sendOrderConfirmation = async (tenderId: string): Promise<void> => {
    const { buildQuotePdf } = await import('@/utils/pdf/quotePdf');
    const doc = await buildQuotePdf(tenderId, usePdfSettingsStore.getState().settings);
    const result = await tenderApi.sendOrderMail(tenderId, {
        attachments: [{
            filename: doc.fileName,
            contentType: 'application/pdf',
            contentBase64: bytesToBase64(doc.bytes),
        }],
    });
    // preview = für den Mandanten ist kein SMTP hinterlegt: es ging NICHTS
    // hinaus, und genau das muss dastehen (sonst glaubt der Bediener, der Kunde
    // sei informiert).
    if (result.preview) toast.warning(t('tenders.order_mail_preview'));
    else toast.success(t('tenders.order_mail_sent', { to: result.to }));
};

// Owns the "turn this tender into an order/project" flow: the decision modal's
// state (mode, attach-to-existing toggle), the debounced
// existing-project search, and the submit/approve/create-project handlers. The
// resulting project id (freshly created or already linked) is surfaced as
// `projectId` so the caller can drive its sales-order UI.
export const useTenderOrderDecision = ({ tender, isDirty, overtimeHourlyRate, fetchDetail, navigate, saveAll }: UseTenderOrderDecisionParams) => {
    const [projectCreateLoading, setProjectCreateLoading] = useState(false);
    const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
    // When set, the "Project created successfully" popup is shown, offering to
    // jump into the new project or stay on the tender.
    const [projectCreatedModalId, setProjectCreatedModalId] = useState<string | null>(null);
    const [orderDecisionOpen, setOrderDecisionOpen] = useState(false);
    const [orderDecisionLoading, setOrderDecisionLoading] = useState(false);
    // Null until the user picks a card — the decision modal opens with neither
    // order type pre-selected.
    const [orderMode, setOrderMode] = useState<SalesOrderMode | null>(null);
    const [attachExistingProject, setAttachExistingProject] = useState(false);
    // Teslimat siparişinde zorunlu teslim tarihi (YYYY-MM-DD); teklifin
    // "Lieferdatum" (internalDeliveryDate) değerinden doldurulur.
    const [orderDeliveryDate, setOrderDeliveryDate] = useState('');
    const [projectSearch, setProjectSearch] = useState('');
    const [projectSearchLoading, setProjectSearchLoading] = useState(false);
    const [projectSearchResults, setProjectSearchResults] = useState<ProjectDto[]>([]);
    const [selectedExistingProject, setSelectedExistingProject] = useState<ProjectDto | null>(null);

    const projectId = tender?.projectId || createdProjectId;

    useEffect(() => {
        if (!orderDecisionOpen || !attachExistingProject) return;
        const timer = window.setTimeout(() => {
            setProjectSearchLoading(true);
            projectApi.list({ search: projectSearch.trim() || undefined })
                .then((projects) => setProjectSearchResults(projects.slice(0, 8)))
                .catch(() => setProjectSearchResults([]))
                .finally(() => setProjectSearchLoading(false));
        }, 220);

        return () => window.clearTimeout(timer);
    }, [attachExistingProject, orderDecisionOpen, projectSearch]);

    // Approve/order flows persist pending edits automatically — clicking them
    // acts as a save, so no separate manual Save step is required.
    const flushPendingEdits = async (): Promise<boolean> => {
        if (!isDirty) return true;
        return saveAll();
    };

    const openOrderDecision = async () => {
        if (!tender) return;
        if (!(await flushPendingEdits())) return;
        setOrderMode(null);
        setAttachExistingProject(false);
        setSelectedExistingProject(null);
        setProjectSearch('');
        setProjectSearchResults([]);
        setOrderDeliveryDate(tender.internalDeliveryDate ? tender.internalDeliveryDate.slice(0, 10) : '');
        setOrderDecisionOpen(true);
    };

    const handleSubmitOrderDecision = async () => {
        if (!tender) return;
        // Both the installation (deliveryAddress) and billing addresses must be set
        // before an order can be created.
        if (!hasRequiredAddresses(tender)) return;
        // No card chosen yet — force the user to pick an order type first.
        if (!orderMode) {
            toast.error(t('tenders.order_turunu_select'));
            return;
        }
        const finalMode: SalesOrderMode = orderMode === 'PROJECT_NEW' && attachExistingProject ? 'PROJECT_EXISTING' : orderMode;
        // Yeni proje için ad SORULMAZ; sunucu projeyi kendi koduyla adlandırır.
        if (finalMode === 'PROJECT_EXISTING' && !selectedExistingProject) {
            toast.error(t('tenders.add_istediginiz_projeyi_select'));
            return;
        }
        // Teslimat siparişinde teslim tarihi zorunlu (sunucu da doğrular).
        if (finalMode === 'INVOICE' && !orderDeliveryDate) {
            toast.error(t('tenders.delivery_date_required'));
            return;
        }

        setProjectCreateLoading(true);
        setOrderDecisionLoading(true);
        try {
            const res = await projectApi.createSalesOrderFromTender({
                tenderId: tender.id,
                mode: finalMode,
                projectId: finalMode === 'PROJECT_EXISTING' ? selectedExistingProject?.id : undefined,
                deliveryDate: finalMode === 'INVOICE' ? orderDeliveryDate : undefined,
                overtimeHourlyRate,
            });
            if (res.project?.id) setCreatedProjectId(res.project.id);
            toast.success(res.message ||t('tenders.order_created'));

            // Der Kunde erfährt SOFORT vom Auftrag — ohne Rückfrage und noch
            // bevor die Seite zum Projekt/Auftrag wechselt, damit ein Mailfehler
            // hier sichtbar wird und nicht in einem Seitenwechsel untergeht.
            if (tender.customerEmail) {
                try {
                    await sendOrderConfirmation(tender.id);
                } catch (mailError: any) {
                    toast.error(mailError?.response?.data?.error || t('tenders.order_mail_failed'));
                }
            }
            setOrderDecisionOpen(false);
            // Seçim doğrudan götürür (kullanıcı isteği, ara popup yok): proje
            // düzeyinde bir seçim PROJEYE, teslimat siparişi SİPARİŞE gider.
            if (res.project?.id) {
                navigate(`/projects/${res.project.id}`);
            } else if (res.salesOrder?.id) {
                navigate(`/crm/my-orders/${res.salesOrder.id}`);
            } else {
                await fetchDetail(tender.id, true);
            }
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.order_olusturulamadi'));
        } finally {
            setProjectCreateLoading(false);
            setOrderDecisionLoading(false);
        }
    };

    // Confirm / "Auftrag erstellen" artık SORAR (kullanıcı isteği): iki
    // seçenekli popup açılır — proje siparişi ya da teslimat siparişi. Bu karar
    // ayarlar menüsünde SAKLANAMAZ; ana akışın kendisidir. Adres kontrolü ve
    // asıl oluşturma popup'ın onayında yapılır (handleSubmitOrderDecision).
    const handleApprove = async () => {
        if (!tender) return;
        // Approve doubles as Save: staged line/meta edits are flushed first
        // (openOrderDecision does the flush).
        await openOrderDecision();
    };

    const handleCreateProject = async () => {
        if (projectId) {
            navigate(`/projects/${projectId}`);
            return;
        }
        if (!tender) return;
        // Creating the project also acts as save for any staged edits.
        if (!(await flushPendingEdits())) return;
        if (!hasRequiredAddresses(tender)) return;
        setProjectCreateLoading(true);
        try {
            const res = await projectApi.createFromTender(tender.id, undefined, overtimeHourlyRate);
            setCreatedProjectId(res.project.id);
            toast.success(res.message ||t('tenders.order_created'));
            await fetchDetail(tender.id, true);
            // Ask the user whether to open the project or stay, instead of
            // navigating away automatically.
            setProjectCreatedModalId(res.project.id);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.order_olusturulamadi'));
        } finally {
            setProjectCreateLoading(false);
        }
    };

    return {
        projectCreateLoading,
        createdProjectId,
        setCreatedProjectId,
        projectId,
        orderDecisionOpen,
        setOrderDecisionOpen,
        orderDecisionLoading,
        orderMode,
        setOrderMode,
        attachExistingProject,
        setAttachExistingProject,
        orderDeliveryDate,
        setOrderDeliveryDate,
        // Nur die Frage "geht überhaupt etwas hinaus?" für den Auftragsdialog —
        // die Adresse selbst wird dort nicht angezeigt.
        notifyRecipient: tender?.customerEmail || null,
        projectSearch,
        setProjectSearch,
        projectSearchLoading,
        projectSearchResults,
        selectedExistingProject,
        setSelectedExistingProject,
        openOrderDecision,
        handleSubmitOrderDecision,
        handleApprove,
        handleCreateProject,
        // "Project created successfully" popup wiring.
        projectCreatedModalId,
        goToCreatedProject: () => {
            const target = projectCreatedModalId;
            setProjectCreatedModalId(null);
            if (target) navigate(`/projects/${target}`);
        },
        dismissProjectCreated: () => setProjectCreatedModalId(null),
    };
};
