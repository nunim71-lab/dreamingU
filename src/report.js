// 부엉의 수사 보고서 나누기 (서버와 브라우저가 함께 씀)
// Claude 는 <분석심리학>…</분석심리학> <천궁도>…</천궁도> <제목>…</제목> <키워드>…</키워드> 로 나눠 씀.
// 글이 아직 쓰이는 중(스트리밍)이어도 지금까지 온 만큼 나눠 보여 줄 수 있게 함.

export const PSYCH_TAG = '분석심리학';
export const SKY_TAG = '천궁도';

// 맨 끝에 반쯤 온 꼬리표("<천궁" 같은)는 숨김
function trimPartialTag(text) {
  const lt = text.lastIndexOf('<');
  if (lt >= 0 && text.length - lt <= 8 && !text.slice(lt).includes('>')) return text.slice(0, lt);
  return text;
}

function section(text, tag) {
  const open = `<${tag}>`;
  const start = text.indexOf(open);
  if (start < 0) return null;
  const from = start + open.length;
  const end = text.indexOf(`</${tag}>`, from);
  let body = end >= 0 ? text.slice(from, end) : text.slice(from);
  // 닫는 꼬리표 없이 다음 부분이 시작된 경우 거기서 자름
  const next = body.search(/<\/?(분석심리학|천궁도|제목|키워드)>/);
  if (next >= 0) body = body.slice(0, next);
  return trimPartialTag(body).trim();
}

// claude.ai 에서 복사해 온 답: 【분석심리학】 【천궁도】 【제목】 【키워드】 표시 줄을 꼬리표로 바꿈
// (표시 줄 앞뒤에 붙은 #, *, > 같은 마크다운 꾸밈도 무시)
function marksToTags(text) {
  if (/<(분석심리학|천궁도)>/.test(text) || !text.includes('【')) return text;
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const m = /^[\s>#*_]*【\s*(분석심리학|천궁도|제목|키워드)\s*】[\s*_:：]*(.*?)[\s*_]*$/.exec(lines[i]);
    if (!m) { out.push(lines[i]); continue; }
    const [, tag, rest] = m;
    if (tag === '분석심리학' || tag === '천궁도') {
      out.push(`<${tag}>`);
      if (rest) out.push(rest);
    } else {
      let value = rest;
      while (!value && i + 1 < lines.length) value = lines[++i].trim();
      out.push(`<${tag}>${value}</${tag}>`);
    }
  }
  return out.join('\n');
}

export function parseReport(raw) {
  const text = marksToTags(raw);
  const psych = section(text, PSYCH_TAG);
  const sky = section(text, SKY_TAG);
  const title = /<제목>([\s\S]*?)<\/제목>/.exec(text)?.[1].trim() || '';
  const kw = /<키워드>([\s\S]*?)<\/키워드>/.exec(text)?.[1] || '';
  const keywords = [...new Set(kw.split(/[,，、\n]/).map((s) => s.trim().replace(/^#/, '')).filter(Boolean))].slice(0, 8);
  if (psych === null && sky === null) {
    // 꼬리표 없이 온 글(예전 형식 등)은 통째로 분석심리학 풀이로
    const cut = text.search(/<제목>|<키워드>/);
    const body = trimPartialTag(cut >= 0 ? text.slice(0, cut) : text);
    // 표시 없이 왔어도 천궁도 쪽 제목 줄이 보이면 거기서 나눔
    const skyAt = body.search(/^.*(천궁도 풀이|🌙 그날 밤의 달).*$/m);
    if (skyAt > 0) return { psych: body.slice(0, skyAt).trim(), sky: body.slice(skyAt).trim(), title: title.slice(0, 30), keywords };
    return { psych: body.trim(), sky: '', title: title.slice(0, 30), keywords };
  }
  return { psych: psych || '', sky: sky || '', title: title.slice(0, 30), keywords };
}
