import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const css=fs.readFileSync(path.join(root,'browser.css'),'utf8');
for(const feature of ['-webkit-text-size-adjust:100%','-webkit-background-clip:text','-webkit-text-fill-color:transparent','-webkit-backdrop-filter','safe-area-inset-top','safe-area-inset-bottom','100svh','100dvh','forced-colors:active'])assert.ok(css.includes(feature),feature);
assert.ok(!fs.readFileSync(path.join(root,'rollout.css'),'utf8').includes('fonts.googleapis.com'));
assert.ok(css.includes('.nav-links{flex-wrap:nowrap;'),'Short-screen menus must scroll vertically, not form hidden columns');
const fontCss=fs.readFileSync(path.join(root,'fonts.css'),'utf8');
const fontPaths=[...fontCss.matchAll(/url\('([^']+)'\)/g)].map(m=>m[1]);
assert.equal(fontPaths.length,7);
for(const file of fontPaths){const bytes=fs.readFileSync(path.join(root,file));assert.equal(bytes.toString('ascii',0,4),'wOF2');assert.ok(bytes.length>1000);}
for(const name of ['barlow-condensed','ibm-plex-mono'])assert.ok(fs.readFileSync(path.join(root,`assets/fonts/${name}-OFL.txt`),'utf8').includes('SIL OPEN FONT LICENSE'));
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.html'))){
 const html=fs.readFileSync(path.join(root,file),'utf8');
 assert.ok(html.includes('viewport-fit=cover'),file);
 assert.ok(!/user-scalable=no|maximum-scale=1/.test(html),`${file}: keep pinch zoom`);
 assert.ok(html.includes('fonts.css?v=20261108-browser'),file);
 assert.ok(html.includes('browser.css?v=20261109-signal'),file);
 assert.ok(html.indexOf('fonts.css')<html.indexOf('style.css'),file);
 assert.ok(html.lastIndexOf('browser.css')>html.lastIndexOf('rel="stylesheet"')-60,file);
}
const script=fs.readFileSync(path.join(root,'script.js'),'utf8');
const revealElement={classList:{add(name){assert.equal(name,'is-visible');this.visible=true;}}};
const noObserver={window:{EXM_CONFIG:{}},document:{querySelector:()=>null,querySelectorAll:selector=>selector==='.reveal'?[revealElement]:[],addEventListener:()=>{}},matchMedia:()=>({matches:false}),location:{pathname:'/'},console};
vm.runInNewContext(script,noObserver);
assert.ok(revealElement.classList.visible,'Reveal fallback works without IntersectionObserver');
const rollout=fs.readFileSync(path.join(root,'rollout.js'),'utf8');
assert.ok(!rollout.includes('AbortSignal.timeout('));
assert.ok(!fs.readFileSync(path.join(root,'editorial.js'),'utf8').includes("'instant'"));
for(const hasController of [true,false])for(const ok of [true,false]){
 let onSubmit,reset=0,cleared=false,request;
 const element=()=>({style:{},setAttribute(){},append(child){this.firstChild=child;},addEventListener(){},textContent:''});
 const button={disabled:false,textContent:'SEND MESSAGE'};
 const form={action:'https://example.invalid/local-test-only',reportValidity:()=>true,querySelector:()=>button,append(el){this.status=el;},addEventListener(name,callback){if(name==='submit')onSubmit=callback;},reset(){reset++;}};
 const context={document:{createElement:element,body:{append(){},classList:{contains:()=>false}},documentElement:{scrollHeight:1600},querySelector:()=>null,querySelectorAll:s=>s.startsWith('form[')?[form]:[]},sessionStorage:{getItem:()=> '1'},innerHeight:800,scrollY:0,addEventListener(){},requestAnimationFrame:fn=>fn(),matchMedia:()=>({matches:false}),FormData:class {},AbortController:hasController?AbortController:undefined,setTimeout:()=>1,clearTimeout(){cleared=true;},fetch:async(url,options)=>{request={url,options};return {ok};}};
 vm.runInNewContext(rollout,context);
 await onSubmit({preventDefault(){}});
 assert.equal(request.url,form.action);
 assert.equal(!!request.options.signal,hasController);
 assert.equal(button.disabled,false);
 assert.equal(button.textContent,'SEND MESSAGE');
 assert.equal(reset,ok?1:0);
 assert.ok(form.status.textContent.includes(ok?'was sent':'couldn’t confirm delivery'));
 assert.equal(cleared,hasController);
}
console.log('PASS: local licensed fonts; Safari/CSS feature fallbacks; safe areas and zoom; no-Observer reveal; contact success/error behavior with and without AbortController. Native Safari/Firefox/Edge rendering still requires device/browser testing.');
