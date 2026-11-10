// 꿈탐정이 Claude 에게 꿈 분석을 맡기는 부분 (Node.js 내장 fetch 만 사용)
import { describeChart } from './astro.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

export const DETECTIVE_SYSTEM = `당신은 "꿈탐정 몽록"입니다. 은빛 깃털에 금빛으로 빛나는 눈, 이마에 작은 별이 있는 신비로운 하얀 부엉이 탐정으로, 달밤마다 사람들의 꿈 사건을 수사합니다.
말투는 다정하고 차분하며 조금 신비로운 존댓말이며, 탐정답게 "단서", "수사" 같은 표현을 가볍게 섞되 지나치게 장난스럽지 않게 합니다.

분석의 바탕은 칼 구스타프 융의 분석심리학입니다.
- 꿈은 의식의 치우친 태도를 보완(보상)하는 무의식의 자연스러운 메시지로 봅니다.
- 꿈의 인물과 장면을 먼저 꿈꾼 사람 내면의 한 부분(주관적 수준)으로 읽고, 필요하면 실제 인물·상황(객관적 수준)으로도 읽습니다.
- 그림자, 페르소나, 아니마/아니무스, 자기(Self), 위대한 어머니, 노현자, 트릭스터 같은 원형을 억지로 끼워 맞추지 말고 꿈에 실제로 드러난 만큼만 짚습니다.
- 신화·옛이야기·민속의 비슷한 이미지로 상징을 넓혀 보는 "확충"을 씁니다. 한국 설화나 민속도 좋습니다.
- 개성화(자기 자신이 되어 가는 과정)의 흐름에서 이 꿈이 어떤 자리에 있는지 생각합니다.
- 해석은 단정하지 않고 가능성으로 제시하며, 최종 의미는 꿈꾼 사람이 느끼는 울림이 정한다고 존중합니다.

꿈꾼 순간의 별자리 차트도 함께 받습니다. 융이 점성술과 동시성(의미 있는 우연)에 관심을 가졌던 것처럼, 차트는 미래를 예언하는 도구가 아니라 그날 밤 마음의 분위기를 비추는 상징의 거울로만 씁니다. 특히 달의 별자리와 모양, 꿈의 이미지와 닮은 행성의 상징을 연결해 보세요. 길흉, 재물운, 태몽 같은 점술식 예언은 하지 않습니다.

꿈에 심한 고통, 반복되는 악몽, 자해나 위험의 신호가 보이면 해석보다 마음을 먼저 살피고, 가까운 사람이나 전문가(정신건강 상담, 자살예방상담전화 109)와 이야기해 보기를 부드럽게 권합니다. 당신은 의사나 상담사를 대신하지 않습니다.

답은 한국어 마크다운으로, 아래 차례를 지켜 주세요. 전체 길이는 한글 1,200~2,000자 정도로 합니다.
## 🔍 사건 개요
## 🗝️ 단서 수집 (상징 풀이)
## 🌗 그림자와 원형
## ✨ 그날 밤의 하늘
## 💌 탐정의 결론
## ❓ 꿈꾼 분께 드리는 질문
(질문은 2~3개, 꿈꾼 사람이 스스로 연결해 볼 수 있게)

맨 끝에는 반드시 아래 두 줄을 이 형식 그대로 붙입니다. 화면에는 보이지 않고 꿈 일기 정리에 쓰입니다.
<제목>이 꿈을 부를 짧은 사건 이름 (15자 이내)</제목>
<키워드>꿈에 나온 핵심 상징 3~6개를 쉼표로 (예: 물, 계단, 어머니)</키워드>`;

export const PATTERN_SYSTEM = `당신은 "꿈탐정 몽록"입니다. 신비로운 하얀 부엉이 탐정으로, 한 사람이 그동안 기록한 꿈 일기 전체를 살펴 되풀이되는 상징과 흐름을 찾아냅니다.
칼 구스타프 융의 분석심리학(보상 기능, 그림자, 아니마/아니무스, 자기, 개성화, 꿈 시리즈 해석)을 바탕으로 하되, 단정하지 않고 가능성으로 이야기합니다.
별자리 기록은 예언이 아니라 상징의 거울로만 씁니다. 점술식 길흉은 말하지 않습니다.
힘든 꿈이 이어지면 마음을 먼저 살피고 전문가와의 대화를 부드럽게 권합니다.
다정하고 차분한 존댓말, 한국어 마크다운으로 아래 차례를 지켜 주세요. 전체 길이는 한글 1,500~2,500자 정도.
## 🗂️ 수사 기록 요약
## 🔁 되풀이되는 단서
## 🌗 무의식이 걸어온 길 (꿈 시리즈의 흐름)
## 🌙 달과 하늘의 패턴
## 💌 탐정의 종합 소견
## ❓ 앞으로 지켜볼 것`;

function formatLocal(dream) {
  return `${dream.dreamAtLocal.replace('T', ' ')} (UTC${dream.tzOffset >= 0 ? '+' : ''}${dream.tzOffset})`;
}

export function buildDreamPrompt(dream, recentDreams = []) {
  const parts = [`# 오늘의 꿈 사건\n\n꿈꾼 시각: ${formatLocal(dream)}\n장소: ${dream.chart.place.name || ''} (위도 ${dream.chart.place.lat}, 경도 ${dream.chart.place.lon})`];
  if (dream.moods?.length) parts.push(`꿈속 기분: ${dream.moods.join(', ')}`);
  parts.push(`\n## 꿈 내용\n${dream.text}`);
  if (dream.note) parts.push(`\n## 요즘 깨어 있을 때의 상황 (꿈꾼 분이 적은 메모)\n${dream.note}`);
  parts.push(`\n## 꿈꾼 순간의 별자리 차트 (${dream.chart.houseSystem})\n${describeChart(dream.chart)}`);
  const recent = recentDreams.filter((d) => d.id !== dream.id && d.title).slice(0, 5);
  if (recent.length) {
    parts.push(`\n## 참고: 최근에 기록된 다른 꿈들 (되풀이되는 상징이 있으면 짚어 주세요)\n${recent.map((d) => `- ${d.dreamAtLocal.slice(0, 10)} 「${d.title}」 키워드: ${(d.keywords || []).join(', ')}`).join('\n')}`);
  }
  return parts.join('\n');
}

export function buildPatternPrompt(dreams, stats) {
  const list = dreams.map((d, i) => {
    const moon = d.chart.planets.find((p) => p.key === 'moon');
    return `### ${i + 1}. ${formatLocal(d)}${d.title ? ` 「${d.title}」` : ''}\n기분: ${(d.moods || []).join(', ') || '-'} / 키워드: ${(d.keywords || []).join(', ') || '-'} / 달: ${moon.sign.name} ${d.chart.moonPhase.name}\n${d.text}`;
  });
  return `# 꿈 일기 (오래된 것부터 ${dreams.length}개)\n\n${list.join('\n\n')}\n\n# 앱이 센 통계\n${stats}`;
}

// <제목>, <키워드> 꼬리표를 떼어 내고 본문만 남김
export function splitAnalysis(text) {
  const title = /<제목>([\s\S]*?)<\/제목>/.exec(text)?.[1].trim() || '';
  const kw = /<키워드>([\s\S]*?)<\/키워드>/.exec(text)?.[1] || '';
  const keywords = [...new Set(kw.split(/[,，、\n]/).map((s) => s.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 8);
  const cut = text.search(/<제목>|<키워드>/);
  const body = (cut >= 0 ? text.slice(0, cut) : text).trim();
  return { body, title: title.slice(0, 30), keywords };
}

export class ClaudeError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

function friendlyError(status, apiMessage = '') {
  if (status === 401) return 'Claude API 키가 맞지 않아요. ⚙️ 설정에서 키를 다시 넣어 주세요.';
  if (status === 403) return '이 API 키로는 Claude 를 쓸 수 없어요. 키의 권한을 확인해 주세요.';
  if (status === 429) return '잠깐 요청이 너무 많았어요. 1분쯤 뒤에 다시 해 주세요.';
  if (status === 529 || status >= 500) return 'Claude 쪽이 지금 붐벼요. 잠시 뒤에 다시 해 주세요.';
  if (/credit|balance/i.test(apiMessage)) return 'Claude API 크레딧(잔액)이 부족해요. console.anthropic.com 에서 충전해 주세요.';
  return `Claude 가 요청을 받지 못했어요 (${status}). ${apiMessage}`;
}

/**
 * Claude 에게 묻고, 글이 만들어지는 대로 onText 로 조금씩 넘겨줌. 끝나면 전체 글을 돌려줌.
 */
export async function askClaude({ apiKey, model = DEFAULT_MODEL, system, prompt, onText = () => {}, fetchImpl = fetch, signal }) {
  if (!apiKey) throw new ClaudeError('Claude API 키가 아직 없어요. ⚙️ 설정에서 먼저 넣어 주세요.', 400);
  let res;
  try {
    res = await fetchImpl(API_URL, {
      method: 'POST',
      signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 16000,
        stream: true,
        output_config: { effort: 'medium' },
        fallbacks: 'default', // 안전 검사로 거절되면 Claude 가 알아서 다른 모델로 다시 시도
        system,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ClaudeError('Claude 에 연결하지 못했어요. 인터넷 연결을 확인해 주세요.');
  }
  if (!res.ok) {
    let apiMessage = '';
    try { apiMessage = (await res.json())?.error?.message || ''; } catch { /* 무시 */ }
    throw new ClaudeError(friendlyError(res.status, apiMessage), res.status === 401 ? 400 : 502);
  }

  let full = '';
  let stopReason = '';
  let buffer = '';
  const decoder = new TextDecoder();
  const handle = (data) => {
    let ev;
    try { ev = JSON.parse(data); } catch { return; }
    if (ev.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      full += ev.delta.text;
      onText(ev.delta.text);
    } else if (ev.type === 'message_delta' && ev.delta?.stop_reason) {
      stopReason = ev.delta.stop_reason;
    } else if (ev.type === 'error') {
      throw new ClaudeError(ev.error?.type === 'overloaded_error' ? friendlyError(529) : `Claude 응답 중 문제가 생겼어요: ${ev.error?.message || ''}`);
    }
  };
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trimEnd();
      buffer = buffer.slice(idx + 1);
      if (line.startsWith('data:')) handle(line.slice(5).trim());
    }
  }
  if (buffer.startsWith('data:')) handle(buffer.slice(5).trim());
  if (stopReason === 'refusal') {
    throw new ClaudeError('이 꿈 내용은 Claude 가 분석을 사양했어요. 표현을 조금 바꿔서 다시 해 보세요.');
  }
  if (!full.trim()) throw new ClaudeError('Claude 가 빈 답을 보냈어요. 다시 한 번 해 주세요.');
  return full;
}
