const fs = require('fs');
const path = require('path');

const dir = 'c:/ERP/ErpFront/offitec-frontend/src/pages/project';
const localeDir = 'c:/ERP/ErpFront/offitec-frontend/src/i18n/locales';

// Known CSS mappings to fix bad auto translations
const cssFixes = {
    "t('auto.border_red_200_bg_red_50')": "'border-red-200 bg-red-50'",
    "t('auto.border_amber_200_bg_amber_50')": "'border-amber-200 bg-amber-50'",
    "t('auto.border_amber_200_bg_amber_50_55')": "'border-amber-200 bg-amber-50 text-amber-700'",
    "t('auto.border_emerald_200_bg_emerald_50_55')": "'border-emerald-200 bg-emerald-50 text-emerald-700'",
    "t('auto.border_violet_200_bg_violet_50_50')": "'border-violet-200 bg-violet-50 text-violet-700'",
    "t('auto.border_yellow_200_bg_yellow_50_70')": "'border-yellow-200 bg-yellow-50 text-yellow-700'",
    "t('auto.bg_white_text_slate_950_shadow_xs')": "'bg-white text-slate-950 shadow-xs'",
    "t('auto.text_slate_600_hover_text_slate_950')": "'text-slate-600 hover:text-slate-950'",
    "t('auto.text_brand_700_after_absolute_after_inset_x_0_af')": "'text-brand-700 after:absolute after:inset-x-0 after:-bottom-px after:border-b-2 after:border-brand-600'",
    "t('auto.rounded_md_border_border_slate_200')": "'rounded-md border border-slate-200'",
    "t('auto.rounded_full_bg_yellow_100_px_3_py_0_5_text_slat')": "'rounded-full bg-yellow-100 px-3 py-0.5 text-slate-800'",
    "t('auto.border_slate_200_bg_slate_50_text_slate_700')": "'border-slate-200 bg-slate-50 text-slate-700'",
    "t('auto.border_slate_200_bg_white_80')": "'border-slate-200 bg-white'",
    "t('auto.border_1f2654_bg_eef4ff_text_1f2654_font_semibol')": "'border-[#1f2654] bg-[#eef4ff] text-[#1f2654] font-semibold'",
    "t('auto.border_1f2654_bg_eef4ff_text_1f2654_shadow_xs')": "'border-[#1f2654] bg-[#eef4ff] text-[#1f2654] shadow-xs'",
    "t('auto.border_transparent_text_slate_500_hover_border_s')": "'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'",
    "t('auto.border_transparent_text_slate_600_hover_border_s')": "'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-700'",
    "t('auto.ring_2_ring_slate_300_ring_offset_1')": "'ring-2 ring-slate-300 ring-offset-1'",
    "t('auto.xl_grid_cols_minmax_0_1_2fr_420px')": "'xl:grid-cols-[minmax(0,1.2fr)_420px]'"
};

// Also we have some manual hardcoded elements in TSX that the user pointed out:
// "Customers", "Start", "End", "Material *", "Quantity", "Description", "Date", "Work performed *"
// I'll handle hardcoded strings manually with multi_replace later if needed.

// We will map all non-css auto keys to `projects.*` and collect them.
const files = ['ProjectDetail.tsx', 'ProjectInstallation.tsx', 'Projects.tsx'];
let collectedKeys = new Set();

files.forEach(file => {
    let fullPath = path.join(dir, file);
    if (!fs.existsSync(fullPath)) return;
    let content = fs.readFileSync(fullPath, 'utf8');

    // 1. Fix CSS
    for (const [bad, good] of Object.entries(cssFixes)) {
        content = content.split(bad).join(good);
    }

    // 2. Replace t('auto.xxx') with t('projects.xxx')
    content = content.replace(/t\('auto\.([^']+)'\)/g, (match, key) => {
        if (!cssFixes[match]) {
            collectedKeys.add(key);
            return `t('projects.${key}')`;
        }
        return match; // should be already replaced, but just in case
    });

    fs.writeFileSync(fullPath, content, 'utf8');
});

// Now we need to update locales
console.log(JSON.stringify(Array.from(collectedKeys), null, 2));
