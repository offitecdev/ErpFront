import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { SIGNATURE_IMAGE_TYPES, SIGNATURE_IMAGE_MAX_BYTES, signatureFileToDataUrl } from './signatureImage';
import { inlineStyleBlocks, repairInvisibleText } from './signaturePaste';

/**
 * E-posta imzası editörü — Outlook/Word'den kopyalanan imzayı biçimi ve
 * görselleriyle birlikte, DÜZENLENEBİLİR olarak kabul eden contentEditable
 * alan. Yapıştırılan HTML burada hafifçe temizlenir (script/stil blokları,
 * olay öznitelikleri, Word yorumları); asıl beyaz-liste temizliği kayıt
 * sırasında sunucuda yapılır.
 *
 * Görseller: panodaki HTML `file://` ya da `cid:` kaynaklı <img> içeriyorsa
 * (Outlook masaüstü böyle kopyalar), panoya birlikte gelen görsel dosyaları
 * sırayla bu etiketlerin yerine data URI olarak yerleştirilir. Tek başına
 * kopyalanan bir görsel de imlecin olduğu yere data URI olarak eklenir.
 */

/** Tip + boyut denetiminden geçen pano/dosya görsellerini data URI'ye çevirir. */
const collectImageFiles = async (files: File[]): Promise<string[]> => {
    const urls: string[] = [];
    for (const file of files) {
        if (!SIGNATURE_IMAGE_TYPES.includes(file.type)) {
            toast.error(t('settings.mail.signatureImageInvalid'));
            continue;
        }
        if (file.size > SIGNATURE_IMAGE_MAX_BYTES) {
            toast.error(t('settings.mail.signatureImageTooLarge'));
            continue;
        }
        urls.push(await signatureFileToDataUrl(file));
    }
    return urls;
};

const sanitizePastedHtml = async (html: string, imageFiles: File[]): Promise<string> => {
    const doc = new DOMParser().parseFromString(html, 'text/html');

    // Renkler <style> bloğunda/sınıflarda tanımlıysa blok atılmadan ÖNCE satır
    // içine taşınır: mail istemcilerinde stil sayfası yoktur, imza yalnızca
    // satır içi style ile boyanabilir.
    inlineStyleBlocks(doc);

    doc.querySelectorAll('script,style,link,meta,title,object,embed,iframe,form,input,button,textarea,select').forEach((el) => el.remove());

    // Word/Outlook koşullu yorumları dahil tüm yorum düğümleri.
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_COMMENT);
    const comments: Node[] = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) comments.push(node);
    comments.forEach((node) => node.parentNode?.removeChild(node));

    // Olay öznitelikleri ve javascript: kaynakları.
    doc.body.querySelectorAll('*').forEach((el) => {
        for (const attr of Array.from(el.attributes)) {
            if (/^on/i.test(attr.name)) el.removeAttribute(attr.name);
            else if ((attr.name === 'href' || attr.name === 'src') && /^\s*javascript:/i.test(attr.value)) el.removeAttribute(attr.name);
        }
    });

    // Tarayıcının çözemeyeceği görsel kaynakları (file://, cid:) panoyla gelen
    // dosyalarla sıralı eşleştirilir; dosya kalmazsa etiket atılır.
    const dataUrls = await collectImageFiles(imageFiles);
    let nextFile = 0;
    doc.body.querySelectorAll('img').forEach((img) => {
        const src = img.getAttribute('src') || '';
        if (/^data:image\/(png|jpeg|gif);base64,/i.test(src) || /^https?:\/\//i.test(src)) return;
        const replacement = dataUrls[nextFile];
        if (replacement) {
            img.setAttribute('src', replacement);
            nextFile += 1;
        } else {
            img.remove();
        }
    });

    // Koyu temalı bir istemciden kopyalanmış beyaz metinler beyaz kâğıt
    // üzerinde görünmez kalmasın.
    repairInvisibleText(doc);

    return doc.body.innerHTML;
};

/**
 * Uygulamanın genel tablo kabuğu (`main table:not([data-unstyled-table])`)
 * imzanın kendi hücre dolgusunu, yazı boyutunu ve `bgcolor` koyu zeminlerini
 * eziyor; imza ekranda mailde göründüğünden bambaşka çıkıyordu. İşaret
 * yalnızca canlı DOM'a konur — kaydedilen HTML'e sızmaması için `emit`
 * sırasında geri sökülür.
 */
const UNSTYLED_TABLE_ATTR = 'data-unstyled-table';
const isolateTables = (root: HTMLElement | null) =>
    root?.querySelectorAll('table').forEach((table) => table.setAttribute(UNSTYLED_TABLE_ATTR, ''));

type SignatureEditorProps = {
    value: string;
    onChange: (html: string) => void;
    minHeight?: number;
};

export const SignatureEditor = ({ value, onChange, minHeight = 140 }: SignatureEditorProps) => {
    const ref = useRef<HTMLDivElement>(null);
    // Kendi yaydığımız değer geri geldiğinde DOM'u (ve imleci) sıfırlamamak için.
    const lastEmitted = useRef<string | null>(null);

    useEffect(() => {
        if (!ref.current) return;
        if (value === lastEmitted.current) return;
        ref.current.innerHTML = value;
        isolateTables(ref.current);
        lastEmitted.current = value;
    }, [value]);

    const emit = () => {
        const html = (ref.current?.innerHTML ?? '').replaceAll(` ${UNSTYLED_TABLE_ATTR}=""`, '');
        lastEmitted.current = html;
        onChange(html);
    };

    const insertHtmlAtCaret = (html: string) => {
        ref.current?.focus();
        document.execCommand('insertHTML', false, html);
        isolateTables(ref.current);
        emit();
    };

    const handlePaste = async (event: React.ClipboardEvent<HTMLDivElement>) => {
        const clipboard = event.clipboardData;
        if (!clipboard) return;
        // Karttaki genel yapıştırma dinleyicisi bu olayı bir daha işlememeli.
        event.stopPropagation();

        const html = clipboard.getData('text/html');
        const files = Array.from(clipboard.items)
            .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
            .map((item) => item.getAsFile())
            .filter((file): file is File => Boolean(file));

        // Ne HTML ne görsel var → düz metin yapıştırmayı tarayıcıya bırak.
        if (!html && files.length === 0) return;
        event.preventDefault();

        if (html) {
            insertHtmlAtCaret(await sanitizePastedHtml(html, files));
            return;
        }
        const dataUrls = await collectImageFiles(files);
        if (dataUrls.length) {
            insertHtmlAtCaret(dataUrls.map((url) => `<img src="${url}" style="max-width:420px;height:auto" />`).join(''));
        }
    };

    return (
        <div
            ref={ref}
            contentEditable
            role="textbox"
            aria-multiline="true"
            aria-label={t('settings.mail.signatureTextLabel')}
            onInput={emit}
            onBlur={emit}
            onPaste={(event) => { void handlePaste(event); }}
            style={{ minHeight }}
            className="ofi-mail-signature w-full overflow-auto rounded-lg border border-slate-200 bg-white px-3 py-2 text-[13px] leading-relaxed transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-700/10 [&_img]:inline-block [&_img]:max-w-full"
        />
    );
};
