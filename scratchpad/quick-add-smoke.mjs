// Real React/Chromium flow, mocked API only. Does not access application data.
// Run: node scratchpad/quick-add-smoke.mjs
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { rolldown } from 'rolldown';

const component = path.resolve('src/pages/inventory/quick-add/QuickAddSheet.tsx').replaceAll('\\', '/');
const mock = `
import React from 'react';
export const t = key => key;
export const useBackDismiss = () => {};
export const useLanguageTick = () => {};
export const useCalViewport = () => ({phone:false});
export const useAuthStore = fn => fn({permissions:['inventory.articles.create','inventory.transfer']});
export const QuantityStepper = props => React.createElement('input', {id:props.id,value:props.value,disabled:props.disabled,onChange:e=>props.onChange(Number(e.target.value))});
export const articleCodesApi = {list:async()=>[{id:'cat',name:'Category',code:'CAT',schemes:[{id:'scheme',name:'Scheme',code:'MODEL',nextCode:'ERP-00001'}]}]};
const a = {id:'a',articleCode:'ERP-A',name:'Model A',modelNumber:'MODEL-A',unit:'pcs',totalQuantity:0};
const b = {id:'b',articleCode:'ERP-B',name:'Model B',modelNumber:'MODEL-B',unit:'pcs',totalQuantity:0};
window.fixture = {articles:[a,b], units:[], receipts:[], created:0, failNext:false, delay:0};
const f = window.fixture;
export const inventoryApi = {
 scanLookup:async code=>{
   await new Promise(r=>setTimeout(r,f.delay));
   const unit=f.units.find(u=>u.barcode===code);
   if(unit)return {found:true,article:f.articles.find(a=>a.id===unit.articleId),stockUnit:unit};
   const article=code==='known-a'?a:code==='known-b'?b:null;
   return article?{found:true,article}:{found:false};
 },
 searchItems:async()=>f.articles.map(a=>({...a,code:a.articleCode})),
 receiveQuickStockUnit:async input=>{
   await new Promise(r=>setTimeout(r,f.delay));
   if(f.failNext){f.failNext=false;throw {response:{data:{error:'TEST_RECEIPT_FAILED'}}};}
   if(f.units.some(u=>u.barcode===input.barcode))throw {response:{data:{code:'STOCK_UNIT_EXISTS'}}};
   let article=f.articles.find(a=>a.id===input.articleId);
   if(input.newArticle){article={id:'new-'+(++f.created),articleCode:'ERP-NEW',name:input.newArticle.name,modelNumber:input.newArticle.modelNumber,unit:'pcs',totalQuantity:0};f.articles.push(article);}
   if(!article)throw Error('Missing article');
   f.receipts.push(input);article.totalQuantity++;
   const unit={id:'unit-'+f.units.length,barcode:input.barcode,articleId:article.id};f.units.push(unit);
   return {article,stockUnit:unit,createdArticle:!!input.newArticle};
 },
 quickCreateArticles:async()=>{throw Error('Unexpected automatic article creation');},
 addArticleBarcode:async()=>{throw Error('Device barcode attached to ArticleBarcode');},
 bulkCreateMovements:async()=>{throw Error('Device receipt bypassed StockUnit');}
};
export const ArrowRight=()=>null,Camera01=ArrowRight,Check=ArrowRight,ChevronLeft=ArrowRight,ChevronRight=ArrowRight,Plus=ArrowRight,Scan=ArrowRight,Trash01=ArrowRight,X=ArrowRight,XClose=ArrowRight;
`;
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';import {QuickAddSheet} from '${component}';
Object.defineProperty(navigator,'mediaDevices',{value:undefined});
const root=createRoot(document.getElementById('root'));let key=0;
window.reset=()=>root.render(React.createElement(QuickAddSheet,{key:++key,open:true,onClose:()=>{}}));window.reset();`;
const bundle = await rolldown({
    input: 'virtual:fixture',
    plugins: [{ name: 'quick-add-fixture',
        resolveId(source) {
            if (source === 'virtual:fixture') return '\0fixture';
            if (source.startsWith('@/') || source.endsWith('/useLanguageTick') || source.endsWith('/QuantityStepper')) return '\0mock';
        },
        load(id) { if (id === '\0fixture') return entry; if (id === '\0mock') return mock; },
    }],
});
const { output } = await bundle.generate({ format: 'iife' });
await bundle.close();
const html = '<!doctype html><html><body><div id="root"></div><script>' + output.filter(x=>x.type==='chunk').map(x=>x.code).join('\n').replaceAll('</script>', '<\\/script>') + '</script></body></html>';
const server = http.createServer((req, res) => { res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html); });
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const address = `http://127.0.0.1:${server.address().port}/`;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new','--disable-gpu','--no-first-run','--disable-background-networking',
    '--remote-debugging-port=9352',`--user-data-dir=${path.resolve('../../tmp/quick-add-browser')}`,address,
], {windowsHide:true,stdio:'ignore'});
let socket;
try {
    let page;
    for(let i=0;i<80;i++) {
        await new Promise(r=>setTimeout(r,100));
        try{page=(await fetch('http://127.0.0.1:9352/json/list').then(r=>r.json())).find(p=>p.url===address);}catch{}
        if(page)break;
    }
    if(!page)throw Error('Chromium did not start');
    socket=new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
    let id=0;const pending=new Map();
    socket.onmessage=({data})=>{const m=JSON.parse(data);if(!m.id)return;const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result);};
    const evaluate=async expression=>{
        const r=await new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,returnByValue:true,awaitPromise:true}}));});
        if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;
    };
    for(let i=0;i<80&&!await evaluate('!!document.querySelector(".ofi-qe-row")');i++)await new Promise(r=>setTimeout(r,100));
    const results=await evaluate(`(async()=>{
        const results=[];
        const pause=ms=>new Promise(r=>setTimeout(r,ms));
        const assert=(ok,label)=>{if(!ok)throw Error(label);results.push(label);};
        const button=text=>[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===text||b.querySelector('.ofi-qe-row__name')?.textContent===text);
        const click=async text=>{const b=button(text);if(!b)throw Error('Missing button '+text);b.click();await pause(30);};
        const input=async(el,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));await pause(15);};
        const scan=async code=>{const el=document.querySelector('.ofi-qe__scanfield input');await input(el,code);el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await pause(40);};
        const start=async()=>{window.reset();await pause(40);document.querySelector('.ofi-qe-row').click();await pause(20);document.querySelector('.ofi-qe-row').click();await pause(20);await click('inv.quickEntry.sameModel');await click('inv.quickEntry.scanFirst');};
        await start();
        await scan('known-a');
        assert(fixture.receipts.length===1&&fixture.receipts[0].articleId==='a','first known barcode automatically receives and locks article');
        for(let i=1;i<50;i++)await scan('device-'+i);
        assert(fixture.units.length===50&&fixture.receipts.every(r=>r.articleId==='a')&&fixture.created===0,'50 scans stay on one article with no article creation');
        assert(!document.querySelector('#ofi-qe-name'),'later unknown devices do not reopen the selection form');
        await scan('device-1');
        assert(fixture.units.length===50&&document.body.textContent.includes('inv.quickEntry.deviceExists'),'duplicate scan shows warning without another receipt');
        await scan('known-b');
        assert(fixture.units.length===50&&document.body.textContent.includes('inv.quickEntry.modelMismatch'),'other model is rejected without changing the anchor');
        fixture.failNext=true;await scan('retry-device');
        assert(fixture.units.length===50&&document.body.textContent.includes('TEST_RECEIPT_FAILED'),'failed receipt is visible and does not count as stock');
        await scan('retry-device');
        assert(fixture.units.length===51&&fixture.receipts.at(-1).articleId==='a','failed barcode can be retried on the same article');
        await start();await scan('unknown-first');
        assert(fixture.units.length===51&&fixture.created===0&&!!document.querySelector('#ofi-qe-name'),'unknown first barcode requires explicit article choice');
        await input(document.querySelector('#ofi-qe-model'),'MODEL-A');await pause(350);
        const row=[...document.querySelectorAll('.ofi-qe-matches .ofi-qe-row')].find(el=>el.textContent.includes('Model A'));row.click();await pause(40);
        await scan('unknown-second');
        assert(fixture.units.length===53&&fixture.receipts.at(-1).articleId==='a','selected existing article receives first and subsequent unknown devices');
        await start();await scan('create-first');await input(document.querySelector('#ofi-qe-name'),'New model');await click('inv.quickEntry.save');
        await scan('create-second');
        assert(fixture.created===1&&fixture.receipts.at(-1).articleId==='new-1','explicit new article is created once and reused');
        await start();await scan('create-first');
        assert(document.body.textContent.includes('inv.quickEntry.deviceExists')&&fixture.created===1,'duplicate remains blocked after reopening the sheet');
        fixture.delay=80;
        const before=fixture.units.length;
        const scanField=document.querySelector('.ofi-qe__scanfield input');
        await input(scanField,'known-a');
        scanField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        scanField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        await pause(250);
        assert(fixture.units.length===before,'rapid repeated registered barcode does not book stock');
        await scan('race-first');await pause(100);
        await input(document.querySelector('#ofi-qe-model'),'MODEL-A');await pause(350);
        [...document.querySelectorAll('.ofi-qe-matches .ofi-qe-row')].find(el=>el.textContent.includes('Model A')).click();await pause(150);
        const beforeRace=fixture.units.length;
        await input(scanField,'race-next');
        scanField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        scanField.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));
        await pause(250);
        assert(fixture.units.length===beforeRace+1,'simultaneous scanner callbacks receive a new device only once');
        return results;
    })()`);
    console.log(results.map(x=>'PASS '+x).join('\n'));
} finally {
    socket?.close();chrome.kill();await new Promise(resolve=>server.close(resolve));
}
