import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const worker=JSON.parse(fs.readFileSync(path.join(root,'wrangler.jsonc'),'utf8'));
assert.equal(worker.name,'exm');
assert.deepEqual(worker.routes.map(r=>r.pattern).sort(),['exclusivemembrs.com','www.exclusivemembrs.com']);
assert.ok(worker.routes.every(r=>r.custom_domain===true));
const source=fs.readFileSync(path.join(root,'script.js'),'utf8');
const context={window:{EXM_CONFIG:{}},document:{querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}},matchMedia:()=>({matches:true}),location:{pathname:'/'},console};
vm.createContext(context);
vm.runInContext(source.replace('window.loadEXMUpdates=','window.__test={safeUrl,mergeUpdates};window.loadEXMUpdates='),context);
const {safeUrl,mergeUpdates}=context.window.__test;
assert.equal(safeUrl('javascript:alert(1)'),'');
assert.equal(safeUrl('data:text/html,test'),'');
assert.equal(safeUrl('https://example.com/music'),'https://example.com/music');
assert.equal(safeUrl('shop.html#collection'),'shop.html#collection');
const merged=mergeUpdates([
 {id:'old1',headline:'SIGN UP FOR RESIDENCY EARLY ACCESS',description:'Register now'},
 {id:'old2',headline:'Residency preview',description:'Applications and payments remain closed.'},
 {id:'old3',headline:'OFFICIAL JUDGE PANEL CONFIRMED.'},
 {id:'fresh',headline:'New music',created_at:'2026-11-07',description:'An actual owner update'},
 {id:'duplicate',headline:'New music',created_at:'2026-11-06'},
]);
assert.equal(merged.length,1);assert.equal(merged[0].id,'fresh');
const catalog=JSON.parse(fs.readFileSync(path.join(root,'assets/products/catalog.json'),'utf8'));
assert.equal(catalog.products.length,10);
assert.equal(catalog.products.reduce((n,p)=>n+p.photos.length,0),33);
const shop=fs.readFileSync(path.join(root,'shop.html'),'utf8');
assert.equal((shop.match(/data-gallery-title=/g)||[]).length,10);
assert.ok(!shop.includes('archive-tile'));
for(const p of catalog.products){
 assert.ok(shop.includes(p.storeUrl));
 for(const photo of p.photos){const bytes=fs.readFileSync(path.join(root,photo.file));assert.ok(bytes.length>32);assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');assert.ok(shop.includes(photo.file));assert.ok(photo.source.startsWith('https://images-api.printify.com/mockup/'));}
}
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
 const text=fs.readFileSync(path.join(root,f),'utf8');
 assert.ok(!text.includes('PHILADELPHIA ROOTS'),`${f}: unauthorized positioning`);
 assert.ok(!text.includes('APPLICATIONS AND PAYMENTS REMAIN CLOSED'),`${f}: stale launch status`);
}
// WCAG relative luminance for the core copy/background palette (not imagery).
const luminance=hex=>{const c=hex.match(/[\da-f]{2}/gi).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return c[0]*.2126+c[1]*.7152+c[2]*.0722;};
for(const [fg,bg] of [['c2c7d8','1a1d29'],['c1c6d8','08090d'],['c0c9e3','11131b'],['12151f','d4d9e6']]){assert.ok((luminance(fg)+.05)/(luminance(bg)+.05)>=4.5||(luminance(bg)+.05)/(luminance(fg)+.05)>=4.5);}
console.log('PASS: safe update links; retired notice filtering and deduplication; 10 real product galleries / 33 local images; no unauthorized Philadelphia positioning; core copy contrast >= 4.5:1.');
