const fs = require('fs');
const path = require('path');

const dir = 'c:/ERP/ErpFront/offitec-frontend/src/pages/project';

const reactivityCode = `import { t } from '@/i18n/translate';
import { useTranslation } from 'react-i18next';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick(t => t + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};`;

const patchFile = (filename, patchFn) => {
    const filepath = path.join(dir, filename);
    let content = fs.readFileSync(filepath, 'utf8');
    content = patchFn(content);
    fs.writeFileSync(filepath, content, 'utf8');
};

patchFile('ProjectDetail.tsx', (content) => {
    content = content.replace("import { t } from '@/i18n/translate';", reactivityCode);
    content = content.replace("export const ProjectDetail = () => {", "export const ProjectDetail = () => {\n    useLanguageRefresh();");
    content = content.replace("const tabs: Array<{ key: TabKey; label: string }> = [", "const getTabs = (): Array<{ key: TabKey; label: string }> => [");
    content = content.replace(/\{tabs\.map/g, "{getTabs().map");
    return content;
});

patchFile('ProjectInstallation.tsx', (content) => {
    content = content.replace("import { t } from '@/i18n/translate';", reactivityCode);
    content = content.replace("export const ProjectInstallation = () => {", "export const ProjectInstallation = () => {\n    useLanguageRefresh();");
    content = content.replace("const installationDetailTabs: Array<{ key: InstallationDetailTab; label: string }> = [", "const getInstallationDetailTabs = (): Array<{ key: InstallationDetailTab; label: string }> => [");
    content = content.replace(/\{installationDetailTabs\.map/g, "{getInstallationDetailTabs().map");
    return content;
});

patchFile('Projects.tsx', (content) => {
    content = content.replace("import { t } from '@/i18n/translate';", reactivityCode);
    content = content.replace("export const Projects = () => {", "export const Projects = () => {\n    useLanguageRefresh();");
    content = content.replace("const STATUS_LABEL: Record<ProjectStatus, string> = {", "const getStatusLabel = (): Record<ProjectStatus, string> => ({");
    content = content.replace(/CANCELLED:t\('common\.cancel'\),\n};/, "CANCELLED:t('common.cancel'),\n});");
    content = content.replace(/STATUS_LABEL\[/g, "getStatusLabel()[");
    content = content.replace(/Object\.entries\(STATUS_LABEL\)/g, "Object.entries(getStatusLabel())");
    return content;
});
