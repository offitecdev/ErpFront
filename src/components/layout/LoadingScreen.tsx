import React from 'react';
import { Spin } from 'antd';


interface LoadingScreenProps {
    label?: string;
    fullscreen?: boolean;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
    label,
    fullscreen = true,
}) => {
    return (
        <div className={`${fullscreen ?"h-screen w-screen" :"h-full w-full min-h-[200px]"} flex items-center justify-center bg-white`}>
            <Spin tip={label} />
        </div>
    );
};
