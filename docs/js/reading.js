// 별자리 차트의 간단한 풀이 (Claude 없이 바로 보여 줌, 서버와 브라우저가 함께 씀)
// 예언이 아니라 "그날 밤 마음의 분위기"를 비추는 상징으로만 풀이함.
import { PLANETS } from './astro.js';

export const SIGN_KEYWORDS = {
  양자리: '용기·시작·뜨거운 충동', 황소자리: '안정·감각·지키고 싶은 것', 쌍둥이자리: '호기심·말·연결',
  게자리: '돌봄·집·오래된 기억', 사자자리: '표현·자존심·창조', 처녀자리: '정리·분석·몸의 신호',
  천칭자리: '관계·조화·균형', 전갈자리: '깊이·비밀·변화', 사수자리: '모험·의미·자유',
  염소자리: '책임·성취·단단한 틀', 물병자리: '독립·이상·새로움', 물고기자리: '상상·공감·경계 없음',
};

const MOON_IN_SIGN = {
  양자리: '감정이 빠르고 뜨겁게 움직이는 밤이에요. 쫓고 쫓기거나 무언가에 맞서는 장면이 나오기 쉬워요. 억눌러 둔 화나 "먼저 나서고 싶은 마음"을 비춰 줄 수 있어요.',
  황소자리: '마음이 편안함과 안정을 찾는 밤이에요. 음식, 집, 자연처럼 몸의 감각이 생생한 꿈이 많아요. 내가 무엇을 지키고 싶은지 돌아보게 해요.',
  쌍둥이자리: '생각이 바쁘게 오가는 밤이에요. 대화, 편지, 전화, 길 찾기, 장면이 휙휙 바뀌는 꿈이 잘 나와요. 정리되지 않은 생각과 하지 못한 말을 살펴보세요.',
  게자리: '달이 가장 편안해하는 자리예요. 가족, 옛집, 어린 시절, 물과 바다의 꿈이 깊어져요. 돌봄받고 싶은 마음과 오래된 기억이 떠오르는 밤이에요.',
  사자자리: '인정받고 빛나고 싶은 마음이 커지는 밤이에요. 무대, 주목받는 장면, 아이와 놀이의 꿈이 나오기 쉬워요. 내 안의 자존심과 창조성을 비춰요.',
  처녀자리: '마음이 작은 것까지 살피는 밤이에요. 정리, 시험, 일, 몸과 건강에 관한 꿈이 잘 나와요. 스스로를 너무 다그치고 있지 않은지 돌아보세요.',
  천칭자리: '관계와 균형을 생각하는 밤이에요. 누군가와의 만남이나 결정을 내려야 하는 장면이 나오기 쉬워요. 나와 상대 사이의 저울을 살펴보게 해요.',
  전갈자리: '감정이 가장 깊은 곳까지 내려가는 밤이에요. 비밀, 끝과 다시 태어남, 강렬한 애정이나 두려움의 꿈이 나올 수 있어요. 그림자와 만나는 중요한 꿈일 때가 많아요.',
  사수자리: '마음이 멀리 떠나고 싶은 밤이에요. 여행, 낯선 나라, 하늘을 나는 꿈, 스승을 만나는 꿈이 잘 나와요. 삶의 의미와 자유를 향한 바람을 비춰요.',
  염소자리: '감정을 단단히 붙잡고 있는 밤이에요. 산, 건물, 오르기, 시험, 어른이나 윗사람의 꿈이 나오기 쉬워요. 책임감 아래 숨겨 둔 피로를 알아봐 주세요.',
  물병자리: '감정을 한 발 떨어져 바라보는 밤이에요. 미래 도시, 기계, 무리 속의 나처럼 낯설고 기발한 장면이 나올 수 있어요. 남과 다른 나다움을 향한 바람을 비춰요.',
  물고기자리: '꿈과 현실의 경계가 가장 얇은 밤이에요. 바다, 물속, 녹아드는 장면처럼 신비롭고 상징적인 꿈이 많아요. 무의식이 가장 가까이 와 있는 때예요.',
};

const MOON_PHASE = {
  '새달(삭)': '새 씨앗이 심어지는 어둠의 시간이에요. 아직 모양이 없는 새로운 시작을 알리는 꿈일 수 있어요.',
  초승달: '막 자라기 시작한 바람의 시간이에요. 작은 시작과 설렘, 망설임이 꿈에 비칠 수 있어요.',
  상현달: '행동과 결심의 갈림길이에요. 꿈에 부딪힘이나 선택의 장면이 나왔다면 눈여겨보세요.',
  '차오르는 달': '다듬고 채워 가는 시간이에요. 무언가를 준비하거나 완성해 가는 꿈과 잘 어울려요.',
  보름달: '모든 것이 환히 드러나는 밤이에요. 감정이 가장 크게 차오르고, 숨겨 둔 마음이 꿈에 드러나기 쉬워요.',
  '기우는 달': '거둔 것을 나누고 소화하는 시간이에요. 깨달음이나 메시지를 전하는 꿈이 나올 수 있어요.',
  하현달: '내려놓고 정리하는 시간이에요. 오래된 것과 작별하는 꿈과 잘 어울려요.',
  그믐달: '쉬고 비우는 가장 고요한 시간이에요. 끝과 휴식, 그리고 다음 시작을 준비하는 꿈이에요.',
};

const PLANET_KEYWORDS = {
  sun: '나 자신·의식', moon: '감정·무의식', mercury: '생각·말', venus: '사랑·아름다움', mars: '의지·분노',
  jupiter: '확장·희망', saturn: '한계·책임', uranus: '변화·깨어남', neptune: '꿈·환상', pluto: '깊은 변화·재생',
};

const ASPECT_MEANING = {
  conjunction: '하나로 섞여 강하게 함께 움직이는',
  sextile: '부드럽게 서로 돕는',
  square: '부딪히며 긴장을 만드는',
  trine: '자연스럽게 함께 흐르는',
  opposition: '양쪽에서 서로 끌어당기는',
};

const RETROGRADE = {
  mercury: '수성이 뒤로 가는(역행) 때예요. 지난 대화와 생각을 되돌아보게 해서, 옛사람이나 예전 장소가 꿈에 나오기 쉬워요.',
  venus: '금성이 뒤로 가는(역행) 때예요. 지난 사랑과 관계, 내가 소중히 여기는 것을 다시 살펴보게 해요.',
  mars: '화성이 뒤로 가는(역행) 때예요. 밖으로 내지 못한 힘과 화가 안으로 향해서, 꿈속에서 달리려 해도 몸이 안 움직이는 장면이 나올 수 있어요.',
};

const nameOf = (key) => PLANETS.find((p) => p.key === key).name;

// 받침에 따라 조사 고르기: josa('분노', '과', '와') → '와'
export function josa(word, withFinal, withoutFinal) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  const hasFinal = code >= 0 && code <= 11171 && code % 28 !== 0;
  return hasFinal ? withFinal : withoutFinal;
}

/** 차트 → [{ icon, title, text }] 짧은 풀이 목록 */
export function readChart(chart) {
  const sun = chart.planets.find((p) => p.key === 'sun');
  const moon = chart.planets.find((p) => p.key === 'moon');
  const out = [];
  out.push({ icon: '☽', title: `달이 ${moon.sign.name}에`, text: MOON_IN_SIGN[moon.sign.name] });
  out.push({ icon: chart.moonPhase.emoji, title: chart.moonPhase.name, text: MOON_PHASE[chart.moonPhase.name] });
  out.push({ icon: '☉', title: `태양이 ${sun.sign.name}에`, text: `요즘은 '${SIGN_KEYWORDS[sun.sign.name]}'의 계절이에요. 깨어 있는 동안의 관심이 이쪽으로 흐르기 쉬워요.` });
  out.push({ icon: '↑', title: `상승점이 ${chart.asc.sign.name}에`, text: `그 순간 하늘의 문은 '${SIGN_KEYWORDS[chart.asc.sign.name]}'의 기운으로 열려 있었어요. 꿈의 첫인상과 분위기가 이 빛깔로 물들 수 있어요.` });

  // 달이 맺은 각도를 먼저, 그다음 가장 정확한 각도 순으로 3개
  const picked = [...chart.aspects.filter((a) => a.a === 'moon' || a.b === 'moon'), ...chart.aspects]
    .filter((a, i, list) => list.indexOf(a) === i).slice(0, 3);
  for (const a of picked) {
    out.push({
      icon: a.glyph,
      title: `${nameOf(a.a)} ${a.name} ${nameOf(a.b)}`,
      text: `'${PLANET_KEYWORDS[a.a]}'${josa(PLANET_KEYWORDS[a.a], '과', '와')} '${PLANET_KEYWORDS[a.b]}'${josa(PLANET_KEYWORDS[a.b], '이', '가')} ${ASPECT_MEANING[a.type]} 사이예요.`,
    });
  }
  for (const p of chart.planets) {
    if (p.retrograde && RETROGRADE[p.key]) out.push({ icon: '℞', title: `${p.name} 역행`, text: RETROGRADE[p.key] });
  }
  return out;
}
