import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function run({ pipeline, receipt, scanExit = '0' }) {
  const root = mkdtempSync(path.join(tmpdir(),'career-ops-feed-'));
  mkdirSync(path.join(root,'data'),{recursive:true});
  if (pipeline != null) writeFileSync(path.join(root,'data','pipeline.md'),pipeline);
  const receiptPath = path.join(root,'receipt.json');
  if (receipt != null) writeFileSync(receiptPath,JSON.stringify(receipt));
  const out = path.join(root,'public','data','jobs.json');
  const p = spawnSync(process.execPath,['scripts/export-scan-feed.mjs'],{
    cwd:process.cwd(), encoding:'utf8',
    env:{ ...process.env, CAREER_OPS_ROOT:root, SCAN_RECEIPT:receiptPath, SCAN_EXIT_CODE:scanExit, FEED_OUTPUT:out }
  });
  assert.equal(p.status,0,p.stderr);
  return JSON.parse(readFileSync(out,'utf8'));
}
const receipt={version:'careerops.scan.receipt@1',date:'2026-11-21',dry_run:false,scanned:3,found:120,added:2,errors:[]};
const pipeline=[
  '# Pipeline',
  '## Pending',
  '- [ ] https://job-boards.greenhouse.io/example/jobs/5678 | Example Labs | DevOps Engineer | Hyderabad, India | posted: 2026-11-20 | yrs: 2-4',
  '- [ ] https://jobs.ashbyhq.com/placeholder/1234 | Example Two | Cloud Engineer | Remote, India',
  '- [ ] https://job-boards.greenhouse.io/example/jobs/5678 | Example Labs | DevOps Engineer | Hyderabad, India',
  '- [x] https://jobs.ashbyhq.com/example/already-processed | Past Co | Past Job',
  '- [ ] javascript:alert(1) | Fraud | Invalid',
  '## Processed',
  ''
].join('\n');

test('exports unique public job cards from temporary scanner pipeline',()=>{
  const feed=run({pipeline,receipt});
  assert.equal(feed.schema,'careerops.public-jobs.v1');
  assert.equal(feed.scan.status,'success');
  assert.equal(feed.scan.matched,2);
  assert.equal(feed.jobs.length,2);
  assert.equal(feed.jobs[0].company,'Example Labs');
  assert.equal(feed.jobs[0].location,'Hyderabad, India');
  assert.equal(feed.jobs[0].posted_at,'2026-11-20');
  assert.equal(feed.jobs[0].requiredExperience,'2-4');
  assert.equal(feed.jobs[1].url,'https://jobs.ashbyhq.com/placeholder/1234');
  assert.ok(!JSON.stringify(feed).includes('candidate'));
});

test('marks partial sources, without disclosing full error traces',()=>{
  const partial={...receipt,errors:[{company:'Example Two',error:'Secret configuration path or details'}]};
  const feed=run({pipeline,receipt:partial,scanExit:'2'});
  assert.equal(feed.scan.status,'partial');
  assert.equal(feed.scan.error_count,1);
  assert.equal(feed.jobs.length,2);
  assert.ok(!JSON.stringify(feed).includes('Secret configuration'));
});

test('shows failed scan when receipt absent',()=>{
  const feed=run({pipeline,receipt:null,scanExit:'1'});
  assert.equal(feed.scan.status,'failed');
  assert.deepEqual(feed.jobs,[]);
});

test('rejects accidental dry-run receipts as a live feed',()=>{
  const feed=run({pipeline,receipt:{...receipt,dry_run:true}});
  assert.equal(feed.scan.status,'failed');
  assert.deepEqual(feed.jobs,[]);
});
