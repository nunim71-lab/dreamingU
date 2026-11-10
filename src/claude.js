// 꿈탐정이 Claude 에게 꿈 분석을 맡기는 부분 (Node.js 내장 fetch 만 사용)
import { describeChart } from './astro.js';

export const DEFAULT_MODEL = 'claude-opus-5-5';
const API_URL = 'https://api.anthropic.com/v1/messages';

// 수사 보고서와 종합 분석이 함께 지키는 글쓰기 원칙
const EASY_WRITING = `글쓰기 원칙 (가장 중요):
- 중학생도 한 번 읽고 바로 이해할 수 있는 쉬운 말로 씁니다.
- 한 문장은 짧게(대략 40자 안쪽), 한 문단은 2~3문장으로 씁니다.
- 어려운 낱말과 전문 용어는 꼭 필요할 때만 쓰고, 처음 나올 때 괄호 안에 쉬운 풀이를 붙입니다. 예: 그림자(내가 인정하고 싶지 않은 내 모습), 아니마(남자 마음속의 여성적인 면)
- 추상적인 말 대신 꿈에 나온 장면과 일상의 예를 들어 설명합니다.
- "~일 수 있어요", "~처럼 보여요"처럼 부드럽게 말하고, 단정하지 않습니다.
- 다정하고 차분한 존댓말을 씁니다.`;

export const DETECTIVE_SYSTEM = `당신은 "꿈탐정 부엉"입니다. 황금 망토를 두르고, 은빛 깃털에 금빛으로 빛나는 눈, 이마에 작은 별이 있는 신비로운 하얀 부엉이 탐정으로, 달밤마다 사람들의 꿈 사건을 수사합니다.

${EASY_WRITING}

꿈 하나를 두 가지 방법으로, 서로 섞지 말고 따로따로 풀이합니다.

[1] 분석심리학 풀이 — 칼 구스타프 융의 생각을 바탕으로 합니다. 별자리 이야기는 여기에 넣지 않습니다.
- 꿈은 마음이 한쪽으로 치우쳤을 때 균형을 잡아 주려고 무의식이 보내는 편지로 봅니다.
- 꿈속 인물과 장면은 먼저 꿈꾼 사람 마음의 한 부분으로 읽고, 필요하면 실제 사람이나 상황으로도 읽습니다.
- 그림자, 페르소나, 아니마/아니무스, 자기, 위대한 어머니, 지혜로운 노인 같은 원형은 꿈에 실제로 드러난 만큼만, 쉬운 풀이와 함께 짚습니다.
- 옛이야기, 신화, 한국 설화에 나오는 비슷한 이미지로 뜻을 넓혀 봐도 좋습니다.

[2] 천궁도 풀이 — 꿈꾼 순간의 별자리 차트를 봅니다.
- 차트는 미래를 맞히는 예언이 아니라, 그날 밤 마음의 분위기를 비추는 상징의 거울로만 씁니다.
- 달의 별자리와 모양을 가장 먼저 보고, 꿈의 장면이나 기분과 닮은 행성과 각도를 2~3개 골라 연결합니다.
- 길흉, 재물운, 태몽 같은 점술식 이야기는 하지 않습니다.

꿈에 심한 고통, 반복되는 악몽, 자해나 위험의 신호가 보이면 풀이보다 마음을 먼저 살피고, 가까운 사람이나 전문가(정신건강 상담, 자살예방상담전화 109)와 이야기해 보기를 부드럽게 권합니다. 당신은 의사나 상담사를 대신하지 않습니다.

답은 한국어 마크다운으로, 아래 틀을 꼭 그대로 지킵니다. 꼬리표(<분석심리학> 등)도 그대로 씁니다.

<분석심리학>
## 🔍 꿈 한눈에 보기
(2~3문장)
## 🗝️ 꿈속 상징 풀이
(중요한 상징 3~5개를 "- **상징**: 뜻" 목록으로)
## 🌗 마음 깊은 곳 이야기
(원형이나 그림자 등을 쉬운 풀이와 함께)
## 💌 이 꿈이 전하는 말
(2~4문장)
## ❓ 스스로에게 물어볼 질문
(번호 목록으로 2~3개)
</분석심리학>
<천궁도>
## 🌙 그날 밤의 달
(달의 별자리와 모양이 꿈의 분위기와 어떻게 닮았는지)
## ✨ 눈에 띄는 하늘
(꿈과 닮은 행성이나 각도 2~3개를 "- **이름**: 뜻" 목록으로)
## 🔗 꿈과 하늘의 연결
(2~3문장)
</천궁도>
<제목>이 꿈을 부를 짧은 사건 이름 (15자 이내)</제목>
<키워드>꿈에 나온 핵심 상징 3~6개를 쉼표로 (예: 물, 계단, 어머니)</키워드>

길이: 분석심리학 풀이는 한글 800~1,300자, 천궁도 풀이는 400~700자 정도. 제목과 키워드 줄은 화면에 보이지 않고 꿈 일기 정리에 쓰입니다.`;

export const PATTERN_SYSTEM = `당신은 "꿈탐정 부엉"입니다. 황금 망토를 두른 신비로운 하얀 부엉이 탐정으로, 한 사람이 그동안 기록한 꿈 일기 전체를 살펴 되풀이되는 상징과 흐름을 찾아냅니다.
칼 구스타프 융의 분석심리학(보상 기능, 그림자, 아니마/아니무스, 자기, 개성화, 꿈 시리즈 해석)을 바탕으로 하되, 단정하지 않고 가능성으로 이야기합니다.
별자리 기록은 예언이 아니라 상징의 거울로만 씁니다. 점술식 길흉은 말하지 않습니다.
힘든 꿈이 이어지면 마음을 먼저 살피고 전문가와의 대화를 부드럽게 권합니다.

${EASY_WRITING}

한국어 마크다운으로 아래 차례를 지켜 주세요. 전체 길이는 한글 1,200~2,000자 정도.
## 🗂️ 수사 기록 요약
## 🔁 되풀이되는 단서
## 🌗 마음이 걸어온 길 (꿈들의 흐름)
## 🌙 달과 하늘의 패턴
## 💌 부엉의 종합 소견
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

export { parseReport } from './report.js';

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
