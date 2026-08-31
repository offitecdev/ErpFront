const printable = (value: unknown) => {
    if (typeof value === 'string') return value;
    try {
        return JSON.stringify(value, null, 2);
    } catch {
        return String(value);
    }
};

/** Keep the browser's original camera exception visible. DOMException fields
 * are mostly non-enumerable, so collect the useful values explicitly. */
export const formatCameraError = (error: unknown): string => {
    if (error == null) return 'Unknown camera error';
    if (typeof error === 'string') return error;

    const value = error as {
        name?: unknown;
        message?: unknown;
        constraint?: unknown;
        code?: unknown;
        cause?: unknown;
        stack?: unknown;
    };
    const lines: string[] = [];
    if (value.name) lines.push(`name: ${String(value.name)}`);
    if (value.message) lines.push(`message: ${String(value.message)}`);
    if (value.constraint) lines.push(`constraint: ${String(value.constraint)}`);
    if (value.code != null) lines.push(`code: ${String(value.code)}`);
    if (value.cause != null) lines.push(`cause: ${printable(value.cause)}`);
    if (value.stack) lines.push(`stack:\n${String(value.stack)}`);
    if (!lines.length) lines.push(printable(error));
    return lines.join('\n');
};
