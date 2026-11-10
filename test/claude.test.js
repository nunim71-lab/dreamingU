import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DETECTIVE_SYSTEM, askClaude, buildDreamPrompt, parseReport } from '../src/claude.js';
import { computeChart } from '../src/astro.js';

const sse = (events) => {
  const body = events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
  // 일부러 잘게 쪼개서 보냄 (줄 중간에서 끊겨도 잘 이어 붙이는지)
  const bytes = new TextEncoder().encode(body);
  return new ReadableStream({
    start(c) { for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7)); c.close(); },
  });
};
const delta = (text) => ({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text } });

test('streams text pieces and sends the expected request', async () => {
  let sent;
  const pieces = [];
  const fetchImpl = async (url, init) => {
    sent = { url, init, body: JSON.parse(init.body) };
    return new Response(sse([{ type: 'message_start' }, delta('안녕'), delta('하세요 '), delta('꿈탐정'), { type: 'message_delta', delta: { stop_reason: 'end_turn' } }, { type: 'message_stop' }]), { status: 200 });
  };
  const text = await askClaude({ apiKey: 'sk-ant-test', system: 'S', prompt: 'P', fetchImpl, onText: (t) => pieces.push(t) });
  assert.equal(text, '안녕하세요 꿈탐정');
  assert.deepEqual(pieces, ['안녕', '하세요 ', '꿈탐정']);
  assert.equal(sent.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(sent.init.headers['x-api-key'], 'sk-ant-test');
  assert.equal(sent.body.model, 'claude-opus-5-5');
  assert.equal(sent.body.stream, true);
  assert.equal(sent.body.fallbacks, 'default');
  assert.equal(sent.body.temperature, undefined);
  assert.deepEqual(sent.body.messages, [{ role: 'user', content: 'P' }]);
});

test('turns API errors and refusals into friendly Korean messages', async () => {
  const bad = (status, message) => async () => new Response(JSON.stringify({ error: { message } }), { status });
  await assert.rejects(askClaude({ apiKey: 'k', system: '', prompt: '', fetchImpl: bad(401, 'invalid x-api-key') }), /API 키가 맞지 않아요/);
  await assert.rejects(askClaude({ apiKey: 'k', system: '', prompt: '', fetchImpl: bad(400, 'Your credit balance is too low') }), /크레딧/);
  await assert.rejects(askClaude({ apiKey: '', system: '', prompt: '' }), /API 키가 아직 없어요/);
  const refusal = async () => new Response(sse([{ type: 'message_delta', delta: { stop_reason: 'refusal' } }]), { status: 200 });
  await assert.rejects(askClaude({ apiKey: 'k', system: '', prompt: '', fetchImpl: refusal }), /사양/);
});

const FULL = '<분석심리학>\n## 🔍 꿈 한눈에 보기\n계단을 내려가는 꿈이에요.\n</분석심리학>\n<천궁도>\n## 🌙 그날 밤의 달\n달이 물고기자리에 있었어요.\n</천궁도>\n<제목>끝없는 계단</제목>\n<키워드>계단, 물, #어머니, 물</키워드>';

test('parseReport splits the psychology and chart readings apart', () => {
  const r = parseReport(FULL);
  assert.equal(r.psych, '## 🔍 꿈 한눈에 보기\n계단을 내려가는 꿈이에요.');
  assert.equal(r.sky, '## 🌙 그날 밤의 달\n달이 물고기자리에 있었어요.');
  assert.equal(r.title, '끝없는 계단');
  assert.deepEqual(r.keywords, ['계단', '물', '어머니']);
});

test('parseReport works on half-written text while streaming', () => {
  // 글이 한 글자씩 올 때마다 나눠 봐도 꼬리표가 화면에 새어 나오지 않아야 함
  for (let i = 0; i <= FULL.length; i++) {
    const r = parseReport(FULL.slice(0, i));
    assert.ok(!/[<>]/.test(r.psych + r.sky), `at ${i}: ${JSON.stringify(r)}`);
  }
  const mid = parseReport(FULL.slice(0, FULL.indexOf('</분석심리학>') + 3));
  assert.equal(mid.psych, '## 🔍 꿈 한눈에 보기\n계단을 내려가는 꿈이에요.');
  assert.equal(mid.sky, '');
});

test('parseReport keeps untagged text as the psychology reading', () => {
  assert.deepEqual(parseReport('그냥 글\n<제목>이름</제목>'), { psych: '그냥 글', sky: '', title: '이름', keywords: [] });
});

test('the detective is told to write plainly and keep the two readings apart', () => {
  assert.match(DETECTIVE_SYSTEM, /쉬운 말/);
  assert.match(DETECTIVE_SYSTEM, /<분석심리학>[\s\S]*<\/분석심리학>[\s\S]*<천궁도>[\s\S]*<\/천궁도>/);
  assert.match(DETECTIVE_SYSTEM, /별자리 이야기는 여기에 넣지 않습니다/);
});

test('dream prompt includes the dream, moods, chart and recent dreams', () => {
  const chart = computeChart(new Date(Date.UTC(2026, 10, 9, 22, 30)), { lat: 37.5665, lon: 126.978, name: '서울' });
  const dream = { id: 'a', text: '계단을 내려갔다', note: '이사 준비 중', moods: ['😰 불안'], dreamAtLocal: '2026-11-10T07:30', tzOffset: 9, chart };
  const prompt = buildDreamPrompt(dream, [dream, { id: 'b', title: '바다의 집', keywords: ['바다'], dreamAtLocal: '2026-11-01T06:00' }]);
  assert.match(prompt, /계단을 내려갔다/);
  assert.match(prompt, /이사 준비 중/);
  assert.match(prompt, /😰 불안/);
  assert.match(prompt, /2026-11-10 07:30 \(UTC\+9\)/);
  assert.match(prompt, /- 달: /);
  assert.match(prompt, /「바다의 집」/);
});
