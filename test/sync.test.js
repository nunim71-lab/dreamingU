import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../docs/js/app.js';
import { SYNC_FILE, SyncError, checkConfig, lock, syncOnce, unlock } from '../docs/js/sync.js';

const REPO = 'me/dreamingU-diary';
const TOKEN = 'github_pat_abcdefghijklmnopqrstuvwxyz0123';

// 깃허브 흉내: 저장소 하나, 파일 하나
function fakeGithub({ repoExists = true } = {}) {
  const gh = { file: null, sha: 0, writes: 0, conflictOnce: false, status: null, log: [] };
  gh.fetch = async (url, init) => {
    gh.log.push(`${init.method} ${url}`);
    assert.equal(init.headers.Authorization, `Bearer ${TOKEN}`);
    if (gh.status) return new Response('{}', { status: gh.status });
    const fileUrl = `https://api.github.com/repos/${REPO}/contents/${SYNC_FILE}`;
    if (url === `https://api.github.com/repos/${REPO}`) return new Response('{}', { status: repoExists ? 200 : 404 });
    if (url !== fileUrl) return new Response('{}', { status: 404 });
    if (!repoExists) return new Response('{}', { status: 404 });
    if (init.method === 'GET') {
      if (!gh.file) return new Response('{}', { status: 404 });
      return Response.json({ sha: `s${gh.sha}`, encoding: 'base64', content: gh.file.replace(/(.{60})/g, '$1\n') });
    }
    if (init.method === 'PUT') {
      const body = JSON.parse(init.body);
      if (gh.conflictOnce) { gh.conflictOnce = false; gh.sha++; return new Response('{}', { status: 409 }); }
      if (gh.file && body.sha !== `s${gh.sha}`) return new Response('{}', { status: 409 });
      if (!gh.file && body.sha) return new Response('{}', { status: 422 });
      gh.file = body.content; gh.sha++; gh.writes++;
      return Response.json({ content: { sha: `s${gh.sha}` } });
    }
    return new Response('{}', { status: 405 });
  };
  return gh;
}

// 기기 하나 흉내: 휴대폰 버전과 똑같은 두뇌 + 메모리 저장소
async function device() {
  const mem = { dreams: [], settings: {} };
  const store = {
    loadDreams: async () => structuredClone(mem.dreams), saveDreams: async (d) => { mem.dreams = structuredClone(d); },
    loadSettings: async () => structuredClone(mem.settings), saveSettings: async (s) => { mem.settings = structuredClone(s); },
  };
  const app = await createApp({ store, build: 'test', mode: 'local' });
  const api = async (path, options = {}) => (await app.handle(options.method || 'GET', path, options.body ? JSON.parse(options.body) : {})).json;
  const add = (text, when) => api('/api/dreams', { method: 'POST', body: JSON.stringify({ text, dreamAtLocal: when, tzOffset: 9, place: { name: '여주', lat: 37.2983, lon: 127.6372 } }) });
  return { api, add, list: async () => (await api('/api/dreams')).dreams };
}
const config = { token: TOKEN, repo: REPO, passphrase: '부엉이 비밀번호 123' };
const tick = () => new Promise((r) => setTimeout(r, 3));

test('phone and computer keep the same diary through the encrypted vault', async () => {
  const gh = fakeGithub();
  const phone = await device();
  const pc = await device();
  const sync = (dev) => syncOnce({ api: dev.api, config, fetchImpl: gh.fetch });

  const { dream: whale } = await phone.add('고래 등을 타고 밤바다를 건넜어요', '2026-11-19T06:30');
  const { dream: stairs } = await phone.add('끝없는 계단을 내려갔어요', '2026-11-18T07:00');
  let r = await sync(phone);
  assert.equal(r.pushed, true);
  assert.equal(r.total, 2);

  // 보관함에는 꿈 내용이 그대로 보이지 않음 (잠겨 있음)
  const stored = Buffer.from(gh.file, 'base64').toString('utf8');
  assert.ok(!stored.includes('고래') && !stored.includes('계단'));
  assert.match(stored, /encrypted-diary/);

  // 컴퓨터: 처음 맞추면 휴대폰 꿈이 들어옴
  r = await sync(pc);
  assert.equal(r.pulled.added, 2);
  assert.equal(r.pushed, false, '바뀐 게 없으면 깃허브에 쓰지 않음');
  assert.deepEqual((await pc.list()).map((d) => d.text), ['고래 등을 타고 밤바다를 건넜어요', '끝없는 계단을 내려갔어요']);
  assert.equal((await pc.list())[0].chart.planets.length, 10, '차트는 받은 쪽에서 다시 계산');

  // 컴퓨터에서 메모를 쓰고 한 꿈을 지움 → 휴대폰에 그대로 반영
  await tick();
  await pc.api(`/api/dreams/${whale.id}/memo`, { method: 'POST', body: JSON.stringify({ memo: '새 출발을 응원받는 느낌' }) });
  await pc.api(`/api/dreams/${stairs.id}`, { method: 'DELETE' });
  r = await sync(pc);
  assert.equal(r.pushed, true);
  r = await sync(phone);
  assert.equal(r.pulled.removed, 1);
  const phoneDreams = await phone.list();
  assert.deepEqual(phoneDreams.map((d) => d.id), [whale.id], '지운 꿈은 휴대폰에서도 지워짐');
  assert.equal(phoneDreams[0].memo, '새 출발을 응원받는 느낌');

  // 휴대폰이 아직 옛 꿈을 가진 채 다른 꿈을 추가해도, 지운 꿈은 되살아나지 않음
  await phone.add('하늘을 나는 꿈', '2026-11-20T05:00');
  await sync(phone);
  r = await sync(pc);
  assert.deepEqual((await pc.list()).map((d) => d.text), ['하늘을 나는 꿈', '고래 등을 타고 밤바다를 건넜어요']);

  // 아무것도 안 바꾸고 다시 맞추면 깃허브에 쓰지 않음
  const writes = gh.writes;
  await sync(phone); await sync(pc);
  assert.equal(gh.writes, writes);
});

test('retries when another device saved first, and explains problems', async () => {
  const gh = fakeGithub();
  const phone = await device();
  await phone.add('꿈 하나', '2026-11-19T06:30');
  await syncOnce({ api: phone.api, config, fetchImpl: gh.fetch });
  await phone.add('꿈 둘', '2026-11-20T06:30');
  gh.conflictOnce = true;
  const r = await syncOnce({ api: phone.api, config, fetchImpl: gh.fetch });
  assert.equal(r.pushed, true);

  await assert.rejects(syncOnce({ api: phone.api, config: { ...config, passphrase: '틀린 비밀번호입니다' }, fetchImpl: gh.fetch }), /동기화 비밀번호가 맞지 않아요/);
  gh.status = 401;
  await assert.rejects(syncOnce({ api: phone.api, config, fetchImpl: gh.fetch }), /열쇠\(토큰\)가 맞지 않거나/);
  gh.status = 403;
  await assert.rejects(syncOnce({ api: phone.api, config, fetchImpl: gh.fetch }), /Read and write/);
  const missing = fakeGithub({ repoExists: false });
  await assert.rejects(syncOnce({ api: phone.api, config, fetchImpl: missing.fetch }), /저장소 "me\/dreamingU-diary" 를 찾을 수 없어요/);
  await assert.rejects(syncOnce({ api: phone.api, config, fetchImpl: async () => { throw new TypeError('offline'); } }), /인터넷 연결/);
});

test('lock/unlock round trip and setting checks', async () => {
  const box = await lock({ hello: '꿈' }, 'password-1234');
  assert.deepEqual(await unlock(box, 'password-1234'), { hello: '꿈' });
  await assert.rejects(unlock(box, 'password-9999'), SyncError);
  assert.doesNotThrow(() => checkConfig(config));
  assert.throws(() => checkConfig({ ...config, repo: 'dreamingU-diary' }), /아이디\/저장소이름/);
  assert.throws(() => checkConfig({ ...config, token: 'abc' }), /github_pat_/);
  assert.throws(() => checkConfig({ ...config, passphrase: '1234' }), /8글자/);
});
