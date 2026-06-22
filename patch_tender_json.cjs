const fs = require('fs');
const path = require('path');

const trPath = 'c:/ERP/ErpFront/offitec-frontend/src/i18n/locales/tr.json';
const enPath = 'c:/ERP/ErpFront/offitec-frontend/src/i18n/locales/en.json';
const dePath = 'c:/ERP/ErpFront/offitec-frontend/src/i18n/locales/de.json';

const trData = JSON.parse(fs.readFileSync(trPath, 'utf8'));
const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const deData = JSON.parse(fs.readFileSync(dePath, 'utf8'));

const updates = {
    "teklifi_silinsin_mi": {
        "tr": "{{number}} teklifi silinsin mi?",
        "en": "Delete tender {{number}}?",
        "de": "Angebot {{number}} löschen?"
    },
    "urunu_tekliften_kaldirilsin_mi": {
        "tr": "\"{{name}}\" ürünü tekliften kaldırılsın mı?",
        "en": "Remove product \"{{name}}\" from the tender?",
        "de": "Produkt \"{{name}}\" aus dem Angebot entfernen?"
    },
    "silinsin_mi": {
        "tr": "{{label}} silinsin mi?",
        "en": "Delete {{label}}?",
        "de": "{{label}} löschen?"
    },
    "yeni_versiyon_olusturuldu": {
        "tr": "Yeni versiyon (v{{version}}) oluşturuldu.",
        "en": "New version (v{{version}}) created.",
        "de": "Neue Version (v{{version}}) erstellt."
    },
    "verisi_indirildi": {
        "tr": "{{format}} verisi indirildi.",
        "en": "{{format}} data downloaded.",
        "de": "{{format}}-Daten heruntergeladen."
    },
    "satir_silinemedi_geri_alindi": {
        "tr": "{{count}} satır silinemedi, geri alındı.",
        "en": "{{count}} rows could not be deleted, reverted.",
        "de": "{{count}} Zeilen konnten nicht gelöscht werden, zurückgesetzt."
    },
    "desteklenmiyor_pdf_png_veya_jpg_yukleyin": {
        "tr": "{{name}} desteklenmiyor. PDF, PNG veya JPG yükleyin.",
        "en": "{{name}} is not supported. Upload PDF, PNG or JPG.",
        "de": "{{name}} wird nicht unterstützt. Laden Sie PDF, PNG oder JPG hoch."
    },
    "crm_teklif_yeni": {
        "tr": "CRM \u2022 Teklif \u2022 Yeni",
        "en": "CRM \u2022 Tender \u2022 New",
        "de": "CRM \u2022 Angebot \u2022 Neu"
    },
    "crm_teklif_number": {
        "tr": "CRM \u2022 Teklif \u2022 {{number}}",
        "en": "CRM \u2022 Tender \u2022 {{number}}",
        "de": "CRM \u2022 Angebot \u2022 {{number}}"
    },
    "crm_teklif_yonetimi": {
        "tr": "CRM \u2022 Teklif Yönetimi",
        "en": "CRM \u2022 Tender Management",
        "de": "CRM \u2022 Angebotsverwaltung"
    },
    "crm_teklif_rapor": {
        "tr": "CRM \u2022 Teklif \u2022 {{number}} \u2022 Rapor",
        "en": "CRM \u2022 Tender \u2022 {{number}} \u2022 Report",
        "de": "CRM \u2022 Angebot \u2022 {{number}} \u2022 Bericht"
    },
    "tekliften_kaldirildi": {
        "tr": "{{subject}} tekliften kaldırıldı",
        "en": "{{subject}} removed from tender",
        "de": "{{subject}} aus Angebot entfernt"
    },
    "teklif_urunu_guncellendi": {
        "tr": "{{subject}} teklif ürünü güncellendi",
        "en": "{{subject}} tender product updated",
        "de": "{{subject}} Angebotsprodukt aktualisiert"
    },
    "bu_field_empty_when_empty_ya_da_0_girilirse_15_uze": {
        "tr": "Herhangi bir şey girilmezse saatlik ek çalışma ücreti 0 olarak hesaplanacak.",
        "en": "If nothing is entered, the hourly additional work fee will be calculated as 0.",
        "de": "Wenn nichts eingegeben wird, wird der zusätzliche stündliche Arbeitslohn mit 0 berechnet."
    }
};

for (const [key, map] of Object.entries(updates)) {
    trData.tenders[key] = map.tr;
    enData.tenders[key] = map.en;
    deData.tenders[key] = map.de;
}

fs.writeFileSync(trPath, JSON.stringify(trData, null, 4), 'utf8');
fs.writeFileSync(enPath, JSON.stringify(enData, null, 4), 'utf8');
fs.writeFileSync(dePath, JSON.stringify(deData, null, 4), 'utf8');

console.log('JSON translations updated.');
