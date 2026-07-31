/** Default page size; completed appointments explicitly use five rows. */
export const MONTAGE_PAGE_SIZE = 10;

/** The current page's slice of a client-side list. */
export const pageSlice = <T,>(rows: T[], page: number): T[] => {
    const totalPages = Math.max(1, Math.ceil(rows.length / MONTAGE_PAGE_SIZE));
    const pageSafe = Math.min(Math.max(1, page), totalPages);
    return rows.slice((pageSafe - 1) * MONTAGE_PAGE_SIZE, pageSafe * MONTAGE_PAGE_SIZE);
};
