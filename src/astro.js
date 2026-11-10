// 꿈탐정 별자리 차트 계산 (서버와 브라우저가 함께 씀, 외부 라이브러리 없음)
// 행성 위치: Paul Schlyter "How to compute planetary positions" 방식 (오차 약 1~2분각, 1900~2100년)
// 황도대는 서양 점성술의 회귀 황도대(춘분점 기준), 하우스는 상승점에서 30°씩 나누는 이퀄 하우스.

const RAD = Math.PI / 180;
const sin = (d) => Math.sin(d * RAD);
const cos = (d) => Math.cos(d * RAD);
const atan2 = (y, x) => Math.atan2(y, x) / RAD;
export const norm = (d) => ((d % 360) + 360) % 360;

export const SIGNS = [
  { name: '양자리', glyph: '♈', element: '불' },
  { name: '황소자리', glyph: '♉', element: '흙' },
  { name: '쌍둥이자리', glyph: '♊', element: '공기' },
  { name: '게자리', glyph: '♋', element: '물' },
  { name: '사자자리', glyph: '♌', element: '불' },
  { name: '처녀자리', glyph: '♍', element: '흙' },
  { name: '천칭자리', glyph: '♎', element: '공기' },
  { name: '전갈자리', glyph: '♏', element: '물' },
  { name: '사수자리', glyph: '♐', element: '불' },
  { name: '염소자리', glyph: '♑', element: '흙' },
  { name: '물병자리', glyph: '♒', element: '공기' },
  { name: '물고기자리', glyph: '♓', element: '물' },
];

export const PLANETS = [
  { key: 'sun', name: '태양', glyph: '☉' },
  { key: 'moon', name: '달', glyph: '☽' },
  { key: 'mercury', name: '수성', glyph: '☿' },
  { key: 'venus', name: '금성', glyph: '♀' },
  { key: 'mars', name: '화성', glyph: '♂' },
  { key: 'jupiter', name: '목성', glyph: '♃' },
  { key: 'saturn', name: '토성', glyph: '♄' },
  { key: 'uranus', name: '천왕성', glyph: '♅' },
  { key: 'neptune', name: '해왕성', glyph: '♆' },
  { key: 'pluto', name: '명왕성', glyph: '♇' },
];

export const ASPECTS = [
  { key: 'conjunction', name: '합', angle: 0, orb: 8, glyph: '☌' },
  { key: 'sextile', name: '육분', angle: 60, orb: 5, glyph: '⚹' },
  { key: 'square', name: '사각', angle: 90, orb: 7, glyph: '□' },
  { key: 'trine', name: '삼각', angle: 120, orb: 7, glyph: '△' },
  { key: 'opposition', name: '대립', angle: 180, orb: 8, glyph: '☍' },
];

// 2000년 1월 0일 0시(UT)부터 지난 날 수
export function dayNumber(date) {
  return (date.getTime() - Date.UTC(1999, 11, 31, 0, 0, 0)) / 86400000;
}

const ELEMENTS = {
  // N, i, w, a, e, M  (각 값은 [기준값, 하루당 변화])
  sun: [[0, 0], [0, 0], [282.9404, 4.70935e-5], [1, 0], [0.016709, -1.151e-9], [356.047, 0.9856002585]],
  moon: [[125.1228, -0.0529538083], [5.1454, 0], [318.0634, 0.1643573223], [60.2666, 0], [0.0549, 0], [115.3654, 13.0649929509]],
  mercury: [[48.3313, 3.24587e-5], [7.0047, 5e-8], [29.1241, 1.01444e-5], [0.387098, 0], [0.205635, 5.59e-10], [168.6562, 4.0923344368]],
  venus: [[76.6799, 2.4659e-5], [3.3946, 2.75e-8], [54.891, 1.38374e-5], [0.72333, 0], [0.006773, -1.302e-9], [48.0052, 1.6021302244]],
  mars: [[49.5574, 2.11081e-5], [1.8497, -1.78e-8], [286.5016, 2.92961e-5], [1.523688, 0], [0.093405, 2.516e-9], [18.6021, 0.5240207766]],
  jupiter: [[100.4542, 2.76854e-5], [1.303, -1.557e-7], [273.8777, 1.64505e-5], [5.20256, 0], [0.048498, 4.469e-9], [19.895, 0.0830853001]],
  saturn: [[113.6634, 2.3898e-5], [2.4886, -1.081e-7], [339.3939, 2.97661e-5], [9.55475, 0], [0.055546, -9.499e-9], [316.967, 0.0334442282]],
  uranus: [[74.0005, 1.3978e-5], [0.7733, 1.9e-8], [96.6612, 3.0565e-5], [19.18171, -1.55e-8], [0.047318, 7.45e-9], [142.5905, 0.011725806]],
  neptune: [[131.7806, 3.0173e-5], [1.77, -2.55e-7], [272.8461, -6.027e-6], [30.05826, 3.313e-8], [0.008606, 2.15e-9], [260.2471, 0.005995147]],
};

function elements(key, d) {
  const [N, i, w, a, e, M] = ELEMENTS[key].map(([base, rate]) => base + rate * d);
  return { N: norm(N), i, w: norm(w), a, e, M: norm(M) };
}

// 궤도 요소 → 궤도면 위치(r, v)
function orbit({ a, e, M }) {
  let E = M + (e / RAD) * sin(M) * (1 + e * cos(M));
  for (let k = 0; k < 20; k++) {
    const dE = (E - (e / RAD) * sin(E) - M) / (1 - e * cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-7) break;
  }
  const xv = a * (cos(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * sin(E);
  return { r: Math.hypot(xv, yv), v: atan2(yv, xv) };
}

function eclipticXYZ(el) {
  const { r, v } = orbit(el);
  const u = v + el.w;
  return {
    x: r * (cos(el.N) * cos(u) - sin(el.N) * sin(u) * cos(el.i)),
    y: r * (sin(el.N) * cos(u) + cos(el.N) * sin(u) * cos(el.i)),
    z: r * sin(u) * sin(el.i),
  };
}

function sunPosition(d) {
  const el = elements('sun', d);
  const { r, v } = orbit(el);
  const lon = norm(v + el.w);
  return { lon, r, x: r * cos(lon), y: r * sin(lon), L: norm(el.M + el.w) };
}

function moonLongitude(d) {
  const m = elements('moon', d);
  const s = elements('sun', d);
  const p = eclipticXYZ(m);
  const lon = atan2(p.y, p.x);
  const Ls = s.M + s.w;
  const Lm = m.M + m.w + m.N;
  const D = Lm - Ls;
  const F = Lm - m.N;
  const Mm = m.M;
  const Ms = s.M;
  return norm(lon
    - 1.274 * sin(Mm - 2 * D) + 0.658 * sin(2 * D) - 0.186 * sin(Ms)
    - 0.059 * sin(2 * Mm - 2 * D) - 0.057 * sin(Mm - 2 * D + Ms)
    + 0.053 * sin(Mm + 2 * D) + 0.046 * sin(2 * D - Ms) + 0.041 * sin(Mm - Ms)
    - 0.035 * sin(D) - 0.031 * sin(Mm + Ms) - 0.015 * sin(2 * F - 2 * D)
    + 0.011 * sin(Mm - 4 * D));
}

function plutoHelio(d) {
  const S = 50.03 + 0.033459652 * d;
  const P = 238.95 + 0.003968789 * d;
  const lon = 238.9508 + 0.00400703 * d
    - 19.799 * sin(P) + 19.848 * cos(P) + 0.897 * sin(2 * P) - 4.956 * cos(2 * P)
    + 0.61 * sin(3 * P) + 1.211 * cos(3 * P) - 0.341 * sin(4 * P) - 0.19 * cos(4 * P)
    + 0.128 * sin(5 * P) - 0.034 * cos(5 * P) - 0.038 * sin(6 * P) + 0.031 * cos(6 * P)
    + 0.02 * sin(S - P) - 0.01 * cos(S - P)
    + 3.82394e-5 * d; // 2000년 기준 → 그날 춘분점 기준(세차)
  const lat = -3.9082 - 5.453 * sin(P) - 14.975 * cos(P) + 3.527 * sin(2 * P) + 1.673 * cos(2 * P)
    - 1.051 * sin(3 * P) + 0.328 * cos(3 * P) + 0.179 * sin(4 * P) - 0.292 * cos(4 * P)
    + 0.019 * sin(5 * P) + 0.1 * cos(5 * P) - 0.031 * sin(6 * P) - 0.026 * cos(6 * P) + 0.011 * cos(S - P);
  const r = 40.72 + 6.68 * sin(P) + 6.9 * cos(P) - 1.18 * sin(2 * P) - 0.03 * cos(2 * P)
    + 0.15 * sin(3 * P) - 0.14 * cos(3 * P);
  return { x: r * cos(lon) * cos(lat), y: r * sin(lon) * cos(lat), z: r * sin(lat) };
}

function planetHelio(key, d) {
  if (key === 'pluto') return plutoHelio(d);
  const el = elements(key, d);
  const p = eclipticXYZ(el);
  const fix = { jupiter: 0, saturn: 0, uranus: 0 };
  if (key in fix) {
    const Mj = elements('jupiter', d).M;
    const Ms = elements('saturn', d).M;
    const Mu = elements('uranus', d).M;
    let dl = 0;
    if (key === 'jupiter') {
      dl = -0.332 * sin(2 * Mj - 5 * Ms - 67.6) - 0.056 * sin(2 * Mj - 2 * Ms + 21)
        + 0.042 * sin(3 * Mj - 5 * Ms + 21) - 0.036 * sin(Mj - 2 * Ms) + 0.022 * cos(Mj - Ms)
        + 0.023 * sin(2 * Mj - 3 * Ms + 52) - 0.016 * sin(Mj - 5 * Ms - 69);
    } else if (key === 'saturn') {
      dl = 0.812 * sin(2 * Mj - 5 * Ms - 67.6) - 0.229 * cos(2 * Mj - 4 * Ms - 2)
        + 0.119 * sin(Mj - 2 * Ms - 3) + 0.046 * sin(2 * Mj - 6 * Ms - 69) + 0.014 * sin(Mj - 3 * Ms + 32);
    } else {
      dl = 0.04 * sin(Ms - 2 * Mu + 6) + 0.035 * sin(Ms - 3 * Mu + 33) - 0.015 * sin(Mj - Mu + 20);
    }
    const r = Math.hypot(p.x, p.y);
    const lon = atan2(p.y, p.x) + dl;
    return { x: r * cos(lon), y: r * sin(lon), z: p.z };
  }
  return p;
}

// 한 순간의 지구 중심 황경(도)
export function longitudeAt(key, d) {
  if (key === 'sun') return sunPosition(d).lon;
  if (key === 'moon') return moonLongitude(d);
  const s = sunPosition(d);
  const h = planetHelio(key, d);
  return norm(atan2(h.y + s.y, h.x + s.x));
}

export function signOf(lon) {
  const index = Math.floor(norm(lon) / 30);
  const within = norm(lon) - index * 30;
  let deg = Math.floor(within);
  let min = Math.round((within - deg) * 60);
  if (min === 60) { deg += 1; min = 0; }
  return { index, ...SIGNS[index], deg, min, text: `${SIGNS[index].name} ${deg}°${String(min).padStart(2, '0')}′` };
}

export function moonPhase(sunLon, moonLon) {
  const angle = norm(moonLon - sunLon);
  const names = ['새달(삭)', '초승달', '상현달', '차오르는 달', '보름달', '기우는 달', '하현달', '그믐달'];
  const emojis = ['🌑', '🌒', '🌓', '🌔', '🌕', '🌖', '🌗', '🌘'];
  const i = Math.floor(norm(angle + 22.5) / 45) % 8;
  return { angle, name: names[i], emoji: emojis[i], illumination: Math.round((1 - cos(angle)) * 50) };
}

/**
 * 꿈꾼 순간의 차트
 * @param {Date} date  꿈꾼 시각 (실제 순간)
 * @param {{lat:number, lon:number}} place  위도(북+), 경도(동+)
 */
export function computeChart(date, place) {
  const d = dayNumber(date);
  const ecl = 23.4393 - 3.563e-7 * d;
  const sun = sunPosition(d);
  const utHours = (date.getTime() / 3600000) % 24;
  const lst = norm(sun.L + 180 + utHours * 15 + place.lon); // 지방 항성시(도)
  const mc = norm(atan2(sin(lst), cos(lst) * cos(ecl)));
  const asc = norm(atan2(cos(lst), -(sin(lst) * cos(ecl) + Math.tan(place.lat * RAD) * sin(ecl))));

  const planets = PLANETS.map((p) => {
    const lon = longitudeAt(p.key, d);
    const speed = norm(longitudeAt(p.key, d + 0.5) - longitudeAt(p.key, d - 0.5) + 180) - 180; // 하루당 이동(도)
    return {
      ...p,
      lon,
      sign: signOf(lon),
      house: Math.floor(norm(lon - asc) / 30) + 1,
      retrograde: speed < 0,
    };
  });

  const aspects = [];
  for (let a = 0; a < planets.length; a++) {
    for (let b = a + 1; b < planets.length; b++) {
      const sep = Math.abs(norm(planets[a].lon - planets[b].lon + 180) - 180);
      for (const asp of ASPECTS) {
        const orb = Math.abs(sep - asp.angle);
        if (orb <= asp.orb) {
          aspects.push({ a: planets[a].key, b: planets[b].key, type: asp.key, name: asp.name, glyph: asp.glyph, orb: Math.round(orb * 10) / 10 });
          break;
        }
      }
    }
  }
  aspects.sort((x, y) => x.orb - y.orb);

  return {
    time: date.toISOString(),
    place: { lat: place.lat, lon: place.lon, name: place.name || '' },
    asc: { lon: asc, sign: signOf(asc) },
    mc: { lon: mc, sign: signOf(mc) },
    planets,
    aspects,
    moonPhase: moonPhase(planets[0].lon, planets[1].lon),
    houseSystem: '이퀄 하우스',
  };
}

// "2026-11-10T03:20" 같은 현지 시각 + UTC 와의 시차(시간) → 실제 순간
export function localToDate(local, tzOffsetHours) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(local || ''));
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - Number(tzOffsetHours) * 3600000;
  return Number.isFinite(ms) ? new Date(ms) : null;
}

// 탐정(Claude)에게 건넬 차트 설명
export function describeChart(chart) {
  const name = (key) => PLANETS.find((p) => p.key === key).name;
  const lines = chart.planets.map((p) => `- ${p.name}: ${p.sign.text} (${p.house}하우스)${p.retrograde ? ' 역행' : ''}`);
  lines.push(`- 상승점(ASC): ${chart.asc.sign.text}`);
  lines.push(`- 중천점(MC): ${chart.mc.sign.text}`);
  lines.push(`- 달의 모양: ${chart.moonPhase.name} (밝기 약 ${chart.moonPhase.illumination}%)`);
  const asp = chart.aspects.slice(0, 12).map((a) => `- ${name(a.a)} ${a.name}(${a.glyph}) ${name(a.b)} (오차 ${a.orb}°)`);
  return `${lines.join('\n')}\n\n주요 각도(애스펙트, 가까운 순):\n${asp.join('\n') || '- 없음'}`;
}
