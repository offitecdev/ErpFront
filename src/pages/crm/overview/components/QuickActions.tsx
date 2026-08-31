import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Building03,
    CalendarPlus01,
    Plus,
    ShoppingCart01,
    Briefcase01,
} from '@/components/icons/antIconCompat';
import { CLS_LIGHT_GLASS } from '../../../../lib/utils/surfaces';

interface QuickAction {
    id: string;
    labelKey: string;
    defaultLabel: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    onClick: () => void;
}

interface QuickActionsProps {
    /** Opens the local "new meeting / task" composer of the priority panel. */
    onNewTask: () => void;
}

/** One-tap shortcuts: + Customer, + Offer, + Task, + Order — quiet frosted
    cards with a single navy accent; no heavy fills, no drop shadows. */
export const QuickActions: React.FC<QuickActionsProps> = ({ onNewTask }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const actions: QuickAction[] = [
        {
            id: 'customer',
            labelKey: 'crmOverview.quick.newCustomer',
            defaultLabel: 'Yeni Müşteri',
            icon: Building03,
            onClick: () => navigate('/crm/customers?create=1'),
        },
        {
            id: 'offer',
            labelKey: 'crmOverview.quick.newOffer',
            defaultLabel: 'Yeni Teklif',
            icon: Briefcase01,
            onClick: () => navigate('/sales/quotes/new'),
        },
        {
            id: 'task',
            labelKey: 'crmOverview.quick.newTask',
            defaultLabel: 'Yeni Görev',
            icon: CalendarPlus01,
            onClick: onNewTask,
        },
        {
            id: 'order',
            labelKey: 'crmOverview.quick.newOrder',
            defaultLabel: 'Yeni Sipariş',
            icon: ShoppingCart01,
            onClick: () => navigate('/sales/orders'),
        },
    ];

    return (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {actions.map((action) => {
                const Icon = action.icon;
                return (
                    <button
                        key={action.id}
                        type="button"
                        onClick={action.onClick}
                        className={`${CLS_LIGHT_GLASS} flex items-center gap-2.5 rounded-2xl px-4 py-3 text-left text-[13.5px] font-semibold text-[#1A1A1A] transition-colors duration-150 hover:border-[#C9D0DF] hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-[#07145c]/25 dark:text-white dark:hover:bg-white/10`}
                    >
                        <span className="relative flex size-8 shrink-0 items-center justify-center rounded-xl bg-[#07145c]/8 text-[#07145c] dark:bg-[#e6cf9e]/12 dark:text-[#e6cf9e]">
                            <Icon size={16} />
                            <Plus
                                size={11}
                                className="absolute -right-1 -top-1 rounded-full bg-white p-px text-[#07145c] dark:bg-[#151616] dark:text-[#e6cf9e]"
                            />
                        </span>
                        <span className="truncate">{t(action.labelKey, { defaultValue: action.defaultLabel })}</span>
                    </button>
                );
            })}
        </div>
    );
};
