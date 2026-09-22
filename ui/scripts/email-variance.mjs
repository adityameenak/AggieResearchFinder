/**
 * Measure how repetitive the generated outreach emails are.
 *
 * The complaint this exists to answer: professors could tell the drafts came
 * from a tool. That is a measurable property, so measure it — before and after
 * any change to api/email.js or api/_lib/emailGuidance.js.
 *
 *   node scripts/email-variance.mjs --school tamu --n 25 --yes
 *   node scripts/email-variance.mjs --n 12 --out /tmp/after.json --yes
 *   node scripts/email-variance.mjs --n 12 --base http://localhost:3000 --yes
 *
 * By default it invokes the handler in-process, so it needs no server. With
 * --base it POSTs to a running `vercel dev`, exercising the HTTP layer too.
 *
 * With ANTHROPIC_API_KEY set it drafts through the model (real tokens — hence
 * --yes). With no key it measures the template fallback, which is how the
 * template's own variant work gets checked.
 *
 * The sample is stratified across the three grounding tiers. A uniform random
 * sample would under-weight the no-ai_review tier, and that tier is exactly
 * where formulaic output survives.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { AVOID } from '../api/_lib/emailGuidance.js'
import { splitResearch } from '../src/utils/search.js'
import { SCHOOLS } from '../src/schools.js'

const here = dirname(fileURLToPath(import.meta.url))
const UI = resolve(here, '..')

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2)
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const flag = name => argv.includes(`--${name}`)

const school = arg('school', 'tamu')
const n = Number(arg('n', 20))
const tone = arg('tone', 'professional')
const length = arg('length', 'standard')
const base = arg('base', null)
const out = arg('out', null)
const seed = Number(arg('seed', 7))

if (!SCHOOLS[school]) {
  console.error(`Unknown school "${school}". Known: ${Object.keys(SCHOOLS).join(', ')}`)
  process.exit(1)
}

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY)
const mode = hasKey ? 'MODEL (claude-haiku-4-5, real tokens)' : 'TEMPLATE fallback (no API key set)'
console.log(`school=${school} n=${n} tone=${tone} length=${length}`)
console.log(`mode:  ${mode}`)
console.log(`calls: ${n}${base ? ` → POST ${base}/api/email` : ' → in-process handler'}`)
if (!flag('yes')) {
  console.error('\nRefusing to run without --yes (a model run spends real tokens).')
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Sample: stratified across grounding tiers
// ---------------------------------------------------------------------------
const faculty = JSON.parse(readFileSync(join(UI, 'public', `faculty-${school}.json`), 'utf8'))

function tierOf(prof) {
  if (prof.pub_count) return 'papers'
  if (splitResearch(prof).summary.trim()) return 'summary'
  return 'sparse'
}

// Deterministic shuffle so before/after runs sample the same professors.
let rnd = seed
const nextRand = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
const shuffled = [...faculty].sort(() => nextRand() - 0.5)

const buckets = { papers: [], summary: [], sparse: [] }
for (const p of shuffled) buckets[tierOf(p)].push(p)

const per = Math.max(1, Math.floor(n / 3))
const sample = []
for (const t of ['papers', 'summary', 'sparse']) sample.push(...buckets[t].slice(0, per))
// Top up from the largest bucket if n isn't divisible by 3.
for (const p of shuffled) {
  if (sample.length >= n) break
  if (!sample.includes(p)) sample.push(p)
}
sample.length = Math.min(sample.length, n)

console.log('tiers in sample:', Object.fromEntries(
  ['papers', 'summary', 'sparse'].map(t => [t, sample.filter(p => tierOf(p) === t).length])))

// A fixed student, so professor variance is the only variable.
const STUDENT = {
  name: 'Jordan Alvarez',
  year: 'sophomore',
  major: 'Biomedical Engineering',
  technical_skills: ['Python', 'MATLAB', 'SolidWorks', 'CAD'],
  inferred_themes: ['biomechanics', 'medical devices', 'signal processing'],
  coursework: ['Statics', 'Circuits', 'Biomaterials'],
  lab_techniques: ['cell culture', 'PCR'],
  research_experiences: [{ title: 'Gait analysis of prosthetic feet' }],
  project_experiences: [{ title: 'Low-cost EMG-controlled gripper' }],
}
const INTERESTS = 'prosthetics and how tissue responds to implanted materials'

// ---------------------------------------------------------------------------
// Draft
// ---------------------------------------------------------------------------
// --handler lets a baseline run point at a copy of the previous email.js, so
// before/after numbers come from the same harness.
const handlerPath = arg('handler', '../api/email.js')
let handler = null
if (!base) ({ default: handler } = await import(handlerPath))

async function draftFor(prof) {
  const body = {
    prof, parsed_profile: STUDENT, interests: INTERESTS, tone, length,
    school_name: SCHOOLS[school].name,
  }
  if (base) {
    const r = await fetch(`${base}/api/email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return r.json()
  }
  // Minimal req/res good enough for the handler's surface.
  const req = { method: 'POST', body, headers: { host: 'stemresearchfinder.tech' } }
  return new Promise((resolvePromise, reject) => {
    const res = {
      status() { return res },
      end() { reject(new Error('handler ended without json')) },
      json: resolvePromise,
    }
    handler(req, res).catch(reject)
  })
}

const drafts = []
for (const [i, prof] of sample.entries()) {
  try {
    const d = await draftFor(prof)
    drafts.push({ id: prof.id, name: prof.name, tier: tierOf(prof), ...d })
    process.stdout.write(`\r  drafted ${i + 1}/${sample.length}`)
  } catch (err) {
    process.stdout.write(`\r  FAILED ${prof.name}: ${err.message}\n`)
  }
}
console.log('\n')

if (!drafts.length) { console.error('No drafts produced.'); process.exit(1) }

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------
const norm = s => s.toLowerCase().replace(/\s+/g, ' ').trim()
/** Mask the names so shared *structure* is not hidden by differing nouns. */
const mask = (s, d) => norm(s)
  .replaceAll(norm(d.name || ''), '<prof>')
  .replaceAll(norm(STUDENT.name), '<student>')

const words = s => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(Boolean)
function ngrams(s, k = 5) {
  const w = words(s)
  const out = new Set()
  for (let i = 0; i + k <= w.length; i++) out.add(w.slice(i, i + k).join(' '))
  return out
}

// 1. Subject variety
const subjects = drafts.map(d => d.subject || '')
const distinctSubjects = new Set(subjects.map(norm)).size

// 2. Pairwise shared 5-gram rate
const grams = drafts.map(d => ngrams(mask(d.body, d)))
const pairRates = []
for (let i = 0; i < grams.length; i++) {
  for (let j = i + 1; j < grams.length; j++) {
    const shared = [...grams[i]].filter(g => grams[j].has(g)).length
    pairRates.push(shared / Math.max(1, Math.min(grams[i].size, grams[j].size)))
  }
}
const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0)

// 3. Which 5-grams recur across drafts (the actual tells)
const gramDocs = new Map()
grams.forEach(set => set.forEach(g => gramDocs.set(g, (gramDocs.get(g) || 0) + 1)))
const topGrams = [...gramDocs.entries()]
  .filter(([, c]) => c > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 15)
  .map(([g, c]) => ({ gram: g, docs: c, pct: +(100 * c / drafts.length).toFixed(1) }))
const tells = topGrams.filter(g => g.pct > 40)

// 4. Identical sentences across drafts
const sentDocs = new Map()
drafts.forEach(d => {
  const seen = new Set(mask(d.body, d).split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 25))
  seen.forEach(s => sentDocs.set(s, (sentDocs.get(s) || 0) + 1))
})
const totalSentences = [...sentDocs.values()].reduce((a, b) => a + b, 0)
const repeatedSentences = [...sentDocs.entries()].filter(([, c]) => c > 1)
const identicalRate = totalSentences ? repeatedSentences.reduce((a, [, c]) => a + c, 0) / totalSentences : 0

// 5. Banned-phrase compliance
const avoidHits = []
for (const d of drafts) {
  const hay = norm(`${d.subject}\n${d.body}`)
  const hit = AVOID.filter(p => hay.includes(norm(p)))
  if (hit.length) avoidHits.push({ name: d.name, phrases: hit })
}

// 6. Opening / closing shape spread — the one thing n-grams can't tell from luck
const openings = {}
const closings = {}
for (const d of drafts) {
  const ls = d.body.split('\n').map(s => s.trim()).filter(Boolean)
  const o = norm(ls[1] || ls[0] || '').slice(0, 40)
  const c = norm(ls[ls.length - 3] || '').slice(0, 40)
  openings[o] = (openings[o] || 0) + 1
  closings[c] = (closings[c] || 0) + 1
}

// 7. Length
const wordCounts = drafts.map(d => words(d.body).length).sort((a, b) => a - b)

const report = {
  config: { school, n: drafts.length, tone, length, mode, seed, handler: base ? `POST ${base}` : handlerPath },
  subjects: { distinct: distinctSubjects, of: drafts.length },
  shared_5grams: { mean: +mean(pairRates).toFixed(4), max: +Math.max(...pairRates, 0).toFixed(4) },
  top_5grams: topGrams,
  tells,
  identical_sentence_rate: +identicalRate.toFixed(4),
  repeated_sentences: repeatedSentences.sort((a, b) => b[1] - a[1]).slice(0, 8)
    .map(([s, c]) => ({ docs: c, sentence: s.slice(0, 110) })),
  avoid_hits: avoidHits,
  distinct_openings: Object.keys(openings).length,
  distinct_closings: Object.keys(closings).length,
  words: { min: wordCounts[0], median: wordCounts[Math.floor(wordCounts.length / 2)], max: wordCounts.at(-1) },
  fallbacks: drafts.filter(d => d.template_fallback).length,
  grounding_tiers: drafts.reduce((a, d) => ({ ...a, [d.grounding?.tier || '?']: (a[d.grounding?.tier || '?'] || 0) + 1 }), {}),
}

// ---------------------------------------------------------------------------
// Print
// ---------------------------------------------------------------------------
// The targets describe the MODEL path. A fixed template with a handful of
// variants cannot reach them by construction, so don't print a verdict it can
// never satisfy — show the numbers and say which path produced them.
const judged = hasKey
const pf = ok => (judged ? (ok ? '  ok  ' : ' FAIL ') : '')
console.log('='.repeat(64))
if (!judged) console.log('(template path — pass/fail targets apply to the model path only)')
console.log(`distinct subject lines   ${distinctSubjects}/${drafts.length}${pf(distinctSubjects === drafts.length)}`)
console.log(`shared 5-gram rate       mean ${report.shared_5grams.mean}  max ${report.shared_5grams.max}`)
console.log(`5-grams over 40% of docs ${tells.length}${pf(tells.length === 0)}`)
console.log(`identical sentence rate  ${report.identical_sentence_rate}`)
console.log(`AVOID-list hits          ${avoidHits.length}${pf(avoidHits.length === 0)}`)
console.log(`distinct openings        ${report.distinct_openings}/${drafts.length}`)
console.log(`distinct closings        ${report.distinct_closings}/${drafts.length}`)
console.log(`body words               min ${report.words.min}  median ${report.words.median}  max ${report.words.max}`)
console.log(`template fallbacks       ${report.fallbacks}`)
console.log(`grounding tiers          ${JSON.stringify(report.grounding_tiers)}`)
console.log('='.repeat(64))

if (tells.length && judged) {
  console.log('\nTELLS — phrasing shared by >40% of drafts:')
  for (const t of tells) console.log(`  ${String(t.pct).padStart(5)}%  "${t.gram}"`)
}
if (report.repeated_sentences.length) {
  console.log('\nSentences appearing in more than one draft:')
  for (const r of report.repeated_sentences) console.log(`  ${r.docs}×  ${r.sentence}`)
}
if (avoidHits.length) {
  console.log('\nBanned phrases found:')
  for (const a of avoidHits) console.log(`  ${a.name}: ${a.phrases.join(', ')}`)
}

if (out) {
  writeFileSync(out, JSON.stringify({ report, drafts }, null, 2))
  console.log(`\nwrote ${out}`)
}
