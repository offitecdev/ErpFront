// İmza görselleri için ortak sınırlar ve dönüştürücü — hem imza editörü hem
// Mail Ayarları kartı kullanır (fast-refresh için bileşen dosyasından ayrı).

export const SIGNATURE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif'];
export const SIGNATURE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const signatureFileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
