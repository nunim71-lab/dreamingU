// 꿈꾸는부엉이 휴대폰(브라우저) 버전: 꿈 일기와 설정을 이 휴대폰 안(브라우저의 IndexedDB)에 저장하고,
// 컴퓨터 버전과 똑같은 두뇌(app.js)로 처리함. 서버 없이 화면 혼자 움직임.
import { createApp } from './app.js';

const DB_NAME = 'dreamingU';
const TABLE = 'kv';

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(TABLE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// IndexedDB 를 못 쓰는 브라우저(아주 오래된 것, 일부 비공개 창)는 localStorage 로
async function createKv() {
  try {
    const db = await openDb();
    const run = (mode, fn) => new Promise((resolve, reject) => {
      const tx = db.transaction(TABLE, mode);
      const req = fn(tx.objectStore(TABLE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('저장하지 못했어요. 휴대폰 저장 공간을 확인해 주세요.'));
    });
    return {
      get: async (key, fallback) => (await run('readonly', (s) => s.get(key))) ?? fallback,
      set: (key, value) => run('readwrite', (s) => s.put(value, key)),
    };
  } catch {
    return {
      get: async (key, fallback) => {
        try { return JSON.parse(localStorage.getItem(`${DB_NAME}:${key}`)) ?? fallback; } catch { return fallback; }
      },
      set: async (key, value) => {
        try { localStorage.setItem(`${DB_NAME}:${key}`, JSON.stringify(value)); } catch { throw new Error('저장하지 못했어요. 휴대폰 저장 공간을 확인해 주세요.'); }
      },
    };
  }
}

export async function createLocalBackend(build) {
  // 브라우저가 공간이 모자랄 때 꿈 일기를 마음대로 지우지 않도록 부탁
  try { await navigator.storage?.persist?.(); } catch { /* 지원 안 하면 그냥 넘어감 */ }
  const kv = await createKv();
  const store = {
    loadDreams: () => kv.get('dreams', []),
    saveDreams: (dreams) => kv.set('dreams', dreams),
    loadSettings: () => kv.get('settings', {}),
    saveSettings: (settings) => kv.set('settings', settings),
  };
  const app = await createApp({ store, build, mode: 'local' });
  return {
    // 컴퓨터 버전의 /api/... 요청과 똑같이 받아서 처리
    async request(method, path, body = {}) {
      const result = await app.handle(method, path, body);
      return result.json;
    },
    // Claude 의 글을 받는 대로 onText(지금까지의 글) 로 넘기고, 끝나면 전체 글을 돌려줌
    async stream(path, onText) {
      const result = await app.handle('POST', path, {});
      let text = '';
      await app.runStream(result.stream, (t) => { text += t; onText(text); });
      return text;
    },
  };
}
