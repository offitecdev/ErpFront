import { create } from 'zustand';

type ThemeMode = 'light' | 'dark';

const STORAGE_KEY = 'theme';

const getInitialMode = (): ThemeMode => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'dark' || stored === 'light') return stored;
    // Fall back to the OS preference the first time around.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }
    return 'light';
};

/**
 * Applies the theme to the document root.
 *
 * The codebase ships two dark-mode token sets that must move together:
 *  - `.dark-mode`  -> the full Untitled-UI semantic token flip (theme.css)
 *  - `.dark`       -> the smaller variable set + Tailwind `dark:` variant (index.css)
 * Toggling only one leaves half the app in the wrong palette, so we apply both.
 */
export const applyTheme = (mode: ThemeMode) => {
    const root = document.documentElement;
    const isDark = mode === 'dark';
    root.classList.toggle('dark', isDark);
    root.classList.toggle('dark-mode', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
    localStorage.setItem(STORAGE_KEY, mode);
};

interface ThemeState {
    isDarkMode: boolean;
    setDarkMode: (value: boolean) => void;
    toggleTheme: () => void;
}

const initialMode = getInitialMode();
// Apply as early as the store module is first imported to minimise the flash.
applyTheme(initialMode);

export const useThemeStore = create<ThemeState>((set) => ({
    isDarkMode: initialMode === 'dark',
    setDarkMode: (value: boolean) => {
        applyTheme(value ? 'dark' : 'light');
        set({ isDarkMode: value });
    },
    toggleTheme: () =>
        set((state) => {
            const next = !state.isDarkMode;
            applyTheme(next ? 'dark' : 'light');
            return { isDarkMode: next };
        }),
}));
