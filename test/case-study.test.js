import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { recordPublication, verifyPublishedHtml } from '../templates/project-case-study-publish.mjs';
const root = resolve(new URL('..', import.meta.url).pathname);
const run = (args, cwd) => spawnSync(process.execPath, args, {cwd, encoding:'utf8'});
function fixture(kind) {
  const temp=mkdtempSync(join(tmpdir(),'byo-post-')); const out=join(temp,'project');
  const input=join(temp,'concept.json');
  writeFileSync(input,JSON.stringify({name:'Trace Example',kind,problem:'Understand uncertain writes',user:'Operator',standout:'Explain each held call',demo_steps:['load example']}));
  assert.equal(run([join(root,'scripts/byo.mjs'),'scaffold',input,'--out',out],root).status,0);
  return {temp,out};
}
const sha='b'.repeat(64); const repo='https://github.com/example/trace-example'; const demo='https://trace.example.com';
function published(out,web=false) {
  const file=join(out,'portfolio-handoff.json');const handoff=JSON.parse(readFileSync(file));
  handoff.verification={status:'passed',source_sha256:sha};writeFileSync(file,JSON.stringify(handoff));
  writeFileSync(join(out,'release-receipt.json'),JSON.stringify({github:{status:'pushed',url:repo,commit:'a'.repeat(40),verified_source_sha256:sha},...(web?{cloudflare:{status:'deployed',url:demo,verified_source_sha256:sha}}:{})}));
}
function article(out,body=`A useful illustrative example. [Source](${repo})`) {
  writeFileSync(join(out,'docs/CASE_STUDY.md'),`# A concrete lesson\n\n${body}\n`);
}
test('all project kinds include a private article draft, brief and separate check',()=>{
  for(const kind of ['web','cli','library']) {
    const {temp,out}=fixture(kind);
    try {
      const pkg=JSON.parse(readFileSync(join(out,'package.json')));
      assert.equal(pkg.scripts['blog:check'],'node scripts/case-study.mjs');
      assert.equal(pkg.scripts['blog:record'],'node scripts/case-study-publish.mjs');
      assert.match(readFileSync(join(out,'README.md'),'utf8'),/npm run blog:record -- --published-url/);
      assert.match(readFileSync(join(out,'docs/CASE_STUDY_BRIEF.md'),'utf8'),/Compare a few plausible takes/);
      assert.match(readFileSync(join(out,'.gitignore'),'utf8'),/docs\/CASE_STUDY.md/);
      assert.equal(JSON.parse(readFileSync(join(out,'portfolio-handoff.json'))).artifacts.find(a=>a.type==='case_study').publication,'not_recorded');
      const rejected=run(['scripts/case-study.mjs'],out);
      assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/placeholders/);
      published(out,kind==='web');article(out,`An explicit example. [Source](${repo})${kind==='web'?` [Demo](${demo})`:''}`);
      const checked=run(['scripts/case-study.mjs'],out);assert.equal(checked.status,0,checked.stderr);
      const receipt=JSON.parse(readFileSync(join(out,'case-study-receipt.json')));
      assert.equal(receipt.status,'format_and_links_checked');assert.equal(receipt.editorial_review,'not_certified');assert.equal(receipt.publication,'not_recorded');
    } finally {rmSync(temp,{recursive:true,force:true});}
  }
});
test('publication recording verifies the live page and keeps article and README states separate', async()=>{
  const {temp,out}=fixture('cli');
  try {
    published(out); article(out); assert.equal(run(['scripts/case-study.mjs'],out).status,0);
    const url='https://writer.example.org/writing/concrete-lesson';
    const html='<html><head><title>A concrete lesson</title></head><body><h1>A concrete lesson</h1><a href="https://github.com/example/trace-example">Source</a></body></html>';
    const options={root:out,url,lookupImpl:async()=>[{address:'93.184.216.34'}],fetchImpl:async()=>({ok:true,status:200,body:Readable.from([html])})};
    const result=await recordPublication(options);
    assert.deepEqual(result,{publication:'verified_live_page',publication_url:url,readme_backlink:'recorded'});
    await recordPublication(options);
    const readme=readFileSync(join(out,'README.md'),'utf8');
    assert.equal((readme.match(/byo-kit:case-study:start/g)||[]).length,1);assert.match(readme,new RegExp(`\\]\\(${url.replaceAll('/','\\/')}\\)`));
    const receipt=JSON.parse(readFileSync(join(out,'case-study-receipt.json')));
    assert.equal(receipt.publication,'verified_live_page');assert.equal(receipt.readme_backlink,'recorded');
    const artifact=JSON.parse(readFileSync(join(out,'portfolio-handoff.json'))).artifacts.find(item=>item.type==='case_study');
    assert.equal(artifact.publication,'verified_live_page');assert.equal(artifact.readme_backlink,'recorded');
    assert.equal(run(['scripts/case-study.mjs'],out).status,0);
    assert.equal(JSON.parse(readFileSync(join(out,'case-study-receipt.json'))).publication,'verified_live_page');
    assert.equal(JSON.parse(readFileSync(join(out,'portfolio-handoff.json'))).artifacts.find(item=>item.type==='case_study').publication,'verified_live_page');
    article(out,`A revised example. [Source](${repo})`);
    assert.equal(run(['scripts/case-study.mjs'],out).status,0);
    assert.equal(JSON.parse(readFileSync(join(out,'case-study-receipt.json'))).publication,'stale_article');
  } finally {rmSync(temp,{recursive:true,force:true});}
});
test('publication rejects wrong title, missing repository link and non-public URL forms',async()=>{
  assert.throws(()=>verifyPublishedHtml('<title>Other</title><a href="https://github.com/example/trace-example">repo</a>','A concrete lesson',repo),/title or heading/);
  assert.throws(()=>verifyPublishedHtml('<h1>A concrete lesson</h1>','A concrete lesson',repo),/does not link/);
  const {temp,out}=fixture('cli');
  try {
    published(out);article(out);assert.equal(run(['scripts/case-study.mjs'],out).status,0);
    await assert.rejects(recordPublication({root:out,url:'http://writer.example.org/a'}),/public HTTPS/);
    await assert.rejects(recordPublication({root:out,url:'https://127.0.0.1/a'}),/non-public network/);
    await assert.rejects(recordPublication({root:out,url:'https://writer.example.org/a',lookupImpl:async()=>[{address:'10.0.0.2'}]}),/non-public network/);
    const releasePath=join(out,'release-receipt.json');const release=JSON.parse(readFileSync(releasePath));release.github.commit='c'.repeat(40);writeFileSync(releasePath,JSON.stringify(release));
    await assert.rejects(recordPublication({root:out,url:'https://writer.example.org/a'}),/must match/);
  } finally {rmSync(temp,{recursive:true,force:true});}
});
test('case study requires the finished matching release and both web links',()=>{
  const {temp,out}=fixture('web');
  try {
    article(out);assert.notEqual(run(['scripts/case-study.mjs'],out).status,0);
    published(out,true);
    assert.match(run(['scripts/case-study.mjs'],out).stderr,/live demo/);
    article(out,`An example. [Wrong source](https://github.com/example/other) [Demo](${demo})`);
    assert.match(run(['scripts/case-study.mjs'],out).stderr,/repository/);
    article(out,`An example. [Source](${repo}) [Demo](${demo})`);
    const release=JSON.parse(readFileSync(join(out,'release-receipt.json')));release.github.verified_source_sha256='c'.repeat(64);writeFileSync(join(out,'release-receipt.json'),JSON.stringify(release));
    assert.match(run(['scripts/case-study.mjs'],out).stderr,/must match/);
  } finally {rmSync(temp,{recursive:true,force:true});}
});
test('word ceiling counts visible link text and rejects exactly 1000 words',()=>{
  const {temp,out}=fixture('cli');
  try {
    published(out);article(out,`${'word '.repeat(994)}[Source](${repo})`);
    assert.equal(run(['scripts/case-study.mjs'],out).status,0);
    const receipt=JSON.parse(readFileSync(join(out,'case-study-receipt.json')));assert.equal(receipt.word_count,998);
    article(out,`${'word '.repeat(996)}[Source](${repo})`);
    assert.match(run(['scripts/case-study.mjs'],out).stderr,/found 1000/);
  } finally {rmSync(temp,{recursive:true,force:true});}
});
