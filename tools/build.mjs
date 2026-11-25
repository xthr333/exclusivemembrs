import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, 'dist');
execFileSync(process.execPath, [resolve(root, 'tools/sync-layout.mjs'), '--check'], {stdio:'inherit'});
await mkdir(out, {recursive:true});
// The core layout travels in the HTML, in the same cascade position as the
// source link. A stale or filtered secondary CSS request can't undo the layout.
const layout = await readFile(resolve(root, 'rollout.css'), 'utf8');
if (/<\/style\b/i.test(layout) || /(?:url\s*\(|@import\b)/i.test(layout)) {
  throw new Error('Review inline layout safety and relative asset paths before deploying.');
}
for (const file of await readdir(root)) {
  if (file.endsWith('.html')) {
    const html = await readFile(resolve(root, file), 'utf8');
    let matches = 0;
    const built = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/?rollout\.css(?:\?[^"]*)?"[^>]*>/gi, () => {
      matches++;
      return '<style data-exm-layout>\n' + layout + '\n</style>';
    });
    if (matches !== 1) throw new Error(file + ': expected exactly one core layout stylesheet');
    await writeFile(resolve(out, file), built);
  } else if (/\.(css|js)$/.test(file) || ['updates.json','songwars-public.json','exm-main-logo.png','robots.txt','sitemap.xml','_headers'].includes(file)) {
    await cp(resolve(root,file),resolve(out,file));
  }
}
await cp(resolve(root,'assets'),resolve(out,'assets'),{recursive:true});
console.log('EXM static build ready in dist/');
