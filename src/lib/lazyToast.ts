type ToastMessage = string | number;
type ToastKind = 'success' | 'error' | 'info' | 'warning';

const show = (kind: ToastKind, message: ToastMessage): void => {
    void import('sonner').then(({ toast }) => {
        toast[kind](message);
    });
};

/** Keeps Sonner out of the initial route graph; it loads on the first toast. */
export const lazyToast = {
    success: (message: ToastMessage) => show('success', message),
    error: (message: ToastMessage) => show('error', message),
    info: (message: ToastMessage) => show('info', message),
    warning: (message: ToastMessage) => show('warning', message),
};
