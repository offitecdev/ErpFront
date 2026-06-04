import type React from 'react';
import { cx } from '../../lib/utils/cx';

function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
    return <div data-slot="skeleton" className={cx('animate-pulse rounded-md bg-secondary', className)} {...props} />;
}

export { Skeleton };
