import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const components = await Promise.all(['navigation', 'footer'].map(async name => ({
  name,
  html: (await readFile(resolve(import.meta.dirname, 'templates', name + '.html'), 'utf8')).trim(),
})));
const check = process.argv.includes('--check');

for (const file of (await readdir(root)).filter(file => file.endsWith('.html'))) {
  const path = resolve(root, file);
  const original = await readFile(path, 'utf8');
  let page = original;
  for (const { name, html } of components) {
    const start = '<!-- exm:' + name + ' -->';
    const end = '<!-- /exm:' + name + ' -->';
    const range = new RegExp(start + '[\\s\\S]*?' + end, 'g');
    const matches = [...page.matchAll(range)];
    if (matches.length !== 1) throw new Error(file + ': expected one ' + name + ' component');
    page = page.replace(range, () => [start, html, end].join('\n'));
  }
  if (page === original) continue;
  if (check) throw new Error(file + ': shared markup is stale. Run npm run sync-layout.');
  await writeFile(path, page);
}
