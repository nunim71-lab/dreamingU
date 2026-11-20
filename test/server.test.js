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
    assert.match(await (await fetch(base + '/')).text(), /꿈꾸는부엉이/);
    assert.match(await (await fetch(base + '/js/astro.js')).text(), /export function computeChart/);
    assert.match(await (await fetch(base + '/js/report.js')).text(), /export function parseReport/);
    assert.match(await (await fetch(base + '/js/app.js')).text(), /export async function createApp/);
    // 화면 폴더(docs) 밖이나 숨김 파일, 휴대폰 전용 sw.js 는 내보내지 않음
    for (const bad of ['/../package.json', '/%2e%2e/package.json', '/js/../../src/server.js', '/.nojekyll', '/sw.js', '/nothing.js']) {
      assert.equal((await fetch(base + bad)).status, 404, bad);
    }
    const status = await (await fetch(base + '/api/status')).json();
    assert.equal(status.hasKey, false);
    assert.equal(status.tzOffset, 9);
    assert.equal(status.mode, 'server');
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

test('overall pattern analysis also works by copy and paste', async () => {
  await withServer({}, async (base) => {
    assert.equal((await fetch(`${base}/api/patterns/prompt`)).status, 400, '꿈이 2개는 있어야 함');
    await json(base, '/api/dreams', DREAM);
    await json(base, '/api/dreams', { ...DREAM, text: '바다를 헤엄친 꿈', dreamAtLocal: '2026-11-11T06:00' });
    const noKey = await json(base, '/api/patterns', {});
    assert.equal(noKey.status, 400);
    assert.match((await noKey.json()).error, /글 복사/);
    const { text } = await (await fetch(`${base}/api/patterns/prompt`)).json();
    assert.match(text, /하늘을 나는 꿈/);
    assert.match(text, /바다를 헤엄친 꿈/);
    assert.match(text, /종합 분석만 써 주세요/);
    assert.equal((await json(base, '/api/patterns/report', { text: '네' })).status, 400);
    const answer = '## 🗂️ 수사 기록 요약\n두 꿈 모두 넓은 곳을 자유롭게 움직이는 꿈이에요.';
    const saved = await (await json(base, '/api/patterns/report', { text: answer })).json();
    assert.equal(saved.last.text, answer);
    assert.equal(saved.last.via, 'paste');
    const { last } = await (await fetch(`${base}/api/patterns`)).json();
    assert.equal(last.count, 2);
  });
});

test('export and import move the dream diary between computer and phone', async () => {
  await withServer({ env: {} }, async (pcBase) => {
    await json(pcBase, '/api/settings', { apiKey: 'sk-ant-api03-secret-abcdefghij' });
    const { dream } = await (await json(pcBase, '/api/dreams', DREAM)).json();
    await json(pcBase, `/api/dreams/${dream.id}/report`, { text: '【분석심리학】\n## 🔍 꿈 한눈에 보기\n하늘을 나는 꿈은 자유로워지고 싶은 마음일 수 있어요.\n【제목】 하늘 산책' });
    const exported = await (await fetch(`${pcBase}/api/export`)).json();
    assert.equal(exported.app, 'dreamingU');
    assert.equal(exported.dreams.length, 1);
    assert.ok(!JSON.stringify(exported).includes('secret'), 'API 키는 내보내지 않음');

    await withServer({}, async (phoneBase) => {
      // 휴대폰에서 따로 기록한 꿈 + 컴퓨터에서 가져온 꿈
      await json(phoneBase, '/api/dreams', { ...DREAM, text: '바다를 헤엄친 꿈', dreamAtLocal: '2026-11-12T06:00' });
      const r1 = await (await json(phoneBase, '/api/import', { data: exported })).json();
      assert.deepEqual(r1, { added: 1, updated: 0, skipped: 0, removed: 0, total: 2 });
      const r2 = await (await json(phoneBase, '/api/import', { data: exported })).json();
      assert.equal(r2.added, 0, '같은 꿈은 두 번 들어가지 않음');
      const { dreams } = await (await fetch(`${phoneBase}/api/dreams`)).json();
      const moved = dreams.find((d) => d.id === dream.id);
      assert.equal(moved.title, '하늘 산책');
      assert.equal(moved.chart.planets.length, 10, '차트는 다시 계산됨');
      assert.equal(dreams[0].text, '바다를 헤엄친 꿈', '날짜 순서대로');

      // 컴퓨터에서 다시 분석하면 더 새것으로 바뀜
      const newer = structuredClone(exported);
      newer.dreams[0].analyzedAt = new Date(Date.now() + 60000).toISOString();
      newer.dreams[0].title = '다시 본 하늘';
      const r3 = await (await json(phoneBase, '/api/import', { data: newer })).json();
      assert.equal(r3.updated, 1);

      // 잘못된 파일, 이상한 꿈은 거절하거나 건너뜀
      assert.equal((await json(phoneBase, '/api/import', { data: { hello: 1 } })).status, 400);
      const broken = { app: 'dreamingU', dreams: [{ id: '../x', text: 'a', dreamAt: 'x' }, { id: 'ok-1', text: '', dreamAt: '2026-01-01T00:00:00Z' }] };
      const r4 = await (await json(phoneBase, '/api/import', { data: broken })).json();
      assert.equal(r4.skipped, 2);
    });
  });
});

test('my memo is saved per dream, kept when re-analyzed, never sent to Claude, merged on import', async () => {
  let asked;
  const ask = async (args) => { asked = args; return '<분석심리학>\n## 🔍 꿈 한눈에 보기\n하늘을 나는 꿈은 자유로워지고 싶은 마음일 수 있어요.\n</분석심리학>'; };
  await withServer({ ask, env: { ANTHROPIC_API_KEY: 'sk-ant-env-key-123456' } }, async (pc) => {
    const { dream } = await (await json(pc, '/api/dreams', DREAM)).json();
    const saved = await (await json(pc, `/api/dreams/${dream.id}/memo`, { memo: '요즘 이사 준비로 마음이 들떠 있다.' })).json();
    assert.equal(saved.memo, '요즘 이사 준비로 마음이 들떠 있다.');
    assert.ok(saved.memoAt);
    assert.equal((await json(pc, `/api/dreams/${dream.id}/memo`, { memo: 'x'.repeat(10001) })).status, 400);
    assert.equal((await json(pc, '/api/dreams/nope/memo', { memo: 'a' })).status, 404);

    await (await json(pc, `/api/dreams/${dream.id}/analyze`, {})).text();
    assert.ok(!asked.prompt.includes('이사 준비로 마음이 들떠'), '메모는 Claude 에게 보내지 않음');
    let { dreams } = await (await fetch(`${pc}/api/dreams`)).json();
    assert.equal(dreams[0].memo, '요즘 이사 준비로 마음이 들떠 있다.', '다시 분석해도 메모는 그대로');
    assert.ok(dreams[0].analysis);
    const pcExport = await (await fetch(`${pc}/api/export`)).json();
    assert.equal(pcExport.dreams[0].memo, '요즘 이사 준비로 마음이 들떠 있다.');

    await withServer({}, async (phone) => {
      // 휴대폰: 컴퓨터 일기를 가져와서 메모를 고침
      await json(phone, '/api/import', { data: pcExport });
      await new Promise((r) => setTimeout(r, 5));
      await json(phone, `/api/dreams/${dream.id}/memo`, { memo: '휴대폰에서 고친 메모' });
      const phoneExport = await (await fetch(`${phone}/api/export`)).json();
      // 그동안 컴퓨터는 다시 분석
      await new Promise((r) => setTimeout(r, 5));
      await (await json(pc, `/api/dreams/${dream.id}/analyze`, {})).text();
      // 컴퓨터가 휴대폰 일기를 가져오면: 메모는 휴대폰 것, 분석은 컴퓨터의 새 분석이 남아야 함
      const before = (await (await fetch(`${pc}/api/dreams`)).json()).dreams[0];
      const r = await (await json(pc, '/api/import', { data: phoneExport })).json();
      assert.equal(r.updated, 1);
      ({ dreams } = await (await fetch(`${pc}/api/dreams`)).json());
      assert.equal(dreams[0].memo, '휴대폰에서 고친 메모');
      assert.equal(dreams[0].analyzedAt, before.analyzedAt, '컴퓨터의 더 새 분석은 그대로');
    });
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
