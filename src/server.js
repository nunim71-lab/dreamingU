#!/usr/bin/env node
// 꿈탐정 웹 서버: 이 컴퓨터에서만 열리는 작은 서버. 꿈을 기록하고, 별자리 차트를 그리고, Claude 에게 꿈 분석을 맡김.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeChart, localToDate } from './astro.js';
import { DEFAULT_MODEL, DETECTIVE_SYSTEM, PATTERN_SYSTEM, askClaude, buildDreamPrompt, buildPatternPrompt, parseReport } from './claude.js';
import { createStore } from './store.js';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// 빌드 번호: 업데이트할 때마다 package.json 의 build 끝자리를 1씩 올림
export const BUILD = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).build;

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_DREAM_CHARS = 20000;
const PATTERN_LIMIT = 40; // 종합 분석에 보내는 최근 꿈 수

const FILES = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/icon.png': ['icon.png', 'image/png'],
  '/astro.js': ['../src/astro.js', 'text/javascript; charset=utf-8'],
  '/reading.js': ['../src/reading.js', 'text/javascript; charset=utf-8'],
  '/report.js': ['../src/report.js', 'text/javascript; charset=utf-8'],
};

class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    throw new RequestError('요청 형식이 올바르지 않습니다.', 415);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new RequestError('글이 너무 길어요.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new RequestError('요청 형식이 올바르지 않습니다.');
  }
}

function parsePlace(place) {
  const lat = Number(place?.lat);
  const lon = Number(place?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 66 || Math.abs(lon) > 180) {
    throw new RequestError('장소의 위도·경도가 올바르지 않아요. (위도는 -66 ~ 66 사이)');
  }
  return { lat, lon, name: String(place?.name || '').slice(0, 40) };
}

export function makeStats(dreams) {
  const count = (items) => {
    const map = new Map();
    for (const it of items) map.set(it, (map.get(it) || 0) + 1);
    return [...map].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n }));
  };
  const moonOf = (d) => d.chart.planets.find((p) => p.key === 'moon').sign.name;
  return {
    total: dreams.length,
    analyzed: dreams.filter((d) => d.analysis).length,
    keywords: count(dreams.flatMap((d) => d.keywords || [])).slice(0, 15),
    moods: count(dreams.flatMap((d) => d.moods || [])),
    moonSigns: count(dreams.map(moonOf)),
    moonPhases: count(dreams.map((d) => d.chart.moonPhase.name)),
  };
}

function statsText(stats) {
  const fmt = (list) => list.map((x) => `${x.name} ${x.n}번`).join(', ') || '-';
  return `- 자주 나온 상징: ${fmt(stats.keywords)}\n- 꿈속 기분: ${fmt(stats.moods)}\n- 꿈꾼 날 달의 별자리: ${fmt(stats.moonSigns)}\n- 꿈꾼 날 달의 모양: ${fmt(stats.moonPhases)}`;
}

const maskKey = (key) => (key ? `${key.slice(0, 7)}…${key.slice(-4)}` : '');

export async function createServer({ dataDir = path.join(ROOT, 'data'), ask = askClaude, env = process.env } = {}) {
  const store = createStore(dataDir);
  let dreams = await store.loadDreams();
  let settings = await store.loadSettings();
  const apiKey = () => settings.apiKey || env.ANTHROPIC_API_KEY || '';
  const model = () => settings.model || DEFAULT_MODEL;
  const sortDreams = () => dreams.sort((a, b) => b.dreamAt.localeCompare(a.dreamAt));
  const findDream = (id) => {
    const dream = dreams.find((d) => d.id === id);
    if (!dream) throw new RequestError('그 꿈 기록을 찾을 수 없어요.', 404);
    return dream;
  };

  // Claude 의 글을 브라우저로 흘려보냄 (글자 그대로). 실패하면 마지막에 \u0000오류 표시를 붙임
  // onDone(전체 글) 은 응답을 닫기 전에 실행: 브라우저가 다시 불러올 때 이미 저장되어 있게
  async function stream(res, system, prompt, onDone) {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    try {
      const text = await ask({ apiKey: apiKey(), model: model(), system, prompt, signal: controller.signal, onText: (t) => res.write(t) });
      await onDone(text);
    } catch (err) {
      if (err.name !== 'AbortError') res.write(`\u0000${err.message}`);
    } finally {
      res.end();
    }
  }

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      // 다른 웹사이트가 몰래 이 서버에 요청하지 못하게
      const origin = req.headers.origin;
      if (req.method !== 'GET' && origin && new URL(origin).host !== req.headers.host) {
        throw new RequestError('허용되지 않은 요청입니다.', 403);
      }

      if (req.method === 'GET' && FILES[url.pathname]) {
        const [name, type] = FILES[url.pathname];
        res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
        return res.end(await readFile(path.join(ROOT, 'public', name)));
      }

      if (req.method === 'GET' && url.pathname === '/api/status') {
        return sendJson(res, 200, {
          build: BUILD,
          hasKey: Boolean(apiKey()),
          keyFromEnv: !settings.apiKey && Boolean(env.ANTHROPIC_API_KEY),
          maskedKey: maskKey(settings.apiKey || ''),
          model: model(),
          place: settings.place || null,
          tzOffset: settings.tzOffset ?? 9,
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/settings') {
        const body = await readJson(req);
        const next = { ...settings };
        if (typeof body.apiKey === 'string') {
          const key = body.apiKey.trim();
          if (key && !/^sk-ant-[\w-]{10,}$/.test(key)) throw new RequestError('API 키 모양이 이상해요. sk-ant- 로 시작하는 키 전체를 붙여 넣어 주세요.');
          next.apiKey = key;
        }
        if (body.place) next.place = parsePlace(body.place);
        if (body.tzOffset !== undefined) {
          const tz = Number(body.tzOffset);
          if (!Number.isFinite(tz) || tz < -12 || tz > 14) throw new RequestError('시간대가 올바르지 않아요.');
          next.tzOffset = tz;
        }
        settings = next;
        await store.saveSettings(settings);
        return sendJson(res, 200, { ok: true });
      }

      if (req.method === 'GET' && url.pathname === '/api/dreams') {
        return sendJson(res, 200, { dreams });
      }

      if (req.method === 'POST' && url.pathname === '/api/dreams') {
        const body = await readJson(req);
        const text = String(body.text || '').trim();
        if (!text) throw new RequestError('꿈 내용을 적어 주세요.');
        if (text.length > MAX_DREAM_CHARS) throw new RequestError(`꿈 내용이 너무 길어요 (최대 ${MAX_DREAM_CHARS.toLocaleString()}자).`);
        const tzOffset = Number(body.tzOffset ?? 9);
        if (!Number.isFinite(tzOffset) || tzOffset < -12 || tzOffset > 14) throw new RequestError('시간대가 올바르지 않아요.');
        const when = localToDate(body.dreamAtLocal, tzOffset);
        if (!when || when.getUTCFullYear() < 1900 || when.getUTCFullYear() > 2099) throw new RequestError('꿈꾼 날짜와 시간을 확인해 주세요 (1900~2099년).');
        const place = parsePlace(body.place);
        const dream = {
          id: randomUUID(),
          text,
          note: String(body.note || '').trim().slice(0, 2000),
          moods: Array.isArray(body.moods) ? body.moods.map(String).slice(0, 10) : [],
          dreamAtLocal: String(body.dreamAtLocal).slice(0, 16),
          tzOffset,
          dreamAt: when.toISOString(),
          recordedAt: new Date().toISOString(),
          chart: computeChart(when, place),
          title: '',
          keywords: [],
          analysis: '',
          skyAnalysis: '',
        };
        dreams.push(dream);
        sortDreams();
        await store.saveDreams(dreams);
        return sendJson(res, 200, { dream });
      }

      const m = /^\/api\/dreams\/([\w-]+)(\/analyze)?$/.exec(url.pathname);
      if (m && req.method === 'DELETE' && !m[2]) {
        findDream(m[1]);
        dreams = dreams.filter((d) => d.id !== m[1]);
        await store.saveDreams(dreams);
        return sendJson(res, 200, { ok: true });
      }

      if (m && req.method === 'POST' && m[2]) {
        await readJson(req);
        const dream = findDream(m[1]);
        if (!apiKey()) throw new RequestError('Claude API 키가 아직 없어요. ⚙️ 설정에서 먼저 넣어 주세요.');
        return stream(res, DETECTIVE_SYSTEM, buildDreamPrompt(dream, dreams), async (text) => {
          const { psych, sky, title, keywords } = parseReport(text);
          Object.assign(dream, { analysis: psych, skyAnalysis: sky, title: title || dream.title, keywords: keywords.length ? keywords : dream.keywords, analyzedAt: new Date().toISOString() });
          await store.saveDreams(dreams);
        });
      }

      if (req.method === 'GET' && url.pathname === '/api/patterns') {
        return sendJson(res, 200, { stats: makeStats(dreams), last: settings.lastPattern || null });
      }

      if (req.method === 'POST' && url.pathname === '/api/patterns') {
        await readJson(req);
        if (dreams.length < 2) throw new RequestError('꿈이 2개 이상 모이면 종합 분석을 할 수 있어요.');
        if (!apiKey()) throw new RequestError('Claude API 키가 아직 없어요. ⚙️ 설정에서 먼저 넣어 주세요.');
        const recent = dreams.slice(0, PATTERN_LIMIT).reverse();
        return stream(res, PATTERN_SYSTEM, buildPatternPrompt(recent, statsText(makeStats(recent))), async (text) => {
          settings = { ...settings, lastPattern: { text: text.trim(), at: new Date().toISOString(), count: recent.length } };
          await store.saveSettings(settings);
        });
      }

      throw new RequestError('없는 페이지입니다.', 404);
    } catch (err) {
      if (res.headersSent) return res.end();
      const status = err.status || 500;
      if (status === 500) console.error(err);
      sendJson(res, status, { error: status === 500 ? `문제가 생겼어요: ${err.message}` : err.message });
    }
  });
}

function findChrome() {
  if (process.platform !== 'win32') return null;
  const bases = [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
  for (const base of bases) {
    const p = path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe');
    if (existsSync(p)) return p;
  }
  return null;
}

function openBrowser(address) {
  if (process.env.OPEN_BROWSER !== '1') return;
  const chrome = findChrome();
  const opener = chrome ? [chrome, [`--app=${address}`, '--window-size=1100,820']]
    : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', address]]
    : process.platform === 'darwin' ? ['open', [address]] : ['xdg-open', [address]];
  spawn(opener[0], opener[1], { stdio: 'ignore', detached: true }).on('error', () => {}).unref();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3100);
  const host = '127.0.0.1'; // 이 컴퓨터에서만 열림 (꿈은 개인적인 기록이니까)
  const address = `http://${host}:${port}`;
  const server = await createServer();
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`꿈탐정이 이미 켜져 있어요. 브라우저에서 ${address} 를 열어 주세요.`);
      openBrowser(address);
      setTimeout(() => process.exit(0), 1500);
    } else {
      console.error(err);
      process.exit(1);
    }
  });
  server.listen(port, host, () => {
    console.log(`꿈탐정 부엉 (빌드 ${BUILD}) 실행 중: ${address}`);
    console.log('이 창을 닫으면 꿈탐정도 꺼집니다.');
    openBrowser(address);
  });
}

