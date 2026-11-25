import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const check = process.argv.includes('--check');
const campaignPages = {
  'index.html': ['campaign-entry', 'campaign-feature'],
  'events.html': ['campaign-meta', 'campaign-event'],
};
const templateNames = ['navigation', 'footer', ...Object.values(campaignPages).flat()];
const templates = new Map(await Promise.all(templateNames.map(async name => [
  name,
  (await readFile(resolve(import.meta.dirname, 'templates', name + '.html'), 'utf8')).trim(),
])));
const campaign = JSON.parse(await readFile(resolve(root, 'content/featured-campaign.json'), 'utf8'));
const action = new URL(campaign.actionUrl);
if (action.protocol !== 'https:' || action.username || action.password) {
  throw new Error('The featured campaign action must use a public HTTPS URL.');
}

const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function render(name, file) {
  const html = templates.get(name);
  if (name.startsWith('campaign-')) {
    return html.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      const value = Object.hasOwn(campaign, key) ? campaign[key] : null;
      if (typeof value !== 'string' || !value.trim()) {
        throw new Error('Missing featured campaign text for ' + key);
      }
      return value.replace(/[&<>"']/g, character => entities[character]);
    });
  }
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
  for (const name of ['navigation', 'footer', ...(campaignPages[file] ?? [])]) {
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
