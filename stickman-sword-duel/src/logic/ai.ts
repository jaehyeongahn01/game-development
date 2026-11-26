import { CONFIG } from './config.ts';
import { type Vec, v, lerpV, normAngle } from './geom.ts';
import { resolveParts, resolveSlash } from './combat.ts';
import { type BodyDims, STD_BODY } from './body.ts';
import type { AiConfig, Pattern } from './stages.ts';
import { POSES_BY_TIER, funnyPoseForStage } from './poses.ts';
import { type Pose, type Stance, idlePose, clampLimits, validatePose, insideArena, clonePose, bodyParts, groundPose } from './stickman.ts';

export type Rng = () => number;

const HALF_PI = Math.PI / 2;
const CX = CONFIG.arena.w / 2;
const FY = CONFIG.floorY;
const AW = CONFIG.arena.w;
const AH = CONFIG.arena.h;
const rand = (rng: Rng, a: number, b: number): number => a + (b - a) * rng();
const pick = <T>(rng: Rng, arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];

// ---------------------------------------------------------------- AI 공격

function buildSlash(rng: Rng, ai: AiConfig, mul = 1): Vec[] {
  const pattern: Pattern = pick(rng, ai.patterns);
  const jx = () => rand(rng, -ai.jitter * 0.7, ai.jitter * 0.7);
  const jy = () => rand(rng, -ai.jitter * 0.4, ai.jitter * 0.4);
  let length = rand(rng, ai.lenMin, ai.lenMax) * mul;
  let cx = CX + jx();
  let cy = FY - 230 + jy();
  let angle = 0;
  let N = 36;
  let shape: (u: number) => Vec;

  switch (pattern) {
    case 'horizontal':
      cy = pick(rng, [FY - 328, FY - 216, FY - 80]) + jy();
      angle = rand(rng, -0.15, 0.15);
      shape = (u) => v(length * (u - 0.5), 0);
      break;
    case 'vertical':
      length = Math.min(length, AH - 100);
      angle = HALF_PI + rand(rng, -0.15, 0.15);
      shape = (u) => v(length * (u - 0.5), 0);
      break;
    case 'diagonal':
      angle = (rng() < 0.5 ? -1 : 1) * rand(rng, 0.55, 1.0);
      shape = (u) => v(length * (u - 0.5), 0);
      break;
    case 'curve': {
      angle = rand(rng, -0.8, 0.8);
      const sag = length * 0.25 * (rng() < 0.5 ? -1 : 1);
      shape = (u) => v(length * (u - 0.5), sag * (1 - (2 * u - 1) ** 2));
      break;
    }
    case 's': {
      angle = rand(rng, -0.6, 0.6);
      const amp = length * 0.18;
      shape = (u) => v(length * (u - 0.5), amp * Math.sin(u * Math.PI * 2));
      break;
    }
    case 'wide': {
      // 넓은 범위를 쓸어내는 큰 호
      length = Math.max(length, ai.lenMax * 0.9 * mul);
      angle = rand(rng, -0.35, 0.35);
      const arc = length * 0.3 * (rng() < 0.5 ? -1 : 1);
      shape = (u) => v(length * (u - 0.5), arc * (1 - (2 * u - 1) ** 2));
      break;
    }
    case 'zigzag': {
      // 꺾이는 복잡한 경로
      N = 64;
      angle = rand(rng, -0.7, 0.7);
      const amp = rand(rng, 55, 85);
      const segs = pick(rng, [3, 4, 5]);
      const tri = (x: number) => 2 * Math.abs(2 * (x - Math.floor(x + 0.5))) - 1;
      shape = (u) => v(length * 0.62 * (u - 0.5), amp * tri(u * segs));
      break;
    }
    case 'loop': {
      // 고리를 그리며 지나가는 경로
      N = 64;
      angle = rand(rng, -0.6, 0.6);
      const R = rand(rng, 58, 80);
      const th = (u: number) => u * Math.PI * 2 * 1.35;
      const dir = rng() < 0.5 ? -1 : 1;
      shape = (u) => v(length * 0.55 * (u - 0.5) + R * Math.sin(th(u)), dir * R * (1 - Math.cos(th(u))) - dir * R);
      break;
    }
    default: {
      length = rand(rng, 240, 320) * mul;
      angle = rand(rng, -0.5, 0.5);
      cy = pattern === 'focusHead' ? FY - 328 : pattern === 'focusTorso' ? FY - 216 : FY - 80;
      cy += rand(rng, -ai.jitter * 0.2, ai.jitter * 0.2);
      cx = CX + rand(rng, -ai.jitter * 0.4, ai.jitter * 0.4);
      shape = (u) => v(length * (u - 0.5), 0);
    }
  }

  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  let pts: Vec[] = [];
  for (let i = 0; i <= N; i++) {
    const p = shape(i / N);
    pts.push(v(cx + p.x * cos - p.y * sin, cy + p.x * sin + p.y * cos));
  }
  if (rng() < 0.5) pts.reverse();
  pts = pts.map((p) => v(Math.min(AW - 10, Math.max(10, p.x)), Math.min(AH - 10, Math.max(10, p.y))));
  return truncate(pts, CONFIG.maxSlashLength * mul);
}

function truncate(pts: Vec[], max: number): Vec[] {
  const out: Vec[] = [pts[0]];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const seg = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    if (total + seg >= max) {
      out.push(lerpV(pts[i - 1], pts[i], (max - total) / seg));
      return out;
    }
    out.push(pts[i]);
    total += seg;
  }
  return out;
}

/** 방어 자세를 비슷한 종류끼리 묶는 키(눕기/뒤집기/서기 + 좌우 위치). 반복 행동 감지에 쓴다. */
export function poseKey(p: Pose): string {
  const t = Math.abs(normAngle(p.torso));
  const kind = t > 2.3 ? 'flip' : t > 1.0 ? 'lie' : 'up';
  const side = p.pelvis.x < CX - 35 ? 'L' : p.pelvis.x > CX + 35 ? 'R' : 'M';
  return `${kind}${side}`;
}

const CORNER_WINDOW = 3; // 최근 이 횟수만큼 연속으로 모서리에서 방어하면(어느 모서리든) 모서리 버티기로 본다
const EDGE_ATTACK_BAND = 90; // 가장자리 범위: 아레나 경계에서 이 거리 안쪽
let cornerAimed = false; // 이번 모서리 버티기에서 이미 첫 공격을 했는가

/** 자세의 중심이 아레나 네 모서리 중 어디에 있는지('LT','RB' 등). 모서리가 아니면 ''. */
function cornerOf(p: Pose): string {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const part of bodyParts(p)) {
    sx += part.a.x + part.b.x;
    sy += part.a.y + part.b.y;
    n += 2;
  }
  const x = sx / n;
  const y = sy / n;
  const h = x < AW * 0.32 ? 'L' : x > AW * 0.68 ? 'R' : '';
  const t = y < AH * 0.45 ? 'T' : y > AH * 0.55 ? 'B' : '';
  return h && t ? h + t : '';
}

/** 최근 방어가 모두 모서리(서로 다른 모서리여도 됨)면 가장 최근 모서리 지점을, 아니면 null */
function campedCorner(history: Pose[]): Vec | null {
  if (history.length < CORNER_WINDOW) return null;
  const last = history.slice(-CORNER_WINDOW);
  if (last.some((p) => !cornerOf(p))) return null;
  const c = cornerOf(last[last.length - 1]);
  return v(c[0] === 'L' ? AW * 0.14 : AW * 0.86, c[1] === 'T' ? AH * 0.2 : AH * 0.78);
}

/**
 * AI가 만드는 공격 검격. 길이 제한을 지킨다.
 * 플레이어의 현재 자세는 보지 않고, 기본 자세와 최근 방어 자세 기록(history, 오래된 것부터)으로 예측한다.
 * adapt 가 높을수록 기록에 맞춰 노리고, 같은 종류의 방어가 반복되면 그쪽에 더 크게 반응한다.
 */
export function generateAttackSlash(ai: AiConfig, history: Pose[] = [], rng: Rng = Math.random, lengthMul = 1): Vec[] {
  const guess = idlePose();
  const recent = history.slice(-5).reverse(); // 최신이 앞
  const keys = recent.map(poseKey);
  const repeated = keys.length >= 2 && keys[0] === keys[1];
  const weights = recent.map((_, i) => (keys[i] === keys[0] && repeated ? 1.6 : 1) * [1, 0.8, 0.6, 0.5, 0.4][i]);
  const wSum = weights.reduce((a, b) => a + b, 0);

  const score = (slash: Vec[]): number => {
    const idle = resolveSlash(slash, guess).total;
    let s = idle;
    if (ai.adapt > 0 && recent.length > 0) {
      let h = 0;
      for (let i = 0; i < recent.length; i++) h += resolveSlash(slash, recent[i]).total * weights[i];
      s = (1 - ai.adapt) * idle + ai.adapt * (h / wSum);
    }
    return s + rng() * 8 * (1 - ai.adapt * 0.8);
  };

  let best = buildSlash(rng, ai, lengthMul);
  let bestScore = score(best);
  for (let i = 1; i < ai.tries; i++) {
    const cand = buildSlash(rng, ai, lengthMul);
    const sc = score(cand);
    if (sc > bestScore) {
      best = cand;
      bestScore = sc;
    }
  }
  // 모서리에서 3번 연속 방어하면(모서리를 옮겨도 센다) 첫 공격은 반드시 그 모서리를 노린다.
  // 그 뒤로는 연속이 끊겼다가 다시 3번 연속이 될 때까지 노리지 않는다.
  const corner = ai.cornerAttack ? campedCorner(history) : null;
  let aimCorner = false;
  if (!corner) cornerAimed = false;
  else if (!cornerAimed) aimCorner = cornerAimed = true;
  if (corner && aimCorner) {
    let aimed: Vec[] | null = null;
    let aimedScore = -Infinity;
    for (let i = 0; i < Math.max(30, ai.tries); i++) {
      const cand = buildSlash(rng, ai, lengthMul);
      let mx = 0;
      let my = 0;
      for (const p of cand) {
        mx += p.x;
        my += p.y;
      }
      const dx = corner.x - mx / cand.length;
      const dy = corner.y - my / cand.length;
      const moved = cand.map((p) => v(Math.min(AW - 10, Math.max(10, p.x + dx)), Math.min(AH - 10, Math.max(10, p.y + dy))));
      const sc = resolveSlash(moved, history[history.length - 1]).total + rng() * 8;
      if (sc > aimedScore) {
        aimed = moved;
        aimedScore = sc;
      }
    }
    if (aimed) return aimed;
  }
  // 가끔은 네 면(좌/우/위/아래) 중 하나를 무작위로 골라 가장자리를 노린다.
  if (ai.edgeAttack && rng() < ai.edgeAttack) { // 확률은 스테이지(AiConfig.edgeAttack)에서 정한다
    const side = pick(rng, ['L', 'R', 'T', 'B']);
    const margin = 60; // 변을 따라 움직일 때 꼭짓점에 너무 붙지 않게
    const edgeX = rand(rng, margin, AW - margin);
    const edgeY = rand(rng, margin, AH - margin);
    const tx = side === 'L' ? EDGE_ATTACK_BAND / 2 : side === 'R' ? AW - EDGE_ATTACK_BAND / 2 : edgeX;
    const ty = side === 'T' ? EDGE_ATTACK_BAND / 2 : side === 'B' ? AH - EDGE_ATTACK_BAND / 2 : edgeY;
    let edgeBest: Vec[] | null = null;
    let edgeScore = -Infinity;
    for (let i = 0; i < Math.max(10, ai.tries); i++) {
      const cand = buildSlash(rng, ai, lengthMul);
      let mx = 0;
      let my = 0;
      for (const q of cand) {
        mx += q.x;
        my += q.y;
      }
      const dx = tx - mx / cand.length;
      const dy = ty - my / cand.length;
      const moved = cand.map((q) => v(Math.min(AW - 10, Math.max(10, q.x + dx)), Math.min(AH - 10, Math.max(10, q.y + dy))));
      const sc = score(moved);
      if (sc > edgeScore) {
        edgeBest = moved;
        edgeScore = sc;
      }
    }
    if (edgeBest) return edgeBest;
  }
  return best;
}

// ---------------------------------------------------------------- AI 방어

/** 발이 바닥 근처에 있는가(공중에 떠 있는 자세인가) */
function onGround(p: Pose): boolean {
  let lowest = -Infinity;
  for (const part of bodyParts(p)) lowest = Math.max(lowest, part.a.y + part.r, part.b.y + part.r);
  return lowest > FY - 20;
}

/** 난이도별 비중(tiers)에 따라 회피 자세를 하나 만든다. 유효하지 않으면 몇 번 더 시도하고, 끝내 안 되면 기본 자세를 쓴다. */
function randomPose(ai: AiConfig, dims: BodyDims, stance: Stance | undefined, rng: Rng): Pose {
  const total = ai.tiers.reduce((a, b) => a + b, 0);
  for (let attempt = 0; attempt < 4; attempt++) {
    let r = rng() * total;
    let tier = 0;
    for (; tier < ai.tiers.length - 1; tier++) {
      r -= ai.tiers[tier];
      if (r < 0) break;
    }
    const list = POSES_BY_TIER[tier];
    const def = pick(rng, list);
    const pose = def.build(rng, dims, stance);
    // 5단계(free)는 모양이 비현실적이어도 되므로 전투 영역 안에 있기만 하면 된다.
    if (def.free ? insideArena(pose) : validatePose(pose)) return pose;
  }
  return idlePose(CX, FY, dims, stance);
}

/** 고른 자세를 조금씩 흔들어 보며 예상 피해가 더 작은 자세로 다듬는다. */
function refinePose(pose: Pose, slash: Vec[][], rounds: number, rng: Rng): Pose {
  let best = pose;
  let bestDmg = resolveParts(slash, best).total;
  const grounded = onGround(pose);
  for (let i = 0; i < rounds && bestDmg > 0; i++) {
    const q = clonePose(best);
    q.pelvis.x += rand(rng, -30, 30);
    q.torso += rand(rng, -0.25, 0.25);
    for (let k = 0; k < 2; k++) {
      q.armUp[k] += rand(rng, -0.35, 0.35);
      q.armLow[k] += rand(rng, -0.35, 0.35);
      q.thigh[k] += rand(rng, -0.3, 0.3);
      q.shin[k] += rand(rng, -0.3, 0.3);
    }
    let c = clampLimits(q);
    if (grounded) c = groundPose(c);
    if (!validatePose(c)) continue;
    const d = resolveParts(slash, c).total;
    if (d < bestDmg) {
      best = c;
      bestDmg = d;
    }
  }
  return best;
}

/**
 * AI의 방어 자세. 후보 자세들의 예상 피해를 비교하되,
 * 스테이지 설정에 따라 최선의 자세를 고를 확률과 다듬는 횟수가 달라져 항상 완벽하게 피하지는 않는다.
 */
/** slash: AI가 읽는 검격 조각들(지금은 그린 검격 하나). */
export function chooseDefensePose(slash: Vec[][], ai: AiConfig, dims: BodyDims = STD_BODY, stance?: Stance, rng: Rng = Math.random): Pose {
  const cands: { pose: Pose; dmg: number }[] = [];
  for (let i = 0; i < ai.candidates; i++) {
    const pose = randomPose(ai, dims, stance, rng);
    cands.push({ pose, dmg: resolveParts(slash, pose).total });
  }
  if (rng() < ai.bestDefense) {
    const min = Math.min(...cands.map((c) => c.dmg));
    const best = pick(rng, cands.filter((c) => c.dmg === min)).pose;
    return ai.refine > 0 ? refinePose(best, slash, ai.refine, rng) : best;
  }
  return pick(rng, cands).pose;
}

// ---------------------------------------------------------------- 개그 회피 포즈

/** 한 스테이지의 개그 포즈 일정. turns[k] = k번째로 나올 수 있는 가장 이른 내 공격 턴 번호. */
export interface FunnyPlan {
  turns: number[];
  used: number;
}

export function makeFunnyPlan(rng: Rng = Math.random): FunnyPlan {
  const first = 2 + Math.floor(rng() * 2); // 1턴은 튜토리얼과 겹치지 않게 제외
  const turns = [first];
  if (rng() < 0.5) turns.push(first + 3 + Math.floor(rng() * 3));
  return { turns, used: 0 };
}

export interface FunnyCtx {
  stageId: number;
  plan: FunnyPlan;
  turn: number;
  enemyHp: number;
  /** 실제 판정(resolvePlan(plan, p).total) */
  damageOf: (p: Pose) => number;
}

/**
 * 일반 방어 자세를 항상 먼저 정하고(난수 소비는 기존과 같다), 일정이 된 턴에만 그 스테이지의 개그 포즈로 바꾼다.
 * 개그 포즈는 무적이 아니며 같은 판정 경로를 탄다. 다만 일반 방어가 막았을 마무리 한 방이
 * 개그 포즈 때문에 성사되는 경우만 건너뛴다(일정은 유지하고 다음 턴에 다시 시도).
 */
export function chooseDefenseWithFunny(
  slash: Vec[][],
  ai: AiConfig,
  dims: BodyDims,
  stance: Stance | undefined,
  rng: Rng,
  f: FunnyCtx,
): { pose: Pose; funny: string | null } {
  const normal = chooseDefensePose(slash, ai, dims, stance, rng);
  const plan = f.plan;
  if (plan.used >= plan.turns.length || f.turn < plan.turns[plan.used]) return { pose: normal, funny: null };
  const def = funnyPoseForStage(f.stageId);
  const fp = def.build(dims);
  if (!fp) return { pose: normal, funny: null };
  if (f.damageOf(fp) >= f.enemyHp && f.damageOf(normal) < f.enemyHp) return { pose: normal, funny: null };
  plan.used++;
  if (plan.used < plan.turns.length) plan.turns[plan.used] = Math.max(plan.turns[plan.used], f.turn + 3);
  return { pose: fp, funny: def.name };
}
