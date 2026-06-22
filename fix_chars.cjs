const fs = require('fs');

function fixChars(filepath, language) {
    let content = fs.readFileSync(filepath, 'utf8');

    if (language === 'de') {
        content = content.replace(/Ausw\uFFFDhlen/g, "Auswählen");
        content = content.replace(/ausw\uFFFDhlen/g, "auswählen");
        content = content.replace(/ausw\uFFFDhlbar/g, "auswählbar");
        content = content.replace(/best\uFFFDtigt/g, "bestätigt");
        content = content.replace(/F\uFFFDr/g, "Für");
        content = content.replace(/f\uFFFDr/g, "für");
        content = content.replace(/Ǭ/g, "Ü");
        content = content.replace(/Ǭbergeordneten/g, "Übergeordneten");
    } else if (language === 'tr') {
        content = content.replace(/Se\uFFFD/g, "Seç");
        content = content.replace(/se\uFFFD/g, "seç");
        content = content.replace(/\uFFFDdendi/g, "Ödendi");
        content = content.replace(/\uFFFDr\uFFFDn/g, "Ürün");
        content = content.replace(/\uFFFDr\uFFFDn\uFFFD/g, "Ürünü");
        content = content.replace(/G\uFFFDncellendi/g, "Güncellendi");
        content = content.replace(/g\uFFFDncellendi/g, "güncellendi");
        content = content.replace(/\uFFFDptal/g, "İptal");
        content = content.replace(/Aktar\uFFFDm/g, "Aktarım");
        content = content.replace(/B\uFFFDl\uFFFDm/g, "Bölüm");
        content = content.replace(/G\uFFFDster/g, "Göster");
        content = content.replace(/T\uFFFDm/g, "Tüm");
        content = content.replace(/A\uFFFDr\uFFFDk/g, "Ağırlık");
        content = content.replace(/a\uFFFDr\uFFFDk/g, "ağırlık");
        content = content.replace(/Ba\uFFFDar\uFFFDl\uFFFD/g, "Başarılı");
        content = content.replace(/De\uFFFDil/g, "Değil");
        content = content.replace(/de\uFFFDil/g, "değil");
        content = content.replace(/De\uFFFDistir/g, "Değiştir");
        content = content.replace(/S\uFFFDl/g, "Sil");
        content = content.replace(/s\uFFFDl/g, "sil");
        content = content.replace(/Kald\uFFFDr/g, "Kaldır");
        content = content.replace(/kald\uFFFDr\uFFFDld\uFFFD/g, "kaldırıldı");
        content = content.replace(/Kald\uFFFDr\uFFFDls\uFFFDn/g, "Kaldırılsın");
        content = content.replace(/kald\uFFFDr\uFFFDls\uFFFDn/g, "kaldırılsın");
        content = content.replace(/M\uFFFD/g, "Mı");
        content = content.replace(/m\uFFFD/g, "mı");
        content = content.replace(/y\uFFFDnetimi/g, "yönetimi");
        content = content.replace(/Y\uFFFDnetimi/g, "Yönetimi");
        content = content.replace(/B\uFFFDr/g, "Bir");
        content = content.replace(/b\uFFFDr/g, "bir");
        content = content.replace(/T\uFFFDr/g, "Tür");
        content = content.replace(/t\uFFFDr/g, "tür");
        content = content.replace(/t\uFFFDr\uFFFDn\uFFFD/g, "türünü");
    }

    fs.writeFileSync(filepath, content, 'utf8');
}

fixChars('c:/ERP/ErpFront/offitec-frontend/src/i18n/locales/de.json', 'de');
fixChars('c:/ERP/ErpFront/offitec-frontend/src/i18n/locales/tr.json', 'tr');
