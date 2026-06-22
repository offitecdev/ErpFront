const i18next = require('i18next');
const tr = require('./src/i18n/locales/tr.json');
const en = require('./src/i18n/locales/en.json');

i18next.init({
    resources: {
        tr: { translation: tr },
        en: { translation: en }
    },
    lng: 'en',
    fallbackLng: 'tr'
}).then(() => {
    console.log("EN projects.genel_bakis:", i18next.t('projects.genel_bakis'));
    console.log("TR projects.genel_bakis:", i18next.t('projects.genel_bakis', { lng: 'tr' }));
    console.log("TR nav.quickActionsGroup.customers:", i18next.t('nav.quickActionsGroup.customers', { lng: 'tr' }));
});
