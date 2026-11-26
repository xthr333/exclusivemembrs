import { readdir, readFile, writeFile } from 'node:fs/promises';
import './songwars-public.mjs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const templateNames = ['navigation', 'footer'];
const templates = new Map(await Promise.all(templateNames.map(async name => [
  name,
  (await readFile(resolve(import.meta.dirname, 'templates', name + '.html'), 'utf8')).trim(),
])));
function render(name, file) {
  const html = templates.get(name);
  if (file === '404.html') {
    // The Worker also serves this page for unknown nested URLs.
    return html.replace(/\b(href|src)="(?!#|\/|[a-z][a-z\d+.-]*:)/gi, '$1="/');
  }
  return html;
}

for (const file of (await readdir(root)).filter(file => file.endsWith('.html'))) {
  const path = resolve(root, file);
  const original = await readFile(path, 'utf8');
  let page = original;
  for (const name of templateNames) {
    const start = '<!-- exm:' + name + ' -->';
    const end = '<!-- /exm:' + name + ' -->';
    const range = new RegExp(start + '[\\s\\S]*?' + end, 'g');
    const matches = [...page.matchAll(range)];
    if (matches.length !== 1) throw new Error(file + ': expected one ' + name + ' component');
    const html = render(name, file);
    page = page.replace(range, () => [start, html, end].join('\n'));
  }
  if (page === original) continue;
  if (check) throw new Error(file + ': generated markup is stale. Run npm run sync-layout.');
  await writeFile(path, page);
}
