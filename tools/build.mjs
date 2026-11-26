import { cp, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..');
const preview = process.argv.includes('--preview');
const hosted = process.argv.includes('--hosted');
const directory = preview ? 'dist-preview' : 'dist';
const out = resolve(root, directory);
const previewPages = new Set(['account.html', 'member.html', 'member-hub.html']);
const previewScripts = new Set([
  'editorial-preview.js', 'member-account.js', 'member-community.js', 'member-operations.js', 'member-platform.js',
]);
const hostedPages = new Set(['account.html', 'member.html', 'member-hub.html', 'events.html', 'artists.html']);
const hostedScripts = [...previewScripts].filter(file => file !== 'editorial-preview.js');
const publicFiles = new Set(['updates.json', 'songwars-public.json', 'songwars-legacy.json', 'exm-main-logo.png', 'robots.txt', 'sitemap.xml', '_headers']);
const renderableFiles = (await readdir(root)).filter(file => /\.(html|css|js)$/.test(file) || publicFiles.has(file));

execFileSync(process.execPath, [resolve(root, 'tools/sync-layout.mjs'), '--check'], { stdio: 'inherit' });
await mkdir(out, { recursive: true });
// Retire the old browser scoring module, including when rebuilding into an existing directory.
await unlink(resolve(out, 'songwars-legacy-data.js')).catch(error => { if (error.code !== 'ENOENT') throw error; });

// Clean up only the named generated preview files from pre-split builds.
if (!preview) {
  for (const file of [...previewPages, ...previewScripts]) {
    await unlink(resolve(out, file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  const expected = new Set(['assets', ...renderableFiles, ...(hosted ? ['__exm'] : [])]);
  for (const file of await readdir(out)) {
    if (!expected.has(file)) throw new Error('Unexpected file in the public output: ' + file);
  }
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
  const html = source.replace(/<!-- exm:preview ([\s\S]+?) -->/g, (_, markup) => preview ? markup : '')
    .replace('<!-- exm:preview-editorial -->', preview ? '<script src="editorial-preview.js"></script>' : '');
  await writeFile(resolve(out, file), inlineLayout(html, file));
}
await cp(resolve(root, 'assets'), resolve(out, 'assets'), { recursive: true });
if (hosted) {
  const packaged = resolve(out, '__exm');
  await mkdir(packaged, { recursive: true });
  for (const file of hostedPages) {
    const source = await readFile(resolve(root, file), 'utf8');
    const html = source.replace(/<!-- exm:preview ([\s\S]+?) -->/g, (_, markup) => markup)
      .replace(/<!-- exm:fixture -->[\s\S]*?<!-- \/exm:fixture -->/g, '')
      .replace('</head>', '<script src="/api/exm-mode.js"></script></head>');
    if (/Preview test accounts|Create a test account/.test(html)) throw new Error('Fixture surfaced in ' + file);
    await writeFile(resolve(packaged, file), inlineLayout(html, file));
  }
  for (const file of hostedScripts) {
    const source = await readFile(resolve(root, file), 'utf8');
    await writeFile(resolve(packaged, file), source.replace(/\/\* exm:fixture \*\/[\s\S]*?\/\* \/exm:fixture \*\//g, ''));
  }
}
if (!preview) execFileSync(process.execPath, [resolve(root, 'tools/test-public-build.mjs')], { stdio: 'inherit' });
console.log('EXM ' + (preview ? 'integrated preview' : 'public static') + ' build ready in ' + directory + '/');

function inlineLayout(html, file) {
  let matches = 0;
  const built = html.replace(/<link\b[^>]*\brel="stylesheet"[^>]*\bhref="\/?rollout\.css(?:\?[^"]*)?"[^>]*>/gi, () => {
    matches++;
    return '<style data-exm-layout>\n' + layout + '\n</style>';
  });
  if (matches !== 1) throw new Error(file + ': expected exactly one core layout stylesheet');
  return built;
}
