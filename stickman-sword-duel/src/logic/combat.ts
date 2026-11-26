import { CONFIG } from './config.ts';
import { type Vec, closestSegSeg, dist, lerpV } from './geom.ts';
import { type Cat, type Pose, bodyParts } from './stickman.ts';

export interface HitInfo {
  cat: Cat;
  /** 검격 시작점부터 처음 적중한 지점까지의 호 길이 */
  s: number;
  point: Vec;
  damage: number;
  /** 판정 시각(초). 적중 연출이 시작된 뒤 얼마나 지났을 때 들어가는가 */
  time: number;
  /** 스킬로 더해진 피해와 그 이름 */
  bonus?: number;
  tag?: string;
}

export interface HitResult {
  /** 적중 순서대로 정렬. 같은 부위 범주(머리/몸통/팔/다리)는 최대 한 번만 들어간다. */
  hits: HitInfo[];
  total: number;
}

/**
 * 검격 폴리라인과 신체 캡슐(선분 + 반지름)의 교차를 판정한다.
 * 부위 범주별로 가장 먼저 닿은 지점을 기록하고 고정 피해를 한 번만 부여한다.
 */
export function resolveSlash(slash: Vec[], pose: Pose, halfWidth = CONFIG.slashHalfWidth): HitResult {
  const first = new Map<Cat, HitInfo>();
  const parts = bodyParts(pose);
  let base = 0;
  for (let i = 1; i < slash.length; i++) {
    const a = slash[i - 1];
    const b = slash[i];
    const segLen = dist(a, b);
    for (const part of parts) {
      const c = closestSegSeg(a, b, part.a, part.b);
      if (c.dist <= part.r + halfWidth) {
        const s = base + segLen * c.s;
        const prev = first.get(part.cat);
        if (!prev || s < prev.s) {
          first.set(part.cat, {
            cat: part.cat,
            s,
            time: s,
            point: lerpV(a, b, c.s),
            damage: Math.max(1, Math.round(CONFIG.damage[part.cat] * pose.dims.vuln[part.cat])),
          });
        }
      }
    }
    base += segLen;
  }
  const hits = [...first.values()].sort((x, y) => x.s - y.s);
  return { hits, total: hits.reduce((sum, h) => sum + h.damage, 0) };
}

/** 여러 조각의 검격을 하나로 보고 판정한다(같은 부위 범주는 한 번만). AI가 일부만 볼 때 쓴다. */
export function resolveParts(parts: Vec[][], pose: Pose): HitResult {
  const best = new Map<Cat, HitInfo>();
  for (const part of parts) {
    for (const h of resolveSlash(part, pose).hits) {
      const prev = best.get(h.cat);
      if (!prev || h.s < prev.s) best.set(h.cat, h);
    }
  }
  const hits = [...best.values()].sort((x, y) => x.s - y.s);
  return { hits, total: hits.reduce((sum, h) => sum + h.damage, 0) };
}

export const CAT_NAMES: Record<Cat, string> = { head: '머리', torso: '몸통', arm: '팔', leg: '다리' };
