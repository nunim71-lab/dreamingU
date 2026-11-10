import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChart, SIGNS } from '../src/astro.js';
import { josa, readChart } from '../src/reading.js';

test('every part of the reading has text for any sky', () => {
  // 1년 동안 하루씩: 달이 모든 별자리·모양을 지나므로 빈 풀이가 없어야 함
  for (let day = 0; day < 365; day++) {
    const chart = computeChart(new Date(Date.UTC(2026, 0, 1 + day, day % 24)), { lat: 37.5665, lon: 126.978 });
    for (const item of readChart(chart)) {
      assert.ok(item.title && item.text && !item.text.includes('undefined'), JSON.stringify(item));
    }
  }
});

test('reading starts with the moon and mentions retrograde Mercury', () => {
  // 2026-11-10 서울 아침: 수성 역행 중
  const chart = computeChart(new Date(Date.UTC(2026, 10, 9, 22, 30)), { lat: 37.5665, lon: 126.978 });
  const reading = readChart(chart);
  const moon = chart.planets.find((p) => p.key === 'moon');
  assert.equal(reading[0].title, `달이 ${moon.sign.name}에`);
  assert.equal(reading[1].title, chart.moonPhase.name);
  assert.ok(reading.some((r) => r.title === '수성 역행'));
  assert.ok(SIGNS.some((s) => reading[2].title.includes(s.name)));
});

test('josa picks the right particle for the last syllable', () => {
  assert.equal(josa('의지·분노', '과', '와'), '와');
  assert.equal(josa('꿈·환상', '과', '와'), '과');
  assert.equal(josa('분노', '이', '가'), '가');
});
