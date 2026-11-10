import { test } from 'node:test';
import assert from 'node:assert/strict';
import { askClaude, buildDreamPrompt, splitAnalysis } from '../src/claude.js';
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

test('splitAnalysis pulls out the title and keywords', () => {
  const r = splitAnalysis('## 🔍 사건 개요\n본문입니다.\n\n<제목>끝없는 계단</제목>\n<키워드>계단, 물, #어머니, 물</키워드>');
  assert.equal(r.body, '## 🔍 사건 개요\n본문입니다.');
  assert.equal(r.title, '끝없는 계단');
  assert.deepEqual(r.keywords, ['계단', '물', '어머니']);
  assert.deepEqual(splitAnalysis('그냥 글').keywords, []);
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
