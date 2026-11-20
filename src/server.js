#!/usr/bin/env node
// 꿈꾸는부엉이 컴퓨터 버전: 이 컴퓨터에서만 열리는 작은 서버. 화면은 docs 폴더(휴대폰 버전과 같은 화면),
// 꿈 일기는 data 폴더에 저장. 꿈 저장·분석 같은 두뇌는 docs/js/app.js 를 휴대폰 버전과 함께 씀.
import http from 'node:http';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RequestError, createApp } from '../docs/js/app.js';
import { askClaude } from '../docs/js/claude.js';
import { createStore } from './store.js';

export const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'docs');
// 빌드 번호: 업데이트할 때마다 package.json 의 build 를 올림 (1.10 → 1.11 …)
export const BUILD = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).build;

const MAX_BODY_BYTES = 1024 * 1024;
const MAX_IMPORT_BYTES = 50 * 1024 * 1024; // 꿈 일기 가져오기 파일

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function readJson(req, limit = MAX_BODY_BYTES) {
  if (!String(req.headers['content-type'] || '').includes('application/json')) {
    throw new RequestError('요청 형식이 올바르지 않습니다.', 415);
  }
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new RequestError(limit > MAX_BODY_BYTES ? '파일이 너무 커요.' : '글이 너무 길어요.', 413);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new RequestError('요청 형식이 올바르지 않습니다.');
  }
}

// docs 폴더의 화면 파일만 내보냄 (sw.js 는 휴대폰 버전 전용이라 컴퓨터에서는 쓰지 않음)
function staticFile(pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  if (rel === 'sw.js' || !/^[\w./-]+$/.test(rel) || rel.split('/').some((part) => part === '..' || part.startsWith('.'))) return null;
  const type = TYPES[path.extname(rel)];
  return type ? { file: path.join(WEB, rel), type } : null;
}

export async function createServer({ dataDir = path.join(ROOT, 'data'), ask = askClaude, env = process.env, onShutdown = () => {} } = {}) {
  const app = await createApp({ store: createStore(dataDir), ask, envKey: env.ANTHROPIC_API_KEY || '', build: BUILD, mode: 'server' });

  // Claude 의 글을 브라우저로 흘려보냄 (글자 그대로). 실패하면 마지막에 \u0000오류 표시를 붙임
  // 저장(onDone)은 응답을 닫기 전에 끝냄: 브라우저가 다시 불러올 때 이미 저장되어 있게
  async function stream(res, job) {
    const controller = new AbortController();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    try {
      await app.runStream(job, (t) => res.write(t), controller.signal);
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

      if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
        const found = staticFile(url.pathname);
        if (!found) throw new RequestError('없는 페이지입니다.', 404);
        let data;
        try { data = await readFile(found.file); } catch { throw new RequestError('없는 페이지입니다.', 404); }
        res.writeHead(200, { 'Content-Type': found.type, 'Cache-Control': 'no-cache' });
        return res.end(data);
      }

      // 새 버전이 켜질 때 예전 꿈꾸는부엉이를 끄라고 부탁함 (1.9부터)
      if (req.method === 'POST' && url.pathname === '/api/shutdown') {
        await readJson(req);
        sendJson(res, 200, { ok: true, build: BUILD });
        res.on('finish', () => setTimeout(onShutdown, 100));
        return;
      }

      const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await readJson(req, url.pathname === '/api/import' ? MAX_IMPORT_BYTES : MAX_BODY_BYTES);
      const result = await app.handle(req.method, url.pathname, body);
      if (result.stream) return stream(res, result.stream);
      return sendJson(res, 200, result.json);
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

// 이미 3100번에 무언가 켜져 있을 때: 같은 빌드면 그 화면을 열고, 예전 빌드면 끄고 새 버전으로 바꿔 켬
async function takeOver(address) {
  let running = null;
  try { running = await (await fetch(`${address}/api/status`)).json(); } catch { /* 꿈꾸는부엉이가 아님 */ }
  if (!running?.build) return { action: 'foreign' };
  if (running.build === BUILD) return { action: 'same' };
  try {
    const res = await fetch(`${address}/api/shutdown`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    if (res.ok) return { action: 'replaced', old: running.build };
  } catch { /* 예전 버전은 끄는 기능이 없음 */ }
  return { action: 'old', old: running.build };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 3100);
  const host = '127.0.0.1'; // 이 컴퓨터에서만 열림 (꿈은 개인적인 기록이니까)
  const address = `http://${host}:${port}`;
  let server;
  server = await createServer({ onShutdown: () => { console.log('새 버전 꿈꾸는부엉이가 켜져서 이 창은 닫혀요.'); server.close(); process.exit(0); } });
  let retried = false;
  server.once('listening', () => {
    console.log(`꿈꾸는부엉이 (빌드 ${BUILD}) 실행 중: ${address}`);
    console.log('이 창을 닫으면 꿈꾸는부엉이도 꺼집니다.');
    openBrowser(address);
  });
  const listen = () => server.listen(port, host);
  server.on('error', async (err) => {
    if (err.code !== 'EADDRINUSE' || retried) {
      if (err.code === 'EADDRINUSE') console.log('예전 꿈꾸는부엉이가 아직 꺼지지 않았어요. 잠시 뒤 부엉 아이콘을 다시 눌러 주세요.');
      else console.error(err);
      process.exit(1);
    }
    const result = await takeOver(address);
    if (result.action === 'same') {
      console.log(`꿈꾸는부엉이가 이미 켜져 있어요. 브라우저에서 ${address} 를 열어 주세요.`);
      openBrowser(address);
      setTimeout(() => process.exit(0), 1500);
    } else if (result.action === 'replaced') {
      console.log(`예전 꿈꾸는부엉이(빌드 ${result.old})을 끄고 새 버전(빌드 ${BUILD})으로 켤게요…`);
      retried = true;
      setTimeout(listen, 1000);
    } else if (result.action === 'old') {
      console.log(`예전 꿈꾸는부엉이(빌드 ${result.old})이 아직 켜져 있어요.`);
      console.log('작업 표시줄에서 예전 꿈꾸는부엉이의 검은 창을 찾아 닫은 뒤, 부엉 아이콘을 다시 눌러 주세요.');
      console.log('(창을 못 찾겠으면 컴퓨터를 다시 시작해도 돼요)');
      openBrowser(address); // 같은 폴더에 덮어썼다면 화면 위쪽에도 안내가 보임
      setTimeout(() => process.exit(1), 1500);
    } else {
      console.log(`${port}번 주소를 다른 프로그램이 쓰고 있어요. 컴퓨터를 다시 시작한 뒤 꿈꾸는부엉이를 켜 주세요.`);
      process.exit(1);
    }
  });
  listen();
}
