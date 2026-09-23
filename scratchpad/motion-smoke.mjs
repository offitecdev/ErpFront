import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import ts from 'typescript';

// Real Chromium regression checks for the delegated interaction system.
// No application API requests, external fixtures or additional dependencies.
const transpile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
}).outputText.replace(/^import .*;$/gm, '').replace(/^export /gm, '');
const code = transpile('src/lib/uiMotion.ts') + transpile('src/lib/buttonFeedback.ts');
const assets = 'dist/assets';
const css = fs.readdirSync(assets).filter(file => /^(index-|Login-|orderRowMode-).*\.css$/.test(file))
    .map(file => fs.readFileSync(path.join(assets, file), 'utf8')).join('\n')
    + fs.readFileSync('src/styles/motion.css', 'utf8');
const html = `<!doctype html><html><head><style>${css}</style><style>
#fixture {display:flex;flex-wrap:wrap;gap:20px;padding:40px} #fixture>* {flex-shrink:0}
#wide{width:800px;height:40px;cursor:pointer} #plain{width:80px;height:40px}
#nested {cursor:pointer} #nested input {cursor:text} #grip {cursor:ew-resize}
</style></head><body><main id="root"><div id="fixture">
<button id="normal">Action</button><button id="primary" class="ofi-btn-apple">Save</button>
<button id="small" class="ofi-poi-shutter">Icon</button><button id="dot" class="ofi-ord-dot">Dot</button>
<a id="link" href="#destination">Navigation</a><button id="tab" role="tab">Tab</button>
<button id="option" role="option">Option</button><button id="menu" role="menuitem">Menu</button>
<button id="switch" role="switch" aria-checked="false">Switch</button>
<input id="checkbox" type="checkbox"><input id="radio" type="radio">
<label id="checklabel"><span id="antcheck" class="ant-checkbox"><input id="antcheck-input" type="checkbox" style="opacity:0"><span class="ant-checkbox-inner"></span></span>Checkbox label</label>
<label id="radiolabel"><span id="antradio" class="ant-radio"><input id="antradio-input" type="radio" style="opacity:0"><span class="ant-radio-inner"></span></span>Radio label</label>
<div id="wide" onclick="window.rowClicks=(window.rowClicks||0)+1">Clickable row</div>
<div id="plain">Noninteractive card</div><input id="text"><textarea id="textarea"></textarea>
<div id="nested" onclick="void 0"><input id="nested-input"></div>
<div contenteditable="true" id="editable">Editable</div>
<button id="disabled" disabled>Disabled</button><fieldset disabled><button id="fieldset">Inherited disabled</button></fieldset>
<div aria-disabled="true"><button id="aria-disabled">Disabled ancestor</button></div>
<button id="close" aria-label="Kapat"><svg data-motion-dismiss><path d="M6 6 18 18"/></svg></button>
<button id="cross">×</button><button id="close-en" aria-label="Close dialog">Close</button>
<button id="drag" draggable="true">Drag</button><button id="grip">Resize</button>
<button id="optout" data-motion="off">Optout</button><button id="translated" style="transform:translateX(12px);scale:1.05">Transformed</button>
</div></main><div id="portal"><button id="portal-button">Portal action</button></div>
<script>${code}\ninstallButtonFeedback(); installButtonFeedback(); window.ready=true;</script></body></html>`;
const server = http.createServer((request, response) => {
    if (request.url !== '/') { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const address = `http://127.0.0.1:${server.address().port}/`;
const profile = path.resolve('../../tmp/liquid-motion-browser');
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--disable-background-networking', '--remote-debugging-port=9347', `--user-data-dir=${profile}`, address,
], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
    let page;
    for (let attempt = 0; attempt < 80; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 100));
        try { page = (await fetch('http://127.0.0.1:9347/json/list').then(r => r.json())).find(p => p.url === address); } catch {}
        if (page) break;
    }
    if (!page) throw Error('Chromium did not start');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let id = 0; const pending = new Map();
    socket.onmessage = ({ data }) => { const m = JSON.parse(data); if (!m.id) return; const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(Error(JSON.stringify(m.error))) : p.resolve(m.result); };
    const send = (method, params = {}) => new Promise((resolve, reject) => { pending.set(++id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
    const evaluate = async expression => {
        const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (r.exceptionDetails) throw Error(JSON.stringify(r.exceptionDetails)); return r.result.value;
    };
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    for (let attempt = 0; attempt < 80 && !await evaluate('window.ready'); attempt++) await new Promise(r => setTimeout(r, 100));
    const results = await evaluate(`(async () => {
        const results = [];
        const assert = (ok, label) => { if (!ok) throw Error(label); results.push(label); };
        const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
        const el = id => document.getElementById(id);
        const value = id => { const s=getComputedStyle(el(id)).scale; return s==='none'?1:parseFloat(s); };
        const pointer = (id, type, extra={}) => el(id).dispatchEvent(new PointerEvent(type, {bubbles:true, pointerId:1,isPrimary:true,pointerType:'mouse',button:0,clientX:100,clientY:100,...extra}));
        for(const id of ['normal','primary','small','dot','link','tab','option','menu','switch','checkbox','radio','wide','portal-button']) {
            pointer(id,'pointerdown'); await pause(125);
            assert(value(id)<1 && value(id)>=0.9799, id+' compresses within shared range');
            assert(el(id).getAnimations().length===1, id+' has one press animation');
            pointer(id,'pointerup'); await pause(285);
            assert(Math.abs(value(id)-1)<0.00001 && el(id).getAnimations().length===0,id+' releases and cleans up');
        }
        for(const id of ['plain','text','textarea','editable','nested-input','disabled','fieldset','aria-disabled','close','cross','close-en','drag','grip','optout']) {
            pointer(id,'pointerdown'); await pause(10);
            assert(el(id).getAnimations().length===0 && value(id)===1,id+' excluded'); pointer(id,'pointerup');
        }
        for(const [id,visual] of [['checklabel','antcheck'],['radiolabel','antradio'],['antcheck-input','antcheck']]) {
            pointer(id,'pointerdown'); await pause(110);
            assert(value(visual)<1 && value(id)===1,id+' animates only visible control');
            pointer(id,'pointerup'); await pause(270);
        }
        pointer('normal','pointerdown'); await pause(100); pointer('normal','pointermove',{clientX:125});
        assert(value('normal')===1,'drag threshold cancels immediately');
        pointer('normal','pointerdown'); await pause(100); pointer('normal','pointercancel');
        assert(value('normal')===1,'pointercancel resets');
        pointer('normal','pointerdown'); await pause(100); window.dispatchEvent(new Event('blur'));
        assert(value('normal')===1,'window blur resets');
        pointer('normal','pointerdown',{button:2}); assert(el('normal').getAnimations().length===0,'right click excluded');
        el('normal').focus(); el('normal').dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true})); await pause(110);
        assert(value('normal')<1,'keyboard press'); el('normal').dispatchEvent(new KeyboardEvent('keyup',{key:' ',bubbles:true})); await pause(270);
        assert(value('normal')===1,'keyboard release');
        const before=getComputedStyle(el('translated')).transform;
        pointer('translated','pointerdown'); await pause(110);
        assert(getComputedStyle(el('translated')).transform===before,'existing positioning transform preserved');
        pointer('translated','pointerup'); await pause(270);
        assert(Math.abs(value('translated')-1.05)<0.0001,'existing scale restored');
        el('checkbox').click(); assert(el('checkbox').checked,'checkbox action works');
        el('wide').click(); assert(window.rowClicks===1,'row callback fires once');
        return results;
    })()`);
    // Native mouse events exercise :active CSS and actual browser default actions.
    for (const target of ['normal', 'primary', 'small', 'dot']) {
        const before = await evaluate(`(() => { const b=document.getElementById('${target}'); b.scrollIntoView({block:'center'}); const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,width:b.offsetWidth,transform:getComputedStyle(b).transform}; })()`);
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: before.x, y: before.y });
        await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: before.x, y: before.y, button: 'left', clickCount: 1 });
        await new Promise(resolve => setTimeout(resolve, 115));
        const down = await evaluate(`(() => {const b=document.getElementById('${target}');return {scale:parseFloat(getComputedStyle(b).scale),width:b.offsetWidth,transform:getComputedStyle(b).transform};})()`);
        if (!(down.scale >= 0.9799 && down.scale < 1 && down.width === before.width && down.transform === before.transform)) throw Error('Native mouse/layout regression: '+target+JSON.stringify({before,down}));
        results.push(target+' native mouse press preserves layout and avoids double transforms');
        await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: before.x, y: before.y, button: 'left', clickCount: 1 });
        await new Promise(resolve => setTimeout(resolve, 275));
    }
    await evaluate(`document.getElementById('normal').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,isPrimary:true,button:0,pointerType:'mouse'}))`);
    await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await new Promise(resolve => setTimeout(resolve, 100));
    const reduced = await evaluate(`(() => {
        const b=document.getElementById('normal');
        if(b.getAnimations().length) throw Error('Preference change did not cancel active press');
        b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:1,isPrimary:true,button:0,pointerType:'mouse'}));
        if(b.getAnimations().length || !['none','1'].includes(getComputedStyle(b).scale)) throw Error('Reduced motion scaled');
        return ['live reduced-motion preference cancels active press','reduced-motion disables new press'];
    })()`);
    console.log(JSON.stringify({ passed: results.length + reduced.length, checks: [...results, ...reduced] }, null, 2));
    await send('Browser.close');
} finally {
    socket?.close(); chrome.kill(); server.close();
}
