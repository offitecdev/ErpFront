import { tenderApi } from '@/lib/api/tender';

const CACHE_TTL_MS = 10 * 60 * 1000;
const imageCache = new Map<string, { imageUrl: string | null; expiresAt: number }>();
const requests = new Map<string, Promise<void>>();

const cacheKey = (tenderId: string, kind: 'article' | 'position', id: string) =>
    `${tenderId}:${kind}:${id}`;

const cachedValue = (key: string): string | null | undefined => {
    const hit = imageCache.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= Date.now()) {
        imageCache.delete(key);
        return undefined;
    }
    return hit.imageUrl;
};

/**
 * Resolves the images a tender PDF needs and returns the flattened positions
 * with `imageUrl` filled in.
 *
 * Images are never part of the tender detail payload (they are megabytes of
 * base64 data URIs), so they are fetched here — and ONLY here — in a single
 * request that names exactly the rows that need one:
 *
 *  - product rows carry a `sourceArticleId`; their image lives on the article
 *    and is shared by every offer using that product,
 *  - rows without a source article (manual products, description rows) may
 *    carry their own uploaded image, stored on the position itself.
 *
 * Rows with a source article are deliberately NOT asked for by position id:
 * when such a row has an own image it is a copy of the article's, so asking
 * for both would transfer the same blob twice.
 *
 * A failure here is not fatal — the PDF is then produced without images.
 */
export const attachPdfPositionImages = async (
    tenderId: string,
    flatPositions: any[],
    onProgress?: (fraction: number) => void,
): Promise<any[]> => {
    const articleIds = [...new Set(
        flatPositions.map((p) => p.sourceArticleId).filter(Boolean) as string[],
    )];
    const positionIds = flatPositions
        .filter((p) => !p.sourceArticleId && p.id)
        .map((p) => p.id as string);

    const missingArticleIds = articleIds.filter((id) =>
        cachedValue(cacheKey(tenderId, 'article', id)) === undefined);
    const missingPositionIds = positionIds.filter((id) =>
        cachedValue(cacheKey(tenderId, 'position', id)) === undefined);

    if (missingArticleIds.length > 0 || missingPositionIds.length > 0) {
        const requestKey = [
            tenderId,
            [...missingArticleIds].sort().join(','),
            [...missingPositionIds].sort().join(','),
        ].join('|');
        let request = requests.get(requestKey);
        if (!request) {
            request = (async () => {
                const images = await tenderApi.getProductImages(
                    tenderId,
                    missingArticleIds,
                    missingPositionIds,
                    onProgress,
                );
                const imageById = new Map(images.map((row) => [row.id, row.imageUrl || null]));
                const expiresAt = Date.now() + CACHE_TTL_MS;
                missingArticleIds.forEach((id) => {
                    imageCache.set(cacheKey(tenderId, 'article', id), {
                        imageUrl: imageById.get(id) || null,
                        expiresAt,
                    });
                });
                missingPositionIds.forEach((id) => {
                    imageCache.set(cacheKey(tenderId, 'position', id), {
                        imageUrl: imageById.get(id) || null,
                        expiresAt,
                    });
                });
            })().finally(() => {
                requests.delete(requestKey);
            });
            requests.set(requestKey, request);
        }
        try {
            await request;
            // When this call piggy-backed on the page's background pre-warm,
            // Axios progress belonged to that earlier caller.
            onProgress?.(1);
        } catch {
            /* fall back to an image-less PDF if the image fetch fails */
        }
    } else {
        onProgress?.(1);
    }

    return flatPositions.map((p) => ({
        ...p,
        // A just-edited local image is newer than the session cache.
        imageUrl: p.imageUrl
            || (p.sourceArticleId
            && cachedValue(cacheKey(tenderId, 'article', p.sourceArticleId)))
            || (p.id && cachedValue(cacheKey(tenderId, 'position', p.id)))
            || null,
    }));
};
