import { cp, mkdir, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
await mkdir(out, {recursive:true});
for (const file of await readdir(root)) {
  if (/\.(html|css|js)$/.test(file) || ['updates.json','songwars-public.json','exm-main-logo.png','robots.txt','sitemap.xml','_headers'].includes(file)) {
    await cp(resolve(root,file),resolve(out,file));
  }
}
await cp(resolve(root,'assets'),resolve(out,'assets'),{recursive:true});
console.log('EXM static build ready in dist/');
