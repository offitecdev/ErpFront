const port = Number(process.argv[2] || 9333);

const targets = await fetch(`http://localhost:${port}/json/list`).then((response) => response.json());
const pageUrlPart = process.argv[3] || 'localhost:5173';
const page = targets.find((target) => target.type === 'page' && target.url.includes(pageUrlPart));
if (!page) throw new Error('Offitec page target not found');

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
});

let nextId = 0;
const pending = new Map();
socket.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result);
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++nextId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression, awaitPromise = true) => {
    const result = await send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
        userGesture: true,
    });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (expression, timeout = 15000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
        const value = await evaluate(expression);
        if (value) return value;
        await sleep(50);
    }
    throw new Error(`Timed out: ${expression}`);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Performance.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Network.setBypassServiceWorker', { bypass: true });
await send('Emulation.setCPUThrottlingRate', { rate: 4 });
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

const instrumentation = String.raw`
(() => {
    const keep = (list, item, limit = 4000) => {
        if (list.length < limit) list.push(item);
    };
    globalThis.__perfProbe = { qsa: [], raf: [], mo: [], events: [], errors: [], startedAt: performance.now() };
    addEventListener('error', (event) => keep(globalThis.__perfProbe.errors, String(event.error?.stack || event.message)));
    addEventListener('unhandledrejection', (event) => keep(globalThis.__perfProbe.errors, String(event.reason?.stack || event.reason)));

    const nativeDocumentQsa = Document.prototype.querySelectorAll;
    Document.prototype.querySelectorAll = function(selector) {
        const started = performance.now();
        const value = nativeDocumentQsa.call(this, selector);
        const duration = performance.now() - started;
        keep(globalThis.__perfProbe.qsa, { scope: 'document', selector: String(selector), duration, count: value.length, at: started });
        return value;
    };

    const nativeElementQsa = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function(selector) {
        const started = performance.now();
        const value = nativeElementQsa.call(this, selector);
        const duration = performance.now() - started;
        if (duration >= 0.2) keep(globalThis.__perfProbe.qsa, { scope: this.tagName, selector: String(selector), duration, count: value.length, at: started });
        return value;
    };

    const NativeMutationObserver = globalThis.MutationObserver;
    let observerId = 0;
    globalThis.MutationObserver = class extends NativeMutationObserver {
        constructor(callback) {
            const id = ++observerId;
            const stack = new Error().stack;
            super((records, observer) => {
                const started = performance.now();
                try { return callback(records, observer); }
                finally {
                    keep(globalThis.__perfProbe.mo, { id, duration: performance.now() - started, records: records.length, at: started, stack });
                }
            });
        }
    };

    const nativeRaf = globalThis.requestAnimationFrame.bind(globalThis);
    globalThis.requestAnimationFrame = (callback) => {
        const stack = new Error().stack;
        return nativeRaf((timestamp) => {
            const started = performance.now();
            try { return callback(timestamp); }
            finally {
                const duration = performance.now() - started;
                if (duration >= 0.2) keep(globalThis.__perfProbe.raf, { duration, at: started, stack });
            }
        });
    };

    for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
        document.addEventListener(type, (event) => {
            keep(globalThis.__perfProbe.events, {
                type,
                at: performance.now(),
                target: event.target?.tagName + (event.target?.id ? '#' + event.target.id : ''),
            });
        }, true);
    }
})();`;

await send('Page.addScriptToEvaluateOnNewDocument', { source: instrumentation });
await send('Page.reload', { ignoreCache: true });
await waitFor(`document.readyState === 'complete'`);
await sleep(4500);

const bootstrap = String.raw`
(async () => {
    const auth = await import('/assets/authStore-DcY2dfw3.js');
    localStorage.setItem('offitec-updates-seen:perf-user', JSON.stringify(['update-2026-09-13']));
    auth.u.defaults.adapter = async (config) => Promise.reject({
        message: 'probe mock',
        config,
        response: { status: 403, data: {}, config, headers: {} },
    });
    auth.n.setState({
        user: {
            id: 'perf-user', email: 'perf@local.test', firstName: 'Perf', lastName: 'Probe',
            tenantId: 'perf-tenant', role: { name: 'Admin', isSystemAdmin: true },
            roleModuleKeysByTenant: {},
        },
        tenants: [{ id: 'perf-tenant', tenantName: 'Perf Tenant' }],
        selectedTenantId: 'perf-tenant',
        permissions: ['roles.manage', 'projects.view', 'inventory.view', 'crm.customers.view', 'tenders.view', 'billing.view', 'tasks.view'],
        pageAccess: {}, isSystemAdmin: true, isAuthenticated: true, isLoading: false,
    });
    await new Promise((resolve) => setTimeout(resolve, 700));
    history.pushState({}, '', '/settings/pdf');
    dispatchEvent(new PopStateEvent('popstate'));
    return true;
})()`;
await evaluate(bootstrap);
await waitFor(`location.pathname === '/settings/pdf'`);
await waitFor(`document.querySelectorAll('input').length > 0`, 15000).catch(() => false);
await sleep(500);
const bootState = await evaluate(`({
    path: location.pathname,
    text: document.body.innerText.slice(0, 500),
    main: !!document.querySelector('main'),
    inputs: document.querySelectorAll('input').length,
    errors: globalThis.__perfProbe?.errors || [],
})`);
if (!bootState.main || !bootState.inputs) throw new Error(`Probe shell did not render: ${JSON.stringify(bootState)}`);
await sleep(1200);

const metricNames = ['ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'TaskDuration', 'JSHeapUsedSize', 'Nodes', 'Documents'];
const readMetrics = async () => {
    const result = await send('Performance.getMetrics');
    return Object.fromEntries(result.metrics.filter((metric) => metricNames.includes(metric.name)).map((metric) => [metric.name, metric.value]));
};
const clearProbe = () => evaluate(`for (const key of ['qsa','raf','mo','events']) globalThis.__perfProbe[key].length = 0; true`);
const probeSnapshot = () => evaluate(`(() => {
    const p = globalThis.__perfProbe;
    const total = (items) => items.reduce((sum, item) => sum + item.duration, 0);
    const bySelector = Object.values(p.qsa.reduce((acc, item) => {
        const key = item.scope + ' ' + item.selector;
        const row = acc[key] ||= { key, calls: 0, duration: 0, max: 0, maxCount: 0 };
        row.calls += 1; row.duration += item.duration; row.max = Math.max(row.max, item.duration); row.maxCount = Math.max(row.maxCount, item.count);
        return acc;
    }, {})).sort((a, b) => b.duration - a.duration).slice(0, 12);
    return {
        url: location.pathname + location.search,
        domElements: document.getElementsByTagName('*').length,
        qsaCalls: p.qsa.length,
        qsaDuration: total(p.qsa),
        selectors: bySelector,
        rafCalls: p.raf.length,
        rafDuration: total(p.raf),
        rafMax: Math.max(0, ...p.raf.map((item) => item.duration)),
        mutationCallbacks: p.mo.length,
        mutationDuration: total(p.mo),
        events: p.events,
    };
})()`);

const diffMetrics = (before, after) => Object.fromEntries(metricNames.map((name) => [
    name,
    (after[name] ?? 0) - (before[name] ?? 0),
]));

const clickSelector = async (name, selector, expectedPath, resourceMarker = '') => {
    await clearProbe();
    await evaluate(`performance.clearResourceTimings(); true`);
    const before = await readMetrics();
    const rect = await evaluate(`(() => {
        const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => {
            const rect = candidate.getBoundingClientRect();
            return rect.width > 0 && rect.height > 0;
        });
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    })()`);
    if (!rect) throw new Error(`Element not found: ${selector}`);
    const started = performance.now();
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x, y: rect.y });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await waitFor(`location.pathname === ${JSON.stringify(expectedPath)}`);
    if (resourceMarker) {
        await waitFor(`performance.getEntriesByType('resource').some((entry) => entry.name.includes(${JSON.stringify(resourceMarker)}) && entry.responseEnd > 0)`, 20000);
    }
    await waitFor(`!document.querySelector('div[role="status"][aria-live="polite"]')`, 20000);
    await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const visualMs = performance.now() - started;
    await sleep(400);
    const after = await readMetrics();
    const resources = await evaluate(`(() => {
        const rows = performance.getEntriesByType('resource')
            .filter((entry) => /\\.(?:js|css)(?:$|\\?)/.test(entry.name));
        return {
            count: rows.length,
            transferBytes: rows.reduce((sum, row) => sum + row.transferSize, 0),
            maxDuration: Math.max(0, ...rows.map((row) => row.duration)),
            names: rows.map((row) => row.name.split('/').pop()),
        };
    })()`);
    return { name, visualMs, metrics: diffMetrics(before, after), resources, probe: await probeSnapshot() };
};

const stateClick = async (name, selector, visibleExpression) => {
    await clearProbe();
    const before = await readMetrics();
    const rect = await evaluate(`(() => { const el = [...document.querySelectorAll(${JSON.stringify(selector)})].find((candidate) => { const r = candidate.getBoundingClientRect(); return r.width > 0 && r.height > 0; }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    const started = performance.now();
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: rect.x, y: rect.y, button: 'left', clickCount: 1 });
    await waitFor(visibleExpression);
    await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    const visualMs = performance.now() - started;
    await sleep(250);
    const after = await readMetrics();
    return { name, visualMs, metrics: diffMetrics(before, after), probe: await probeSnapshot() };
};

const results = [];
results.push(await stateClick('profile-menu-open', 'header button:has(.ofi-nosize)', `!!document.querySelector('header button[role="switch"]')`));
await evaluate(`document.body.click(); true`);
await sleep(200);
results.push(await clickSelector('settings-to-home', 'aside a[href="/"]', '/'));
results.push(await clickSelector('home-to-pdf-settings', 'aside a[href="/settings/pdf"]', '/settings/pdf'));

await clearProbe();
const beforeBack = await readMetrics();
let started = performance.now();
await evaluate(`history.back(); true`);
await waitFor(`location.pathname === '/'`);
await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
let visualMs = performance.now() - started;
await sleep(400);
let after = await readMetrics();
results.push({ name: 'browser-back', visualMs, metrics: diffMetrics(beforeBack, after), probe: await probeSnapshot() });

await clearProbe();
const beforeForward = await readMetrics();
started = performance.now();
await evaluate(`history.forward(); true`);
await waitFor(`location.pathname === '/settings/pdf'`);
await evaluate(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
visualMs = performance.now() - started;
await sleep(400);
after = await readMetrics();
results.push({ name: 'browser-forward', visualMs, metrics: diffMetrics(beforeForward, after), probe: await probeSnapshot() });

results.push(await clickSelector('cold-pdf-to-inventory', 'aside a[href="/inventory/articles"]', '/inventory/articles', 'ProductsPage-'));
results.push(await clickSelector('cold-inventory-to-tasks', 'aside a[href="/tasks"]', '/tasks', 'TasksListPage-'));

console.log(JSON.stringify({ cpuThrottle: 4, results }, null, 2));
socket.close();
