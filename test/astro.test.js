import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeChart, describeChart, localToDate, signOf } from '../src/astro.js';

const close = (actual, expected, tol, label) =>
  assert.ok(Math.abs(((actual - expected + 540) % 360) - 180) <= tol, `${label}: ${actual} vs ${expected}`);

test('planet longitudes match reference values for 2000-01-01 12:00 UT', () => {
  // 기준값: 천문 연감(J2000.0 지구 중심 황경, 도)
  const ref = { sun: 280.37, moon: 223.32, mercury: 271.89, venus: 241.57, mars: 327.96, jupiter: 25.25, saturn: 40.40, uranus: 314.81, neptune: 303.19, pluto: 251.45 };
  const chart = computeChart(new Date(Date.UTC(2000, 0, 1, 12)), { lat: 51.48, lon: 0 });
  for (const p of chart.planets) close(p.lon, ref[p.key], p.key === 'moon' ? 0.5 : 0.2, p.key);
  assert.equal(chart.planets.find((p) => p.key === 'saturn').retrograde, true);
  assert.equal(chart.planets.find((p) => p.key === 'sun').retrograde, false);
});

test('ascendant and midheaven follow the rotating sky', () => {
  // 그리니치 항성시 약 18시 42분 → MC 는 염소자리 초반
  const chart = computeChart(new Date(Date.UTC(2000, 0, 1, 12)), { lat: 51.48, lon: 0 });
  close(chart.mc.lon, 279.6, 0.5, 'mc');
  assert.equal(chart.asc.sign.name, '양자리');
  // 상승점은 대략 하루에 한 바퀴 돎: 6시간 뒤엔 약 90° 앞
  const later = computeChart(new Date(Date.UTC(2000, 0, 1, 18)), { lat: 0, lon: 0 });
  const now = computeChart(new Date(Date.UTC(2000, 0, 1, 12)), { lat: 0, lon: 0 });
  close(later.mc.lon - now.mc.lon, 90, 6, 'mc after 6h');
});

test('full moon and new moon are detected', () => {
  // 2024-04-08 18:21 UT 개기일식(삭), 2024-04-23 23:49 UT 보름
  const seoul = { lat: 37.5665, lon: 126.978 };
  assert.equal(computeChart(new Date(Date.UTC(2024, 3, 8, 18, 21)), seoul).moonPhase.name, '새달(삭)');
  assert.equal(computeChart(new Date(Date.UTC(2024, 3, 23, 23, 49)), seoul).moonPhase.name, '보름달');
});

test('local time with Korea offset converts to the right instant', () => {
  assert.equal(localToDate('2026-11-10T07:30', 9).toISOString(), '2026-11-09T22:30:00.000Z');
  assert.equal(localToDate('nonsense', 9), null);
});

test('signOf and describeChart produce readable Korean text', () => {
  assert.equal(signOf(0).text, '양자리 0°00′');
  assert.equal(signOf(359.999).name, '물고기자리');
  assert.equal(signOf(45.5).text, '황소자리 15°30′');
  const text = describeChart(computeChart(new Date(Date.UTC(2026, 10, 9, 22, 30)), { lat: 37.5665, lon: 126.978 }));
  assert.match(text, /- 태양: 전갈자리/);
  assert.match(text, /상승점\(ASC\)/);
  assert.match(text, /달의 모양/);
});
