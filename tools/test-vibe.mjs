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
const profiles=['ybdd','1ilriskk','luciifrmla','mayo','youngcj2x','03wayne','ydm-ski','bitchyounotayop','1chrxllo','vantiva'];
const directory=fs.readFileSync(path.join(root,'artists.html'),'utf8');
assert.equal((directory.match(/class="membr-row /g)||[]).length,10);
for(const slug of profiles){
 const profile=fs.readFileSync(path.join(root,`${slug}.html`),'utf8');
 assert.ok(directory.includes(`href="${slug}.html"`));
 assert.ok(profile.includes(`https://exclusivemembrs.com/${slug}`));
 assert.ok(profile.includes('data-copy-profile'));
 assert.ok(profile.includes('class="profile-link"'));
 assert.ok(!profile.includes('stkn=')&&!profile.includes('?si='));
}
const eventPage=fs.readFileSync(path.join(root,'events.html'),'utf8');
for(const round of ['opening','wildcards','quarters','semis','final']) assert.ok(eventPage.includes(`id="round-${round}"`));
assert.equal((eventPage.match(/class="round-slot"/g)||[]).length,6);
assert.ok(eventPage.includes('Quarterfinal pairings have not been announced'));
const w3=fs.readFileSync(path.join(root,'studios.html'),'utf8');
assert.ok(w3.includes('https://photogw3.merlin.site/'));
assert.ok(!w3.includes('w3-studios.square.site'));
const photoSources=JSON.parse(fs.readFileSync(path.join(root,'assets/w3/sources.json'),'utf8'));
assert.equal(photoSources.photos.length,8);
for(const photo of photoSources.photos){
 assert.ok(w3.includes(photo.file));
 assert.ok(photo.source.startsWith('https://d2kt395i2p6b75.cloudfront.net/01M1F1D4A908PXNV9QJ99KTWMC/'));
 assert.ok(fs.statSync(path.join(root,photo.file)).size>1000);
}
const home=fs.readFileSync(path.join(root,'index.html'),'utf8');
assert.ok(!home.includes('world-panel residency-panel'));
assert.ok(home.includes('quiet-residency'));
console.log('PASS: 10 shareable artist hubs; five-stage no-bye bracket; 8 real W3 portfolio photos with provenance; Merlin portfolio destination; low-key Residency.');
const orderHelp=fs.readFileSync(path.join(root,'order-help.html'),'utf8');
assert.ok(orderHelp.includes('30 calendar days of delivery'));
assert.ok(orderHelp.includes('wrong size or color'));
assert.ok(orderHelp.includes('contact.html#contact-form'));
assert.ok(orderHelp.includes('https://printify.com/contacts/'));
assert.ok(orderHelp.includes('delivery estimates are not guarantees'));
assert.ok(!orderHelp.includes('support@'));
assert.equal((orderHelp.match(/<details /g)||[]).length,3);
for(const f of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
 const content=fs.readFileSync(path.join(root,f),'utf8');
 if(content.includes('<footer>'))assert.ok(content.split('<footer>')[1].includes('order-help.html'),`${f}: visible order help`);
}
console.log('PASS: buyer help, verified policy/support links, accessible FAQs, and sitewide footer access.');
