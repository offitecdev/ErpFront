import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

/**
 * AnalogClock — a real (non-digital) clock face with branding text on the dial.
 * Hands tick every second; the weekday / date is shown as a caption below.
 */
export const AnalogClock = ({ brand = 'OFFITEC' }: { brand?: string }) => {
    const { t } = useTranslation();
    const [now, setNow] = useState(() => dayjs());

    useEffect(() => {
        const id = window.setInterval(() => setNow(dayjs()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const seconds = now.second();
    const minutes = now.minute();
    const hours = now.hour() % 12;

    const secondAngle = seconds * 6; // 360 / 60
    const minuteAngle = minutes * 6 + seconds * 0.1;
    const hourAngle = hours * 30 + minutes * 0.5; // 360 / 12

    // 60 ticks — every 5th is a longer hour marker.
    const ticks = Array.from({ length: 60 }, (_, i) => i);

    return (
        <div className="flex flex-col items-center">
            <svg viewBox="0 0 200 200" className="h-44 w-44 drop-shadow-sm" role="img" aria-label={now.format('HH:mm')}>
                {/* Face */}
                <circle cx="100" cy="100" r="96" fill="#ffffff" stroke="#e2e8f0" strokeWidth="2" />
                <circle cx="100" cy="100" r="90" fill="none" stroke="#f1f5f9" strokeWidth="1" />

                {/* Ticks */}
                {ticks.map((i) => {
                    const angle = (i * 6 * Math.PI) / 180;
                    const isHour = i % 5 === 0;
                    const outer = 90;
                    const inner = isHour ? 80 : 85;
                    const x1 = 100 + outer * Math.sin(angle);
                    const y1 = 100 - outer * Math.cos(angle);
                    const x2 = 100 + inner * Math.sin(angle);
                    const y2 = 100 - inner * Math.cos(angle);
                    return (
                        <line
                            key={i}
                            x1={x1}
                            y1={y1}
                            x2={x2}
                            y2={y2}
                            stroke={isHour ? '#272f67' : '#cbd5e1'}
                            strokeWidth={isHour ? 2.5 : 1}
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Branding text on the dial */}
                <text
                    x="100"
                    y="68"
                    textAnchor="middle"
                    className="select-none"
                    fontSize="12"
                    fontWeight="700"
                    letterSpacing="2"
                    fill="#272f67"
                >
                    {brand}
                </text>
                <text
                    x="100"
                    y="140"
                    textAnchor="middle"
                    className="select-none"
                    fontSize="8"
                    fontWeight="600"
                    letterSpacing="1"
                    fill="#94a3b8"
                >
                    {t('home.clock.tagline', { defaultValue: 'HEATING · COOLING' })}
                </text>

                {/* Hour hand */}
                <line
                    x1="100"
                    y1="100"
                    x2="100"
                    y2="56"
                    stroke="#1e293b"
                    strokeWidth="5"
                    strokeLinecap="round"
                    transform={`rotate(${hourAngle} 100 100)`}
                />
                {/* Minute hand */}
                <line
                    x1="100"
                    y1="100"
                    x2="100"
                    y2="36"
                    stroke="#334155"
                    strokeWidth="3.5"
                    strokeLinecap="round"
                    transform={`rotate(${minuteAngle} 100 100)`}
                />
                {/* Second hand */}
                <line
                    x1="100"
                    y1="112"
                    x2="100"
                    y2="30"
                    stroke="#dc2626"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    transform={`rotate(${secondAngle} 100 100)`}
                />

                {/* Center cap */}
                <circle cx="100" cy="100" r="5" fill="#272f67" />
                <circle cx="100" cy="100" r="2" fill="#ffffff" />
            </svg>

            <p className="mt-3 text-[13px] font-semibold capitalize text-slate-700">
                {now.format('dddd')}
            </p>
            <p className="text-[12px] text-slate-400">
                {now.format('DD MMMM YYYY')}
            </p>
        </div>
    );
};

export default AnalogClock;
