import { useTranslation } from 'react-i18next';

import { SwiftGauge } from '../charts/swiftChart';

interface BillingProgressChartProps {
    percent: number;
    size?: number;
    color?: string;
}

/* Compact gauge showing the billed percentage (0–100) — an Activity-style
   ring with round caps from the Swift chart kit (10.09.2026; recharts is no
   longer used for it). */
export const BillingProgressChart: React.FC<BillingProgressChartProps> = ({
    percent,
    size = 96,
    color = '#0a7aff',
}) => {
    const { t } = useTranslation();
    const value = Math.max(0, Math.min(100, Math.round(percent)));

    return (
        <SwiftGauge percent={value} size={size} thickness={Math.max(8, Math.round(size / 10))} color={color} label={`${value} %`}>
            <span className="ofi-swc-hole__big" style={{ fontSize: Math.round(size / 5.5) }}>{value} %</span>
            <span className="ofi-swc-hole__label">{t('billing.progressLabel')}</span>
        </SwiftGauge>
    );
};
