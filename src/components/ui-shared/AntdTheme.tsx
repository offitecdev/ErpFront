import { useMemo, type ReactNode } from 'react';
import ConfigProvider from 'antd/es/config-provider';
import antdTheme from 'antd/es/theme';

import { useThemeStore } from '../../store/themeStore';

/**
 * Das Ant-Design-Aussehen der App — dort, wo Ant Design tatsächlich vorkommt.
 *
 * Bis zum 12.09.2026 stand der `ConfigProvider` ganz oben in App.tsx und
 * umschloss die ganze Anwendung. Damit hing Ant Designs Stilmaschine
 * (`@ant-design/cssinjs`) am EINSTIEGSBÜNDEL: rund 95 KB, die jede Seite beim
 * Start herunterlud und auswertete — auch die Offerte, die keinen einzigen
 * Ant-Baustein zeigt. Auf der gedrosselten Messung lag das mitten im Fenster,
 * das Lighthouse für LCP und Total Blocking Time zählt.
 *
 * Der Anbieter sitzt jetzt in den wenigen gemeinsamen Bausteinen, die Ant
 * Design wirklich benutzen (ui-shared/Button, Card, Checkbox, EmptyState,
 * Field, Modal, BlockingDialog, Skeleton und die drei Seiten mit eigenen
 * Ant-Bausteinen). Die kommen ohnehin mit ihrem eigenen Ant-Teilbündel, der
 * Anbieter kostet dort also nichts zusätzlich — und die Seiten ohne Ant
 * Design laden ihn gar nicht mehr.
 *
 * Verschachtelte `ConfigProvider` sind bei Ant Design vorgesehen; mehrere
 * Bausteine nebeneinander teilen sich denselben Stil-Zwischenspeicher.
 * Portale (Modal, Drawer) erben den Kontext über den React-Baum, nicht über
 * das DOM — sie bekommen das Thema also weiterhin.
 */
export const AntdTheme = ({ children }: { children: ReactNode }) => {
    const isDarkMode = useThemeStore((state) => state.isDarkMode);

    // Das Themenobjekt ist die Eingabe von Ant Designs Stilmaschine: eine neue
    // Kennung bei jedem Rendern liesse sie die Token jedes Mal neu rechnen.
    const theme = useMemo(
        () => ({
            algorithm: isDarkMode ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
            token: {
                // Must match --font-body (theme.css) — a bare 'sans-serif'
                // here rendered every antd control in Arial.
                fontFamily: '"Inter Variable", -apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif',
                borderRadius: 10,
                borderRadiusXS: 10,
                borderRadiusSM: 10,
                borderRadiusLG: 10,
                borderRadiusOuter: 10,
                colorPrimary: isDarkMode ? '#e6cf9e' : '#0a7aff',
                colorError: '#d30f15',
                colorSuccess: '#079455',
                colorWarning: '#dc6803',
                ...(isDarkMode && {
                    colorInfo: '#e6cf9e',
                    colorLink: '#e6cf9e',
                    colorLinkHover: '#f0dcae',
                    colorPrimaryBg: 'rgba(230,207,158,0.14)',
                    colorPrimaryBgHover: 'rgba(230,207,158,0.20)',
                    colorPrimaryBorder: 'rgba(230,207,158,0.34)',
                    colorPrimaryHover: '#f0dcae',
                    colorPrimaryActive: '#d9bd83',
                    colorBgContainer: '#151616',
                    colorBgElevated: '#1b1c1c',
                    colorBgLayout: '#08090a',
                    colorBorder: 'rgba(255,255,255,0.10)',
                    colorBorderSecondary: 'rgba(255,255,255,0.07)',
                    colorText: '#e8e9ec',
                    colorTextSecondary: '#b0b3bb',
                    colorTextTertiary: '#888c96',
                    colorTextQuaternary: '#6b7280',
                }),
            },
        }),
        [isDarkMode],
    );

    return <ConfigProvider theme={theme}>{children}</ConfigProvider>;
};

export default AntdTheme;
