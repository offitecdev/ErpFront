import type { ReactNode } from 'react';

type TabBtnProps = {
    active: boolean;
    onClick: () => void;
    icon: ReactNode;
    children: ReactNode;
};

export const TabBtn = ({ active, onClick, icon, children }: TabBtnProps) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-colors ${active ?"border-blue-700 text-blue-800" :"border-transparent text-slate-500 hover:text-slate-700"
            }`}
    >
        {icon}
        {children}
    </button>
);
