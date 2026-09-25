/**
 * TEKLİFTEN YENİ ÜRÜN (23.09.2026) — teklif satırındaki "Stoğa eklensin mi?"
 * balonu ürün formunu YENİ SEKMEDE açar; iki sekme bu kanal üzerinden konuşur
 * (aynı köken, BroadcastChannel).
 *
 *   created   → form kaydetti: teklif satırı yeni ürüne bağlanır.
 *   cancelled → form kaydedilmeden kapandı ya da çarpıya basıldı: teklif
 *               sekmesindeki balon yeniden sorar.
 *
 * Her balon kendi `requestId`'sini taşır; başka bir satırın (ya da başka bir
 * teklifin) mesajı ona dokunmaz.
 */
import type { ArticleDetail } from '@/types/inventory';

const CHANNEL_NAME = 'ofi-article-create';

/** Ürün formunun adres satırında isteği taşıyan parametre. */
export const ARTICLE_CREATE_REQUEST_PARAM = 'quoteRequest';

export type ArticleCreateMessage =
    | { type: 'created'; requestId: string; tenantId: string | null; article: ArticleDetail }
    | { type: 'cancelled'; requestId: string };

export const newArticleCreateRequestId = (): string =>
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** Ürün formunun adresi: ad önceden dolu, istek kimliği yanında. */
export const articleCreateUrl = (name: string, requestId: string): string => {
    const query = new URLSearchParams();
    if (name) query.set('name', name);
    query.set(ARTICLE_CREATE_REQUEST_PARAM, requestId);
    return `/inventory/articles/new?${query.toString()}`;
};

const supported = (): boolean => typeof BroadcastChannel !== 'undefined';

/**
 * Mesaj gönderilir ve kanal hemen kapanır: teslimat postMessage anında
 * kuyruğa girer, sekme o sırada kapanıyor olsa bile (pagehide) ulaşır.
 */
export const postArticleCreateMessage = (message: ArticleCreateMessage): void => {
    if (!supported()) return;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.postMessage(message);
    channel.close();
};

export const subscribeArticleCreate = (onMessage: (message: ArticleCreateMessage) => void): (() => void) => {
    if (!supported()) return () => undefined;
    const channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = (event: MessageEvent) => {
        const data = event.data as Partial<ArticleCreateMessage> | null;
        if (!data || typeof data.requestId !== 'string') return;
        if (data.type === 'created' || data.type === 'cancelled') onMessage(data as ArticleCreateMessage);
    };
    return () => channel.close();
};
