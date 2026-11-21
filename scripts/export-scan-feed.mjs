#!/usr/bin/env node
/**
 * Export ONLY public job-posting fields from an isolated Career-Ops scanner run.
 * No resumes, private profile, applicant identifiers, or application records.
 *
 * Environment:
 *   CAREER_OPS_ROOT - ephemeral scanner data directory
 *   SCAN_RECEIPT - JSON from node scan.mjs --json --quiet
 *   FEED_OUTPUT - destination inside the Pages build directory
 *   SCAN_EXIT_CODE - scanner's 0/1/2 exit status
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const root = process.env.CAREER_OPS_ROOT || '';
const receiptFile = process.env.SCAN_RECEIPT || '';
const destination = process.env.FEED_OUTPUT || 'public/data/jobs.json';
const runExitCode = Number(process.env.SCAN_EXIT_CODE ?? 1);

function scalar(value, max = 200) {
  return typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}
function safeUrl(raw) {
  try {
    const url = new URL(String(raw));
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    return url.toString();
  } catch { return ''; }
}
function isLabel(value) {
  return /^(posted|trust|yrs|note|rank|compensation):/i.test(value);
}
function parseLine(line, scanDate) {
  const match = line.match(/^\s*-\s*\[\s\]\s+(https?:\/\/[^\s|]+)\s*\|\s*([^|]+)\s*\|\s*([^|]+)(.*)$/i);
  if (!match) return null;
  const url = safeUrl(match[1]);
  const company = scalar(match[2], 110);
  const title = scalar(match[3], 160);
  if (!url || !company || !title) return null;
  const extras = match[4].split('|').map(s => scalar(s, 260)).filter(Boolean);
  const location = extras.find(s => !isLabel(s)) || 'Location not specified';
  const posted = extras.find(s => /^posted:\s*\d{4}-\d{2}-\d{2}$/.test(s));
  return {
    id: 'scan-' + createHash('sha256').update(url).digest('hex').slice(0,16),
    company,
    title,
    location: scalar(location,120),
    url,
    skills: [],
    description: '',
    posted_at: posted ? posted.replace(/^posted:\s*/, '') : null,
    addedAt: posted ? posted.replace(/^posted:\s*/, '') : scanDate,
    source: 'Career-Ops public portal scan'
  };
}
let receipt = null;
let error = '';
try {
  if (receiptFile && existsSync(receiptFile)) {
    receipt = JSON.parse(readFileSync(receiptFile, 'utf8'));
    if (!receipt || receipt.version !== 'careerops.scan.receipt@1' || receipt.dry_run !== false) {
      throw new Error('Scanner receipt has an unexpected schema or is a dry run');
    }
  } else {
    error = 'Scanner did not produce a valid receipt.';
  }
} catch (err) {
  // An invalid or dry-run receipt must never be eligible for publication.
  // JSON.parse() can succeed before schema validation throws.
  receipt = null;
  error = 'Scanner receipt rejected: ' + err.message;
}
const generatedAt = new Date().toISOString();
const scanDate = receipt && /^\d{4}-\d{2}-\d{2}$/.test(receipt.date) ? receipt.date : generatedAt.slice(0,10);
let jobs = [];
if (receipt && root) {
  const pipelineFile = path.join(root, 'data', 'pipeline.md');
  if (existsSync(pipelineFile)) {
    const items = readFileSync(pipelineFile, 'utf8').split(/\r?\n/);
    const seen = new Set();
    for (const line of items) {
      const job = parseLine(line, scanDate);
      if (!job) continue;
      const key = job.url.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(job);
      if (jobs.length >= 500) break;
    }
  }
}
const errors = receipt && Array.isArray(receipt.errors) ? receipt.errors.length : 0;
const status = !receipt || runExitCode === 1
  ? 'failed'
  : (errors || runExitCode > 0) ? 'partial' : 'success';
const feed = {
  schema: 'careerops.public-jobs.v1',
  generated_at: generatedAt,
  scope: 'public job postings only',
  scan: {
    status,
    date: scanDate,
    scanned: Number.isFinite(Number(receipt?.scanned)) ? Number(receipt.scanned) : 0,
    found: Number.isFinite(Number(receipt?.found)) ? Number(receipt.found) : 0,
    matched: Number.isFinite(Number(receipt?.added)) ? Number(receipt.added) : 0,
    error_count: errors,
    message: error || (status === 'partial' ? 'Some job sources could not be scanned; displayed results may be incomplete.' : status === 'success' ? 'Public job scan completed.' : 'Scanner did not complete.')
  },
  jobs: status === 'failed' ? [] : jobs
};
mkdirSync(path.dirname(destination), { recursive: true });
writeFileSync(destination, JSON.stringify(feed, null, 2) + '\n', { mode: 0o644 });
console.log(JSON.stringify({ status:feed.scan.status, scanned:feed.scan.scanned, found:feed.scan.found, matched:feed.scan.matched, published:feed.jobs.length, errors }, null, 2));
