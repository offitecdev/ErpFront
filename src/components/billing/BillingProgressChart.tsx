import { RadialBar, RadialBarChart, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import { useTranslation } from 'react-i18next';

interface BillingProgressChartProps {
    percent: number;
    size?: number;
    color?: string;
}

// Compact radial gauge showing billed percentage (0–100).
export const BillingProgressChart: React.FC<BillingProgressChartProps> = ({
    percent,
    size = 96,
    color = '#272f67',
}) => {
    const { t } = useTranslation();
    const value = Math.max(0, Math.min(100, Math.round(percent)));
    const data = [{ name: 'billed', value, fill: color }];

    return (
        <div className="relative" style={{ width: size, height: size }}>
            <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                    innerRadius="72%"
                    outerRadius="100%"
                    data={data}
                    startAngle={90}
                    endAngle={-270}
                >
                    <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
                    <RadialBar background={{ fill: '#eef2f7' }} dataKey="value" cornerRadius={8} />
                </RadialBarChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-base font-semibold leading-none text-primary">%{value}</span>
                <span className="mt-0.5 text-[10px] text-tertiary">{t('billing.progressLabel')}</span>
            </div>
        </div>
    );
};
