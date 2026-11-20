// 꿈꾸는부엉이 자동 동기화: 꿈 일기를 동기화 비밀번호로 잠가서(암호화) 사용자의 깃허브 비공개 저장소에 보관하고,
// 기기마다 열 때·저장할 때 그 보관함과 맞춤. 깃허브(와 혹시 저장소를 본 사람)는 내용을 읽을 수 없음.
// 서버 없이 브라우저가 직접 깃허브와 이야기함. (컴퓨터 버전 화면에서도 똑같이 씀)

export const SYNC_FILE = 'dreamingU-diary.enc.json';
const KDF_ITERATIONS = 250000;
const enc = new TextEncoder();
const dec = new TextDecoder();

export class SyncError extends Error {}

function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const unb64 = (str) => Uint8Array.from(atob(String(str).replace(/\s/g, '')), (c) => c.charCodeAt(0));

async function pipe(bytes, stream) {
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
}
const gzip = (bytes) => pipe(bytes, new CompressionStream('gzip'));
const gunzip = (bytes) => pipe(bytes, new DecompressionStream('gzip'));

async function deriveKey(passphrase, salt, iterations) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

/** 꿈 일기를 동기화 비밀번호로 잠근 상자 */
export async function lock(data, passphrase) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt, KDF_ITERATIONS);
  const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, await gzip(enc.encode(JSON.stringify(data)))));
  return {
    app: 'dreamingU', kind: 'encrypted-diary', v: 1,
    kdf: { name: 'PBKDF2-SHA256', iterations: KDF_ITERATIONS, salt: b64(salt) },
    cipher: 'AES-256-GCM+gzip', iv: b64(iv), data: b64(sealed),
  };
}

export async function unlock(box, passphrase) {
  if (box?.kind !== 'encrypted-diary' || box.v !== 1) throw new SyncError('보관함 파일 모양이 이상해요. 꿈꾸는부엉이가 만든 보관함인지 확인해 주세요.');
  const key = await deriveKey(passphrase, unb64(box.kdf.salt), Number(box.kdf.iterations));
  let plain;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(box.iv) }, key, unb64(box.data));
  } catch {
    throw new SyncError('동기화 비밀번호가 맞지 않아요. 다른 기기에서 정한 비밀번호와 똑같이 넣어 주세요.');
  }
  return JSON.parse(dec.decode(await gunzip(new Uint8Array(plain))));
}

// 깃허브 저장소의 보관함 파일 읽기·쓰기
export function githubVault({ token, repo, fetchImpl = (...a) => fetch(...a) }) {
  const base = `https://api.github.com/repos/${repo}`;
  const call = async (url, method, accept, body) => {
    try {
      return await fetchImpl(url, {
        method,
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: accept,
          'X-GitHub-Api-Version': '2022-11-28',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new SyncError('깃허브에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
    }
  };
  const explain = (res) => {
    if (res.status === 401) return new SyncError('깃허브 열쇠(토큰)가 맞지 않거나 기한이 지났어요. 새 열쇠를 만들어 ⚙️ 설정에 다시 넣어 주세요.');
    if (res.status === 403) return new SyncError('이 열쇠로는 보관함 저장소에 쓸 수 없어요. 열쇠를 만들 때 그 저장소를 고르고, Contents 권한을 "Read and write" 로 했는지 확인해 주세요. (잠깐 너무 자주 요청해도 이렇게 나와요)');
    return new SyncError(`깃허브가 요청을 받지 못했어요 (${res.status}). 잠시 뒤 다시 해 주세요.`);
  };
  const fileUrl = `${base}/contents/${SYNC_FILE}`;
  return {
    /** 보관함 읽기: 없으면 null */
    async read() {
      const res = await call(fileUrl, 'GET', 'application/vnd.github+json');
      if (res.status === 404) {
        const repoRes = await call(base, 'GET', 'application/vnd.github+json');
        if (repoRes.status === 404) throw new SyncError(`저장소 "${repo}" 를 찾을 수 없어요. 저장소 이름과, 열쇠를 만들 때 이 저장소를 골랐는지 확인해 주세요.`);
        if (!repoRes.ok) throw explain(repoRes);
        return null; // 저장소는 있는데 아직 보관함이 없음 (처음)
      }
      if (!res.ok) throw explain(res);
      const meta = await res.json();
      let text;
      if (meta.encoding === 'base64' && meta.content) {
        text = dec.decode(unb64(meta.content));
      } else {
        // 파일이 크면 내용이 비어서 옴 → 원본 그대로 다시 받기
        const raw = await call(fileUrl, 'GET', 'application/vnd.github.raw+json');
        if (!raw.ok) throw explain(raw);
        text = await raw.text();
      }
      let box;
      try { box = JSON.parse(text); } catch { throw new SyncError('보관함 파일이 깨져 있어요.'); }
      return { sha: meta.sha, box };
    },
    /** 보관함 쓰기: 그사이 다른 기기가 먼저 썼으면 { conflict: true } */
    async write(box, sha) {
      const res = await call(fileUrl, 'PUT', 'application/vnd.github+json', {
        message: `꿈 일기 동기화 (${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)`,
        content: b64(enc.encode(JSON.stringify(box))),
        ...(sha ? { sha } : {}),
      });
      if (res.status === 409 || res.status === 422) return { conflict: true };
      if (!res.ok) throw explain(res);
      return { sha: (await res.json())?.content?.sha };
    },
  };
}

// 동기화할 꿈 일기: 차트는 빼서(받은 쪽에서 날짜·장소로 다시 계산) 작게
function compact(data) {
  return {
    app: data.app,
    dreams: data.dreams.map((d) => ({ ...d, chart: { place: d.chart.place } })),
    deleted: data.deleted || {},
    lastPattern: data.lastPattern || null,
  };
}

// 키 순서와 상관없이 같은 내용이면 같은 글자가 되게 (바뀐 게 없으면 깃허브에 쓰지 않으려고)
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter((k) => value[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
const fingerprint = (data) => stable({ ...data, dreams: [...data.dreams].sort((a, b) => a.id.localeCompare(b.id)) });

/**
 * 한 번 맞추기: 보관함을 받아 이 기기에 합치고 → 합친 결과가 보관함과 다르면 잠가서 올림
 * @param {Function} api  화면의 api(path, options) (컴퓨터·휴대폰 버전 모두)
 * @param {{token, repo, passphrase}} config
 * @returns {{ pulled: object|null, pushed: boolean, total: number }}
 */
export async function syncOnce({ api, config, fetchImpl }) {
  const vault = githubVault({ token: config.token, repo: config.repo, fetchImpl });
  for (let attempt = 0; attempt < 3; attempt++) {
    const remote = await vault.read();
    let remoteData = null;
    let pulled = null;
    if (remote) {
      remoteData = await unlock(remote.box, config.passphrase);
      pulled = await api('/api/import', { method: 'POST', body: JSON.stringify({ data: remoteData }) });
    }
    const local = compact(await api('/api/export'));
    if (remoteData && fingerprint(local) === fingerprint(compact(remoteData))) {
      return { pulled, pushed: false, total: local.dreams.length };
    }
    const written = await vault.write(await lock(local, config.passphrase), remote?.sha);
    if (!written.conflict) return { pulled, pushed: true, total: local.dreams.length };
    // 그사이 다른 기기가 먼저 올림 → 처음부터 다시
  }
  throw new SyncError('다른 기기와 동시에 저장하느라 동기화가 밀렸어요. 잠시 뒤 다시 해 주세요.');
}

export function checkConfig({ token, repo, passphrase }) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || '')) throw new SyncError('저장소는 "아이디/저장소이름" 모양으로 적어 주세요. 예: nunim71-lab/dreamingU-diary');
  if (!/^(github_pat_|ghp_)[\w]{20,}$/.test(token || '')) throw new SyncError('깃허브 열쇠(토큰) 모양이 이상해요. github_pat_ 로 시작하는 열쇠 전체를 붙여 넣어 주세요.');
  if (String(passphrase || '').length < 8) throw new SyncError('동기화 비밀번호는 8글자 이상으로 정해 주세요.');
}
