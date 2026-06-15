import type React from 'react';
import { Skeleton as AntSkeleton } from 'antd';
import { cx } from '../../lib/utils/cx';

function Skeleton({ className, style, ...props }: React.ComponentProps<'div'>) {
    return (
        <AntSkeleton.Node
            active
            {...(props as any)}
            data-slot="skeleton"
            className={cx('rounded-md bg-secondary', className)}
            style={style}
        />
    );
}

export { Skeleton };
