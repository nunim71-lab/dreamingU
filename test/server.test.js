import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer } from '../src/server.js';

async function withServer(options, fn) {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'dream-'));
  const server = await createServer({ dataDir, env: {}, ...options });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try { await fn(base, dataDir); } finally { server.close(); await rm(dataDir, { recursive: true, force: true }); }
}
const json = (base, p, body, method = 'POST') =>
  fetch(base + p, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });

const DREAM = { text: '하늘을 나는 꿈', moods: ['🤩 신기함'], dreamAtLocal: '2026-11-10T06:40', tzOffset: 9, place: { name: '서울', lat: 37.5665, lon: 126.978 } };

test('serves the page, the shared chart code and status', async () => {
  await withServer({}, async (base) => {
    assert.match(await (await fetch(base + '/')).text(), /꿈탐정 부엉/);
    assert.match(await (await fetch(base + '/astro.js')).text(), /export function computeChart/);
    assert.match(await (await fetch(base + '/report.js')).text(), /export function parseReport/);
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(status.hasKey, false);
    assert.equal(status.tzOffset, 9);
  });
});

test('records a dream with its chart, analyzes it and saves the result', async () => {
  let asked;
  const REPORT = '<분석심리학>\n## 🔍 꿈 한눈에 보기\n날아올랐어요.\n</분석심리학>\n<천궁도>\n## 🌙 그날 밤의 달\n달이 밝았어요.\n</천궁도>\n<제목>하늘 산책</제목>\n<키워드>하늘, 날기</키워드>';
  const ask = async (args) => {
    asked = args;
    args.onText(REPORT.slice(0, 40));
    args.onText(REPORT.slice(40));
    return REPORT;
  };
  await withServer({ ask }, async (base, dataDir) => {
    const noKey = await json(base, '/api/dreams', DREAM);
    const { dream } = await noKey.json();
    assert.equal(dream.chart.planets.length, 10);
    assert.equal(dream.dreamAt, '2026-11-09T21:40:00.000Z');

    const refused = await json(base, `/api/dreams/${dream.id}/analyze`, {});
    assert.equal(refused.status, 400);
    assert.match((await refused.json()).error, /API 키/);

    assert.equal((await json(base, '/api/settings', { apiKey: 'nope' })).status, 400);
    assert.equal((await json(base, '/api/settings', { apiKey: 'sk-ant-api03-abcdefghijklmnop' })).status, 200);
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(status.hasKey, true);
    assert.ok(!JSON.stringify(status).includes('abcdefghijklmnop'), '키 전체를 화면에 돌려주지 않음');

    const res = await json(base, `/api/dreams/${dream.id}/analyze`, {});
    const streamed = await res.text();
    assert.match(streamed, /날아올랐어요/);
    assert.equal(asked.apiKey, 'sk-ant-api03-abcdefghijklmnop');
    assert.match(asked.prompt, /하늘을 나는 꿈/);
    assert.match(asked.system, /분석심리학/);

    const { dreams } = await (await fetch(base + '/api/dreams')).json();
    assert.equal(dreams[0].title, '하늘 산책');
    assert.deepEqual(dreams[0].keywords, ['하늘', '날기']);
    assert.equal(dreams[0].analysis, '## 🔍 꿈 한눈에 보기\n날아올랐어요.');
    assert.equal(dreams[0].skyAnalysis, '## 🌙 그날 밤의 달\n달이 밝았어요.');

    const saved = JSON.parse(await readFile(path.join(dataDir, 'dreams.json'), 'utf8'));
    assert.equal(saved[0].title, '하늘 산책');

    const { stats } = await (await fetch(base + '/api/patterns')).json();
    assert.deepEqual(stats.keywords.map((k) => k.name), ['하늘', '날기']);
    assert.equal(stats.total, 1);
  });
});

test('reports Claude failures inside the stream and keeps the dream', async () => {
  const ask = async ({ onText }) => { onText('반쯤'); throw Object.assign(new Error('Claude 쪽이 지금 붐벼요.'), { status: 502 }); };
  await withServer({ ask, env: { ANTHROPIC_API_KEY: 'sk-ant-env-key-123456' } }, async (base) => {
    const { dream } = await (await json(base, '/api/dreams', DREAM)).json();
    const text = await (await json(base, `/api/dreams/${dream.id}/analyze`, {})).text();
    assert.equal(text, '반쯤\u0000Claude 쪽이 지금 붐벼요.');
    const { dreams } = await (await fetch(base + '/api/dreams')).json();
    assert.equal(dreams.length, 1);
    assert.equal(dreams[0].analysis, '');
  });
});

test('copy-and-paste analysis works without an API key', async () => {
  await withServer({}, async (base) => {
    const { dream } = await (await json(base, '/api/dreams', DREAM)).json();
    const { text } = await (await fetch(`${base}/api/dreams/${dream.id}/prompt`)).json();
    assert.match(text, /하늘을 나는 꿈/);
    assert.match(text, /【천궁도】/);

    assert.equal((await json(base, `/api/dreams/${dream.id}/report`, { text: '' })).status, 400);
    assert.equal((await json(base, `/api/dreams/${dream.id}/report`, { text: '네 알겠습니다' })).status, 400);
    const answer = '【분석심리학】\n## 🔍 꿈 한눈에 보기\n하늘을 나는 꿈은 자유롭고 싶은 마음을 보여 줄 수 있어요.\n【천궁도】\n## 🌙 그날 밤의 달\n달이 밝았어요.\n【제목】 하늘 산책\n【키워드】 하늘, 날기';
    const saved = await (await json(base, `/api/dreams/${dream.id}/report`, { text: answer })).json();
    assert.equal(saved.dream.title, '하늘 산책');
    assert.equal(saved.dream.analyzedVia, 'paste');
    const { dreams } = await (await fetch(base + '/api/dreams')).json();
    assert.equal(dreams[0].skyAnalysis, '## 🌙 그날 밤의 달\n달이 밝았어요.');
    assert.deepEqual(dreams[0].keywords, ['하늘', '날기']);
    assert.equal((await fetch(`${base}/api/dreams/nope/prompt`)).status, 404);
  });
});

test('unknown features explain how to restart, and shutdown asks the app to close', async () => {
  let closed = 0;
  await withServer({ onShutdown: () => { closed++; } }, async (base) => {
    const missing = await fetch(`${base}/api/something-new`);
    assert.equal(missing.status, 404);
    assert.match((await missing.json()).error, /다시 켜 주세요/);
    assert.equal((await fetch(`${base}/api/shutdown`, { method: 'POST' })).status, 415, 'JSON 이 아니면 거절');
    const res = await json(base, '/api/shutdown', {});
    assert.equal(res.status, 200);
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(closed, 1);
  });
});

test('validates input, blocks other websites and deletes dreams', async () => {
  await withServer({}, async (base) => {
    assert.equal((await json(base, '/api/dreams', { ...DREAM, text: ' ' })).status, 400);
    assert.equal((await json(base, '/api/dreams', { ...DREAM, dreamAtLocal: 'x' })).status, 400);
    assert.equal((await json(base, '/api/dreams', { ...DREAM, place: { lat: 80, lon: 0 } })).status, 400);
    const form = await fetch(base + '/api/dreams', { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(DREAM) });
    assert.equal(form.status, 415);
    const evil = await fetch(base + '/api/dreams', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(DREAM) });
    assert.equal(evil.status, 403);

    const { dream } = await (await json(base, '/api/dreams', DREAM)).json();
    assert.equal((await json(base, `/api/dreams/${dream.id}`, undefined, 'DELETE')).status, 200);
    assert.equal((await json(base, `/api/dreams/${dream.id}`, undefined, 'DELETE')).status, 404);
    assert.equal((await json(base, '/api/patterns', {})).status, 400);
  });
});
