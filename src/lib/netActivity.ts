/**
 * How many API requests are in flight right now — counted by the axios
 * interceptors in lib/axios.ts. Kept in its own dependency-free module so the
 * scheduling helpers (utils/onIdle.ts) can read it without importing axios.
 */

let inFlight = 0;
let lastChange = 0;
const listeners = new Set<() => void>();

const notify = () => {
    lastChange = performance.now();
    listeners.forEach((listener) => listener());
};

export const netActivity = {
    begin: () => { inFlight += 1; notify(); },
    end: () => { inFlight = Math.max(0, inFlight - 1); notify(); },
    inFlight: () => inFlight,
    /** performance.now() of the last start or finish. */
    lastChange: () => lastChange,
    subscribe: (listener: () => void) => {
        listeners.add(listener);
        return () => { listeners.delete(listener); };
    },
};
