import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const pages=fs.readdirSync(root).filter(f=>f.endsWith('.html'));
let links=0,scripts=0;
for(const file of pages){
  const html=fs.readFileSync(path.join(root,file),'utf8');
  assert.match(html,/<html lang="en"/i,`${file}: language`);
  assert.match(html,/<meta name="viewport"/i,`${file}: viewport`);
  assert.equal((html.match(/<h1(?:\s|>)/g)||[]).length,1,`${file}: exactly one h1`);
  assert.equal((html.match(/<main(?:\s|>)/g)||[]).length,1,`${file}: one main`);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(new Set(ids).size,ids.length,`${file}: unique IDs`);
  for(const match of html.matchAll(/(?:href|src)="([^"]+)"/g)){
    let url=match[1];if(/^(https?:|mailto:|tel:|data:)/i.test(url))continue;
    const [pathname,anchor]=url.split('#');
    const local=decodeURIComponent(pathname.split('?')[0]);
    const target=local?path.resolve(root,local.replace(/^\//,'')):path.join(root,file);
    assert.ok(fs.existsSync(target),`${file}: missing ${url}`);
    if(anchor&&target.endsWith('.html'))assert.ok(fs.readFileSync(target,'utf8').includes(`id="${anchor}"`),`${file}: missing anchor ${url}`);
    links++;
  }
  for(const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)){new vm.Script(m[1],{filename:file});scripts++;}
}
for(const file of fs.readdirSync(root).filter(f=>f.endsWith('.js'))){new vm.Script(fs.readFileSync(path.join(root,file),'utf8'),{filename:file});scripts++;}
for(const file of ['updates.json','songwars-public.json','wrangler.jsonc'])JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const data=JSON.parse(fs.readFileSync(path.join(root,'songwars-public.json'),'utf8'));
assert.equal(data.approved.length,12);assert.equal(data.waitlist.length,1);assert.equal(data.approved[11].duo,'As5');
const event=fs.readFileSync(path.join(root,'events.html'),'utf8');
assert.equal((event.match(/class="matchup-card"/g)||[]).length,6);
assert.ok(!event.includes('RIPSOKA'));assert.ok(event.includes('VS As5'));assert.ok(!event.includes('24 approved artists are confirmed'));
const publicData=fs.readFileSync(path.join(root,'songwars-public.json'),'utf8');
assert.ok(!/contact_email|artist_one_discord|artist_two_discord|attendance_at|sb_secret_|service_role/.test(publicData),'Public snapshot contains no private fields');
console.log(`PASS: ${pages.length} pages, ${links} local links/assets, ${scripts} script syntax checks, 12 approved duos, 6 matchups, 1 waitlist duo, public-field privacy check.`);
