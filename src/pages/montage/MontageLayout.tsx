import { Outlet } from 'react-router-dom';

/**
 * Montage shell INSIDE the panel: the app header comes from MainLayout (which
 * also hides the sidebar on /montage paths), so this wrapper only constrains
 * the content width. The former standalone technician header/bottom bar are
 * intentionally gone.
 */
export const MontageLayout = () => (
    <div className="mx-auto w-full max-w-[1480px]">
        <Outlet />
    </div>
);
