// 꿈꾸는부엉이의 두뇌: 꿈 저장·분석·꿈 일기·종합 분석·내보내기/가져오기
// 컴퓨터 버전(src/server.js, data 폴더에 저장)과 휴대폰 버전(js/local.js, 휴대폰 안에 저장)이 똑같이 씀.
import { computeChart, localToDate } from './astro.js';
import {
  DEFAULT_MODEL, DETECTIVE_SYSTEM, PATTERN_SYSTEM, askClaude,
  buildDreamPrompt, buildPastePrompt, buildPatternPastePrompt, buildPatternPrompt, parseReport,
} from './claude.js';

export const MAX_DREAM_CHARS = 20000;
export const MAX_REPORT_CHARS = 60000; // 붙여 넣는 수사 보고서
export const PATTERN_LIMIT = 40; // 종합 분석에 보내는 최근 꿈 수
export const MAX_MEMO_CHARS = 10000; // 꿈마다 적는 나의 메모
export const EXPORT_APP = 'dreamingU';

export class RequestError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
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

function parseTz(value) {
  const tz = Number(value ?? 9);
  if (!Number.isFinite(tz) || tz < -12 || tz > 14) throw new RequestError('시간대가 올바르지 않아요.');
  return tz;
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

export function statsText(stats) {
  const fmt = (list) => list.map((x) => `${x.name} ${x.n}번`).join(', ') || '-';
  return `- 자주 나온 상징: ${fmt(stats.keywords)}\n- 꿈속 기분: ${fmt(stats.moods)}\n- 꿈꾼 날 달의 별자리: ${fmt(stats.moonSigns)}\n- 꿈꾼 날 달의 모양: ${fmt(stats.moonPhases)}`;
}

const maskKey = (key) => (key ? `${key.slice(0, 7)}…${key.slice(-4)}` : '');
const str = (v, max) => String(v ?? '').slice(0, max);

// 가져온 꿈 하나를 꼼꼼히 확인하고 다시 정리 (차트는 날짜·장소로 다시 계산)
function cleanImportedDream(d) {
  const when = new Date(d?.dreamAt);
  if (!d || typeof d.id !== 'string' || !/^[\w-]{1,64}$/.test(d.id) || typeof d.text !== 'string' || !d.text.trim() || Number.isNaN(when.getTime())) return null;
  let place;
  try { place = parsePlace(d.chart?.place); } catch { return null; }
  return {
    id: d.id,
    text: str(d.text, MAX_DREAM_CHARS),
    note: str(d.note, 2000),
    moods: Array.isArray(d.moods) ? d.moods.map(String).slice(0, 10) : [],
    dreamAtLocal: str(d.dreamAtLocal, 16) || when.toISOString().slice(0, 16),
    tzOffset: Number.isFinite(Number(d.tzOffset)) ? Number(d.tzOffset) : 9,
    dreamAt: when.toISOString(),
    recordedAt: str(d.recordedAt, 40) || new Date().toISOString(),
    chart: computeChart(when, place),
    title: str(d.title, 30),
    keywords: Array.isArray(d.keywords) ? d.keywords.map((k) => str(k, 30)).slice(0, 8) : [],
    analysis: str(d.analysis, MAX_REPORT_CHARS),
    skyAnalysis: str(d.skyAnalysis, MAX_REPORT_CHARS),
    ...(d.analyzedAt ? { analyzedAt: str(d.analyzedAt, 40) } : {}),
    ...(d.analyzedVia ? { analyzedVia: str(d.analyzedVia, 10) } : {}),
    ...(d.memoAt ? { memo: str(d.memo, MAX_MEMO_CHARS), memoAt: str(d.memoAt, 40) } : {}),
  };
}

// 같은 꿈을 합칠 때: 분석과 메모를 따로 비교해서 각각 더 최근 것을 남김
// (예: 휴대폰에서 쓴 메모 + 컴퓨터에서 다시 한 분석 → 둘 다 남음). 바뀐 게 있으면 true
const ANALYSIS_FIELDS = ['analysis', 'skyAnalysis', 'title', 'keywords', 'analyzedAt', 'analyzedVia'];
function mergeDream(mine, theirs) {
  let changed = false;
  if ((theirs.analyzedAt || '') > (mine.analyzedAt || '')) {
    for (const f of ANALYSIS_FIELDS) mine[f] = theirs[f];
    changed = true;
  }
  if ((theirs.memoAt || '') > (mine.memoAt || '')) {
    mine.memo = theirs.memo;
    mine.memoAt = theirs.memoAt;
    changed = true;
  }
  return changed;
}

/**
 * @param {object} o
 * @param {{loadDreams, saveDreams, loadSettings, saveSettings}} o.store  저장하는 곳
 * @param {Function} [o.ask]  Claude 부르기 (시험할 때 바꿔 끼움)
 * @param {string} [o.envKey]  컴퓨터 환경변수의 API 키
 * @param {string} o.build  빌드 번호
 * @param {string} o.mode  'server'(컴퓨터) | 'local'(휴대폰·브라우저)
 */
export async function createApp({ store, ask = askClaude, envKey = '', build, mode }) {
  let dreams = await store.loadDreams();
  let settings = await store.loadSettings();
  const apiKey = () => settings.apiKey || envKey || '';
  const model = () => settings.model || DEFAULT_MODEL;
  const sortDreams = () => dreams.sort((a, b) => b.dreamAt.localeCompare(a.dreamAt));
  const findDream = (id) => {
    const dream = dreams.find((d) => d.id === id);
    if (!dream) throw new RequestError('그 꿈 기록을 찾을 수 없어요.', 404);
    return dream;
  };
  const saveReport = async (dream, text, via) => {
    const { psych, sky, title, keywords } = parseReport(text);
    Object.assign(dream, { analysis: psych, skyAnalysis: sky, title: title || dream.title, keywords: keywords.length ? keywords : dream.keywords, analyzedAt: new Date().toISOString(), analyzedVia: via });
    await store.saveDreams(dreams);
  };
  const needTwoDreams = () => {
    if (dreams.length < 2) throw new RequestError('꿈이 2개 이상 모이면 종합 분석을 할 수 있어요.');
    return dreams.slice(0, PATTERN_LIMIT).reverse();
  };
  const savePattern = async (text, count, via) => {
    settings = { ...settings, lastPattern: { text: text.trim(), at: new Date().toISOString(), count, via } };
    await store.saveSettings(settings);
  };
  const pastedText = (body) => {
    const text = String(body?.text || '').trim();
    if (text.length > MAX_REPORT_CHARS) throw new RequestError('붙여 넣은 글이 너무 길어요. Claude 의 답만 복사해 주세요.');
    return text;
  };
  const noKeyError = () => new RequestError('Claude API 키가 아직 없어요. [📋 Claude에게 물어볼 글 복사]로 Claude 구독을 써서 분석하거나, ⚙️ 설정에서 API 키를 넣어 주세요.');

  /**
   * 요청 하나 처리. 돌려주는 것:
   *  { json }  또는  { stream: { system, prompt, onDone(전체 글) } }  (Claude 의 글을 흘려보낼 때)
   */
  async function handle(method, pathname, body = {}) {
    if (method === 'GET' && pathname === '/api/status') {
      return {
        json: {
          build, mode,
          hasKey: Boolean(apiKey()),
          keyFromEnv: !settings.apiKey && Boolean(envKey),
          maskedKey: maskKey(settings.apiKey || ''),
          model: model(),
          place: settings.place || null,
          tzOffset: settings.tzOffset ?? 9,
        },
      };
    }

    if (method === 'POST' && pathname === '/api/settings') {
      const next = { ...settings };
      if (typeof body.apiKey === 'string') {
        const key = body.apiKey.trim();
        if (key && !/^sk-ant-[\w-]{10,}$/.test(key)) throw new RequestError('API 키 모양이 이상해요. sk-ant- 로 시작하는 키 전체를 붙여 넣어 주세요.');
        next.apiKey = key;
      }
      if (body.place) next.place = parsePlace(body.place);
      if (body.tzOffset !== undefined) next.tzOffset = parseTz(body.tzOffset);
      settings = next;
      await store.saveSettings(settings);
      return { json: { ok: true } };
    }

    if (method === 'GET' && pathname === '/api/dreams') return { json: { dreams } };

    if (method === 'POST' && pathname === '/api/dreams') {
      const text = String(body.text || '').trim();
      if (!text) throw new RequestError('꿈 내용을 적어 주세요.');
      if (text.length > MAX_DREAM_CHARS) throw new RequestError(`꿈 내용이 너무 길어요 (최대 ${MAX_DREAM_CHARS.toLocaleString()}자).`);
      const tzOffset = parseTz(body.tzOffset);
      const when = localToDate(body.dreamAtLocal, tzOffset);
      if (!when || when.getUTCFullYear() < 1900 || when.getUTCFullYear() > 2099) throw new RequestError('꿈꾼 날짜와 시간을 확인해 주세요 (1900~2099년).');
      const place = parsePlace(body.place);
      const dream = {
        id: globalThis.crypto.randomUUID(),
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
      return { json: { dream } };
    }

    const m = /^\/api\/dreams\/([\w-]+)(\/analyze|\/prompt|\/report|\/memo)?$/.exec(pathname);

    // claude.ai 에 붙여 넣을 글 (API 키 없어도 됨)
    if (m && method === 'GET' && m[2] === '/prompt') {
      return { json: { text: buildPastePrompt(findDream(m[1]), dreams) } };
    }

    // claude.ai 에서 받은 답을 붙여 넣어 저장
    if (m && method === 'POST' && m[2] === '/report') {
      const dream = findDream(m[1]);
      const text = pastedText(body);
      if (!text) throw new RequestError('Claude 의 답을 붙여 넣어 주세요.');
      if (parseReport(text).psych.length < 30) throw new RequestError('수사 보고서가 아닌 것 같아요. Claude 의 답 전체를 복사해서 붙여 넣어 주세요.');
      await saveReport(dream, text, 'paste');
      return { json: { dream } };
    }

    // 나의 메모 (분석이 끝난 뒤 떠오른 생각 등). Claude 에게는 보내지 않음
    if (m && method === 'POST' && m[2] === '/memo') {
      const dream = findDream(m[1]);
      const memo = String(body.memo ?? '');
      if (memo.length > MAX_MEMO_CHARS) throw new RequestError(`메모가 너무 길어요 (최대 ${MAX_MEMO_CHARS.toLocaleString()}자).`);
      dream.memo = memo;
      dream.memoAt = new Date().toISOString();
      await store.saveDreams(dreams);
      return { json: { memo: dream.memo, memoAt: dream.memoAt } };
    }

    if (m && method === 'DELETE' && !m[2]) {
      findDream(m[1]);
      dreams = dreams.filter((d) => d.id !== m[1]);
      await store.saveDreams(dreams);
      // 지운 꿈을 기억해 둠: 동기화·가져오기 때 다른 기기에서 다시 살아나지 않게
      settings = { ...settings, deleted: { ...(settings.deleted || {}), [m[1]]: new Date().toISOString() } };
      await store.saveSettings(settings);
      return { json: { ok: true } };
    }

    if (m && method === 'POST' && m[2] === '/analyze') {
      const dream = findDream(m[1]);
      if (!apiKey()) throw noKeyError();
      return { stream: { system: DETECTIVE_SYSTEM, prompt: buildDreamPrompt(dream, dreams), onDone: (text) => saveReport(dream, text, 'api') } };
    }

    if (method === 'GET' && pathname === '/api/patterns') {
      return { json: { stats: makeStats(dreams), last: settings.lastPattern || null } };
    }

    if (method === 'POST' && pathname === '/api/patterns') {
      const recent = needTwoDreams();
      if (!apiKey()) throw noKeyError();
      return { stream: { system: PATTERN_SYSTEM, prompt: buildPatternPrompt(recent, statsText(makeStats(recent))), onDone: (text) => savePattern(text, recent.length, 'api') } };
    }

    // 종합 분석도 claude.ai 로 (복사 → 붙여넣기)
    if (method === 'GET' && pathname === '/api/patterns/prompt') {
      const recent = needTwoDreams();
      return { json: { text: buildPatternPastePrompt(recent, statsText(makeStats(recent))) } };
    }
    if (method === 'POST' && pathname === '/api/patterns/report') {
      const text = pastedText(body);
      if (text.length < 30) throw new RequestError('Claude 의 답 전체를 복사해서 붙여 넣어 주세요.');
      await savePattern(text, Math.min(dreams.length, PATTERN_LIMIT), 'paste');
      return { json: { last: settings.lastPattern } };
    }

    // 꿈 일기 내보내기 (API 키는 넣지 않음)
    if (method === 'GET' && pathname === '/api/export') {
      return { json: { app: EXPORT_APP, build, exportedAt: new Date().toISOString(), dreams, deleted: settings.deleted || {}, lastPattern: settings.lastPattern || null } };
    }

    // 꿈 일기 가져오기: 같은 꿈(같은 id)은 더 최근에 분석·기록된 쪽을 남김
    if (method === 'POST' && pathname === '/api/import') {
      const data = body?.data;
      if (!data || data.app !== EXPORT_APP || !Array.isArray(data.dreams)) {
        throw new RequestError('꿈꾸는부엉이에서 내보낸 꿈 일기 파일이 아니에요. "dreamingU-diary-날짜.json" 파일을 골라 주세요.');
      }
      let added = 0;
      let updated = 0;
      let skipped = 0;
      let removed = 0;
      // 어느 쪽에서든 지운 꿈은 지운 채로 (지운 기록을 합침)
      const deleted = { ...(settings.deleted || {}) };
      let deletedChanged = false;
      if (data.deleted && typeof data.deleted === 'object') {
        for (const [id, at] of Object.entries(data.deleted)) {
          if (!/^[\w-]{1,64}$/.test(id) || typeof at !== 'string') continue;
          if (!deleted[id] || at > deleted[id]) { deleted[id] = at.slice(0, 40); deletedChanged = true; }
        }
      }
      const byId = new Map(dreams.map((d) => [d.id, d]));
      for (const id of Object.keys(deleted)) if (byId.delete(id)) removed++;
      for (const raw of data.dreams) {
        const d = cleanImportedDream(raw);
        if (!d) { skipped++; continue; }
        if (deleted[d.id]) continue;
        const mine = byId.get(d.id);
        if (!mine) { byId.set(d.id, d); added++; } else if (mergeDream(mine, d)) { updated++; }
      }
      dreams = [...byId.values()];
      sortDreams();
      await store.saveDreams(dreams);
      if (deletedChanged) {
        settings = { ...settings, deleted };
        await store.saveSettings(settings);
      }
      const lp = data.lastPattern;
      if (lp && typeof lp.text === 'string' && lp.text.trim() && (!settings.lastPattern || str(lp.at, 40) > settings.lastPattern.at)) {
        settings = { ...settings, lastPattern: { text: str(lp.text, MAX_REPORT_CHARS).trim(), at: str(lp.at, 40), count: Number(lp.count) || 0, via: str(lp.via, 10) } };
        await store.saveSettings(settings);
      }
      return { json: { added, updated, skipped, removed, total: dreams.length } };
    }

    if (pathname.startsWith('/api/')) {
      throw new RequestError('이 기능을 찾지 못했어요. 꿈꾸는부엉이를 새 버전으로 바꿨다면, 작업 표시줄의 꿈꾸는부엉이 검은 창을 닫고 부엉 아이콘으로 다시 켜 주세요.', 404);
    }
    throw new RequestError('없는 페이지입니다.', 404);
  }

  // Claude 에게 묻고 글이 오는 대로 onText 로 넘김. 다 오면 onDone 으로 저장한 뒤 전체 글을 돌려줌
  async function runStream({ system, prompt, onDone }, onText, signal) {
    const text = await ask({ apiKey: apiKey(), model: model(), system, prompt, signal, onText });
    await onDone(text);
    return text;
  }

  return { handle, runStream };
}
