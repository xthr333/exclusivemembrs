import { cp, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const preview = process.argv.includes('--preview');
const directory = preview ? 'dist-preview' : 'dist';
const out = resolve(root, directory);
const previewPages = new Set(['account.html', 'member.html', 'member-hub.html']);
const previewScripts = new Set([
  'editorial-preview.js', 'member-account.js', 'member-community.js', 'member-operations.js', 'member-platform.js',
]);
const previewSections = new Map([
  ['artists.html', 'members'], ['events.html', 'event-board'], ['updates.html', 'notice-board'],
  ['hall-of-fame.html', 'preview-champions'],
]);
const publicFiles = new Set(['updates.json', 'songwars-public.json', 'exm-main-logo.png', 'robots.txt', 'sitemap.xml', '_headers']);
const renderableFiles = (await readdir(root)).filter(file => /\.(html|css|js)$/.test(file) || publicFiles.has(file));

execFileSync(process.execPath, [resolve(root, 'tools/sync-layout.mjs'), '--check'], { stdio: 'inherit' });
await mkdir(out, { recursive: true });

// Clean up only the named generated preview files from pre-split builds.
if (!preview) {
  for (const file of [...previewPages, ...previewScripts]) {
    await unlink(resolve(out, file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  const expected = new Set(['assets', ...renderableFiles]);
  for (const file of await readdir(out)) {
    if (!expected.has(file)) throw new Error('Unexpected file in the public output: ' + file);
  }
}

function publicMarkup(html, file) {
  const hidden = previewSections.get(file);
  if (hidden) {
    const region = new RegExp('<section\\b[^>]*\\bid="' + hidden + '"[^>]*>[\\s\\S]*?</section>','g');
    if ([...html.matchAll(region)].length !== 1) throw new Error(file + ': expected one preview section');
    html = html.replace(region, '');
  }
  html = html.replace(/^[ \t]*<a\b[^>]*data-page="([^"]+)"[^>]*>[^<]*<\/a>\s*$/gm,
    (tag, destination) => previewPages.has(destination) ? '' : tag);
  return html.replace(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/g,
    (tag, source) => previewScripts.has(source) ? '' : tag);
}

// Inline the same core layout used by the existing Worker build.
const layout = await readFile(resolve(root, 'rollout.css'), 'utf8');
if (/<\/style\b/i.test(layout) || /(?:url\s*\(|@import\b)/i.test(layout)) {
  throw new Error('Review inline layout safety and relative asset paths before deploying.');
}
for (const file of renderableFiles) {
  if (!preview && (previewPages.has(file) || previewScripts.has(file))) continue;
  if (!file.endsWith('.html')) {
    await cp(resolve(root, file), resolve(out, file));
    continue;
  }
  const source = await readFile(resolve(root, file), 'utf8');
  const html = preview ? source : publicMarkup(source, file);
  let matches = 0;
  const built = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/?rollout\.css(?:\?[^"]*)?"[^>]*>/gi, () => {
    matches++;
    return '<style data-exm-layout>\n' + layout + '\n</style>';
  });
  if (matches !== 1) throw new Error(file + ': expected exactly one core layout stylesheet');
  await writeFile(resolve(out, file), built);
}
await cp(resolve(root, 'assets'), resolve(out, 'assets'), { recursive: true });
if (!preview) execFileSync(process.execPath, [resolve(root, 'tools/test-public-build.mjs')], { stdio: 'inherit' });
console.log('EXM ' + (preview ? 'integrated preview' : 'public static') + ' build ready in ' + directory + '/');
