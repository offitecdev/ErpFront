import type React from 'react';
import AntSkeleton from 'antd/es/skeleton';
import { AntdTheme } from './AntdTheme';
import { cx } from '../../lib/utils/cx';

function Skeleton({ className, style, ...props }: React.ComponentProps<'div'>) {
    return (
        <AntdTheme>
        <AntSkeleton.Node
            active
            {...(props as any)}
            data-slot="skeleton"
            className={cx('rounded-md bg-secondary', className)}
            style={style}
        />
        </AntdTheme>
    );
}

export { Skeleton };
