import { CONFIG } from './config.ts';
import { type Vec, pointSegDist, polyLength, v } from './geom.ts';
import { type HitInfo, type HitResult, resolveSlash } from './combat.ts';
import { type Cat, type Pose, bodyParts } from './stickman.ts';
import type { SwordDef } from './swords.ts';

/**
 * 검의 고유 스킬. 플레이어가 그린 검격(main)을 바탕으로 이번 공격의 모든 베기(Strike)를 만든다.
 *
 * - 같은 group 의 베기는 하나로 본다. 같은 부위 범주(머리/몸통/팔/다리)는 그 group 에서 한 번만 맞는다.
 * - 다른 group 은 따로 적중한다(예: 이중참의 복제 검격은 원래 검격과 별개라 같은 부위를 한 번 더 벨 수 있다).
 * - AI 는 그린 검격(main)만 읽고 방어 자세를 정한다. 스킬로 생긴 추가 베기는 AI가 예측하지 못한다.
 */
export type StrikeKind = 'main' | 'echo' | 'frost' | 'bolt' | 'moon';

export interface Strike {
  kind: StrikeKind;
  /** 판정에 쓰는 선 */
  pts: Vec[];
  /** 화면에 그리는 선(번개는 구불구불하게) */
  vis: Vec[];
  group: number;
  /** 피해 배율 */
  factor: number;
  /** 적중 연출이 시작된 뒤 이 베기가 시작되는 시각(초)과 지속 시간 */
  delay: number;
  dur: number;
  /** 판정 반폭 */
  halfWidth: number;
  /** 화면에 그리는 굵기 배율 */
  ws: number;
}

export interface Blast {
  c: Vec;
  r: number;
  delay: number;
  /** 피어나는 시간(초). 0이면 바로 터진다 */
  bloom: number;
  group: number;
  factor: number;
  tag: string;
}

export interface AttackPlan {
  sword: SwordDef;
  /** 스킬을 켜고 쓴 공격인가 */
  active: boolean;
  strikes: Strike[];
  blasts: Blast[];
  /** 모든 효과가 끝나는 시각(적중 연출 시작 기준, 초) */
  end: number;
}

const W = CONFIG.arena.w;
const H = CONFIG.arena.h;
const S = CONFIG.skill;

/** 같은 seed 면 같은 결과를 내는 난수(미리보기와 실제 공격이 어긋나지 않게) */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clampArena = (p: Vec): Vec => v(Math.min(W, Math.max(0, p.x)), Math.min(H, Math.max(0, p.y)));

/** 선을 수직 방향으로 d 만큼 옮긴다(꼭짓점마다 접선 기준) */
export function offsetPolyline(pts: Vec[], d: number, clamp = true): Vec[] {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(pts.length - 1, i + 1)];
    const tx = b.x - a.x;
    const ty = b.y - a.y;
    const n = Math.hypot(tx, ty) || 1;
    const q = v(p.x + (-ty / n) * d, p.y + (tx / n) * d);
    return clamp ? clampArena(q) : q;
  });
}

function boltPath(a: Vec, b: Vec, rng: () => number): Vec[] {
  const N = 12;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const out: Vec[] = [a];
  for (let i = 1; i < N; i++) {
    const t = i / N;
    const off = (rng() - 0.5) * 36;
    out.push(clampArena(v(a.x + dx * t + nx * off, a.y + dy * t + ny * off)));
  }
  out.push(b);
  return out;
}

export function planAttack(sword: SwordDef, main: Vec[], active: boolean, seed: number, cutDur: number): AttackPlan {
  const rng = seeded(seed);
  const W0 = CONFIG.slashHalfWidth;
  const strikes: Strike[] = [{ kind: 'main', pts: main, vis: main, group: 0, factor: 1, delay: 0, dur: cutDur, halfWidth: W0, ws: 1 }];
  const plan: AttackPlan = { sword, active, strikes, blasts: [], end: cutDur };
  if (!active || main.length < 2) return plan;
  const first = main[0];
  const last = main[main.length - 1];
  switch (sword.skill) {
    case 'echo': {
      const inside = (d: number) => offsetPolyline(main, d, false).filter((p) => p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H).length;
      const side = inside(S.echoOffset) >= inside(-S.echoOffset) ? 1 : -1;
      const pts = offsetPolyline(main, side * S.echoOffset);
      strikes.push({ kind: 'echo', pts, vis: pts, group: 1, factor: S.echoFactor, delay: 0.06, dur: cutDur, halfWidth: W0, ws: 1 });
      break;
    }
    case 'frost': {
      for (const sgn of [1, -1]) {
        const pts = offsetPolyline(main, sgn * S.frostOffset);
        strikes.push({ kind: 'frost', pts, vis: pts, group: 0, factor: 1, delay: 0.1, dur: cutDur, halfWidth: W0, ws: 1 });
      }
      break;
    }
    case 'shatter':
      strikes[0].halfWidth = S.thickHalfWidth;
      strikes[0].ws = S.thickScale;
      break;
    case 'blast':
      plan.blasts = [
        { c: first, r: S.blastRadius, delay: 0.03, bloom: 0, group: 0, factor: 1, tag: '폭염' },
        { c: last, r: S.blastRadius, delay: cutDur + 0.03, bloom: 0, group: 0, factor: 1, tag: '폭염' },
      ];
      break;
    case 'blossom': {
      const m = S.blossomRadius * 0.5;
      plan.blasts = Array.from({ length: S.blossomCount }, (_, i) => ({
        c: v(m + rng() * (W - 2 * m), m + rng() * (H - 2 * m)),
        r: S.blossomRadius,
        delay: S.blossomBloom + i * S.blossomGap,
        bloom: S.blossomBloom,
        group: 4,
        factor: S.blossomFactor,
        tag: '매화',
      }));
      break;
    }
    case 'thunder': {
      const vis = boltPath(first, last, rng);
      strikes.push({ kind: 'bolt', pts: [first, last], vis, group: 2, factor: S.boltFactor, delay: 0.1, dur: 0.12, halfWidth: W0, ws: 1 });
      break;
    }
    case 'eclipse': {
      const pts = main.map((p) => v(W - p.x, H - p.y)).reverse();
      strikes.push({ kind: 'moon', pts, vis: pts, group: 3, factor: S.moonFactor, delay: cutDur + 0.18, dur: cutDur, halfWidth: W0, ws: 1 });
      break;
    }
    default:
      break;
  }
  plan.end = Math.max(...strikes.map((s) => s.delay + s.dur), ...plan.blasts.map((b) => b.delay + 0.3));
  return plan;
}

/** AI 가 읽는 검격 조각들. 그린 검격(main)만 읽는다. */
export function visibleParts(plan: AttackPlan): Vec[][] {
  return [plan.strikes[0].pts];
}

const TAGS: Partial<Record<StrikeKind, string>> = { echo: '이중참', frost: '서리', bolt: '낙뢰', moon: '월식참' };

/** 이번 공격 전체가 이 자세에 입힌 피해. 적중 시각 순서로 정렬된다. */
export function resolvePlan(plan: AttackPlan, pose: Pose): HitResult {
  const byGroup = new Map<number, Map<Cat, HitInfo>>();
  const put = (group: number, h: HitInfo) => {
    let m = byGroup.get(group);
    if (!m) byGroup.set(group, (m = new Map()));
    const prev = m.get(h.cat);
    if (!prev || h.time < prev.time) m.set(h.cat, h);
  };
  const dmgOf = (cat: Cat, factor: number) => Math.max(1, Math.round(CONFIG.damage[cat] * pose.dims.vuln[cat] * factor));

  for (const st of plan.strikes) {
    const len = polyLength(st.pts) || 1;
    for (const h of resolveSlash(st.pts, pose, st.halfWidth).hits) {
      put(st.group, { ...h, time: st.delay + st.dur * (h.s / len), damage: dmgOf(h.cat, st.factor), tag: TAGS[st.kind] });
    }
  }
  for (const b of plan.blasts) {
    const seen = new Set<Cat>();
    for (const part of bodyParts(pose)) {
      if (seen.has(part.cat)) continue;
      const d = pointSegDist(b.c, part.a, part.b);
      if (d <= b.r + part.r) {
        seen.add(part.cat);
        put(b.group, { cat: part.cat, s: 0, time: b.delay, point: b.c, damage: dmgOf(part.cat, b.factor), tag: b.tag });
      }
    }
  }

  const hits: HitInfo[] = [];
  for (const [group, m] of byGroup) {
    for (const h of m.values()) {
      let bonus = 0;
      let tag = h.tag;
      if (group === 0 && plan.active) {
        if (plan.sword.skill === 'rend') {
          bonus += S.bleed;
          tag = tag ?? '열상';
        }
      }
      hits.push({ ...h, damage: h.damage + bonus, bonus: bonus || undefined, tag, s: h.time });
    }
  }
  hits.sort((x, y) => x.time - y.time);
  return { hits, total: hits.reduce((sum, h) => sum + h.damage, 0) };
}
