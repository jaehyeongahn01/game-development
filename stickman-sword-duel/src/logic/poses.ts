import { CONFIG } from './config.ts';
import { normAngle } from './geom.ts';
import type { BodyDims } from './body.ts';
import { type Pose, type Stance, idlePose, clampLimits, groundPose, bodyParts, insideArena } from './stickman.ts';

/**
 * AI 회피 자세 라이브러리. assets/reference/ai-posture-reference.png 의 자세를 4단계로 나누고, 5단계(극한)를 더한 것이다.
 * 기준은 "맞히기 어려운 정도"다. 몸이 중앙에 있고 크게 펴져 있으면 쉬움, 낮게 웅크리거나 중앙을 벗어날수록 어려움.
 * 1 = 매우 쉬움, 2 = 보통, 3 = 어려움, 4 = 매우 어려움.
 * 5 = 극한: 졸라맨 모양이 비현실적이어도(팔다리가 겹치거나 관절 범위를 넘어도) 맞히기 가장 어렵게 만든 자세.
 *     몸 크기와 길이는 그대로 두고, 위치는 가장자리를 포함해 여러 곳에 놓는다. 전투 영역 안에는 반드시 들어온다.
 * 각도는 화면 좌표계(0 = 오른쪽, π/2 = 아래, -π/2 = 위). 한쪽 모양만 적고 좌우 반전은 무작위로 한다.
 */
export type Rng = () => number;

export interface PoseDef {
  id: string;
  name: string;
  tier: 1 | 2 | 3 | 4 | 5;
  /** true 면 몸 겹침, 관절 범위를 검사하지 않는다(5단계). */
  free?: boolean;
  build: (rng: Rng, dims: BodyDims, stance?: Stance) => Pose;
}

const CX = CONFIG.arena.w / 2;
const FY = CONFIG.floorY;
const D = Math.PI / 2; // 아래
const PI = Math.PI;
const rand = (rng: Rng, a: number, b: number): number => a + (b - a) * rng();

export interface Spec {
  /** 몸통 기울기 */
  t?: number;
  /** 머리 기울기 */
  h?: number;
  /** 팔 윗부분 / 아랫부분 [왼쪽, 오른쪽] */
  aU?: [number, number];
  aL?: [number, number];
  /** 허벅지 / 정강이 [왼쪽, 오른쪽] */
  tU?: [number, number];
  sL?: [number, number];
  /** true 면 팔(다리) 각도를 몸통 기울기와 상관없이 화면 기준으로 쓴다. 기본은 몸통을 따라 돈다. */
  absA?: boolean;
  absL?: boolean;
  /** 위로 띄우는 높이(공중 자세). 0이면 바닥에 닿게 한다. */
  lift?: number;
  /** 몸 전체를 이 각도만큼 더 돌린다(눕기, 물구나무) */
  roll?: number;
}

/** 각도 값에 약간의 흔들림을 준다 */
const jig = (rng: Rng, a: number, amt: number): number => a + rand(rng, -amt, amt);

export function make(rng: Rng, dims: BodyDims, stance: Stance | undefined, s: Spec): Pose {
  const base = idlePose(CX + rand(rng, -35, 35), FY, dims, stance);
  const t = (s.t ?? 0) + (s.roll ?? 0);
  const j = (a: number) => jig(rng, a, 0.07);
  const addA = s.absA ? 0 : t;
  const addL = s.absL ? 0 : t;
  const p: Pose = {
    dims,
    pelvis: base.pelvis,
    torso: t,
    head: s.h ?? 0,
    armUp: s.aU ? [j(s.aU[0]) + addA, j(s.aU[1]) + addA] : [base.armUp[0] + addA, base.armUp[1] + addA],
    armLow: s.aL ? [j(s.aL[0]) + addA, j(s.aL[1]) + addA] : [base.armLow[0] + addA, base.armLow[1] + addA],
    thigh: s.tU ? [j(s.tU[0]) + addL, j(s.tU[1]) + addL] : [base.thigh[0] + addL, base.thigh[1] + addL],
    shin: s.sL ? [j(s.sL[0]) + addL, j(s.sL[1]) + addL] : [base.shin[0] + addL, base.shin[1] + addL],
  };
  const c = clampLimits(p);
  const g = groundPose(c);
  if (s.lift) g.pelvis.y -= s.lift * rand(rng, 0.8, 1.1);
  return g;
}

/** 5단계 자세를 영역 안의 여러 위치(가장자리, 왼쪽/오른쪽 사분점, 중앙)에 놓고, 가끔 공중에 띄운다. */
function placeFree(rng: Rng, p: Pose): Pose {
  const W = CONFIG.arena.w;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const part of bodyParts(p)) {
    for (const pt of [part.a, part.b]) {
      minX = Math.min(minX, pt.x - part.r);
      maxX = Math.max(maxX, pt.x + part.r);
      minY = Math.min(minY, pt.y - part.r);
      maxY = Math.max(maxY, pt.y + part.r);
    }
  }
  const w = maxX - minX;
  const m = 3;
  const targets = [m, m, W * 0.25 - w / 2, W / 2 - w / 2 + rand(rng, -30, 30), W * 0.75 - w / 2, W - m - w, W - m - w];
  const left = Math.min(W - m - w, Math.max(m, targets[Math.floor(rng() * targets.length) % targets.length]));
  const q: Pose = { ...p, pelvis: { x: p.pelvis.x + (left - minX), y: p.pelvis.y + (FY + 10 - maxY) } };
  if (rng() < 0.3) q.pelvis.y -= rand(rng, 0, Math.min(220, minY + (FY + 10 - maxY) - m));
  return q;
}

/** 5단계용: 관절 범위와 겹침 검사 없이 각도를 그대로 쓴다. */
export function makeFree(rng: Rng, dims: BodyDims, stance: Stance | undefined, s: Spec): Pose {
  const base = idlePose(CX, FY, dims, stance);
  const j = (a: number) => jig(rng, a, 0.04);
  const t = s.t ?? 0;
  const addA = s.absA ? 0 : t;
  const addL = s.absL ? 0 : t;
  const p: Pose = {
    dims,
    pelvis: base.pelvis,
    torso: t,
    head: s.h ?? 0,
    armUp: s.aU ? [j(s.aU[0]) + addA, j(s.aU[1]) + addA] : [base.armUp[0] + addA, base.armUp[1] + addA],
    armLow: s.aL ? [j(s.aL[0]) + addA, j(s.aL[1]) + addA] : [base.armLow[0] + addA, base.armLow[1] + addA],
    thigh: s.tU ? [j(s.tU[0]) + addL, j(s.tU[1]) + addL] : [base.thigh[0] + addL, base.thigh[1] + addL],
    shin: s.sL ? [j(s.sL[0]) + addL, j(s.sL[1]) + addL] : [base.shin[0] + addL, base.shin[1] + addL],
  };
  return placeFree(rng, p);
}

/** 좌우 반전 */
export function mirrorPose(p: Pose): Pose {
  const m = (a: number) => normAngle(PI - a);
  return {
    dims: p.dims,
    pelvis: { x: 2 * CX - p.pelvis.x, y: p.pelvis.y },
    torso: normAngle(-p.torso),
    head: -p.head,
    armUp: [m(p.armUp[1]), m(p.armUp[0])],
    armLow: [m(p.armLow[1]), m(p.armLow[0])],
    thigh: [m(p.thigh[1]), m(p.thigh[0])],
    shin: [m(p.shin[1]), m(p.shin[0])],
  };
}

const def = (id: string, name: string, tier: 1 | 2 | 3 | 4 | 5, spec: Spec | ((rng: Rng) => Spec)): PoseDef => ({
  id,
  name,
  tier,
  build: (rng, dims, stance) => {
    const s = typeof spec === 'function' ? spec(rng) : spec;
    const p = make(rng, dims, stance, s);
    return rng() < 0.5 ? mirrorPose(p) : p;
  },
});

const defFree = (id: string, name: string, spec: Spec): PoseDef => ({
  id,
  name,
  tier: 5,
  free: true,
  build: (rng, dims, stance) => {
    const p = makeFree(rng, dims, stance, spec);
    return rng() < 0.5 ? mirrorPose(p) : p;
  },
});

export const POSE_LIBRARY: PoseDef[] = [
  // ---------------------------------------------------------------- 1단계: 매우 쉬움 (중앙에 있고 크게 펴짐)
  def('stand', '기본 서기', 1, {}),
  def('armsOut', '양팔 벌리기', 1, { aU: [D + 1.2, D - 1.2], aL: [D + 1.3, D - 1.3], tU: [D + 0.3, D - 0.3], sL: [D + 0.3, D - 0.3] }),
  def('hooray', '만세', 1, { aU: [3.7, -0.55], aL: [3.7, -0.55], tU: [D + 0.2, D - 0.2], sL: [D + 0.2, D - 0.2] }),
  def('wideStance', '다리 넓게 서기', 1, { tU: [D + 0.75, D - 0.75], sL: [D + 0.75, D - 0.75] }),
  def('tPose', 'T자 자세', 1, { aU: [PI, 0], aL: [PI, 0], tU: [D + 0.08, D - 0.08], sL: [D + 0.08, D - 0.08] }),
  def('chestOut', '가슴 펴기', 1, { t: -0.25, h: 0.2, absL: true, aU: [D + 1.0, D - 1.0], aL: [D + 1.1, D - 1.1], tU: [D + 0.15, D - 0.15], sL: [D + 0.1, D - 0.1] }),
  def('archBack', '크게 젖히기', 1, { t: 0.6, h: -0.4, absL: true, aU: [D + 0.9, D - 0.5], aL: [D + 1.0, D - 0.6], tU: [D + 0.3, D - 0.1], sL: [D + 0.35, D] }),

  // ---------------------------------------------------------------- 2단계: 보통 (조금 구부려 맞히는 면적이 줄어듦)
  def('slightBow', '살짝 숙이기', 2, { t: 0.5, h: 0.25, absL: true, tU: [D + 0.35, D - 0.2], sL: [D + 0.1, D - 0.1] }),
  def('kneeBend', '무릎 살짝 굽히기', 2, { tU: [D + 0.6, D - 0.6], sL: [D, D], aU: [D + 0.5, D - 0.5], aL: [D + 0.6, D - 0.6] }),
  def('oneArmDown', '한쪽 팔 내리기', 2, { aU: [D + 0.2, -0.25], aL: [D + 0.1, -0.15], tU: [D + 0.15, D - 0.15], sL: [D + 0.1, D - 0.1] }),
  def('oneLegUp', '한쪽 다리 들기', 2, { aU: [D + 0.5, D - 0.6], aL: [D + 0.6, D - 0.7], tU: [PI - 0.1, D - 0.05], sL: [D + 0.25, D - 0.05] }),
  def('halfSquat', '반쯤 앉기', 2, { tU: [D + 0.95, D - 0.95], sL: [D, D], aU: [D + 0.9, D - 0.9], aL: [D + 1.2, D - 1.2] }),
  def('twist', '몸 비틀기', 2, { t: 0.3, h: -0.3, absL: true, tU: [D + 0.35, D - 0.35], sL: [D + 0.1, D - 0.1], aU: [D + 0.9, D - 1.2], aL: [D + 1.2, D - 1.4] }),
  def('armGuard', '팔로 가리기', 2, { aU: [D + 0.45, D - 0.45], aL: [D + 2.4, D - 2.4], tU: [D + 0.2, D - 0.2], sL: [D + 0.1, D - 0.1] }),

  // ---------------------------------------------------------------- 3단계: 어려움 (크게 구부리거나 좌우로 틀어 중앙 면적이 줄어듦)
  def('squat', '쪼그려 앉기', 3, { tU: [D + 1.15, D - 1.15], sL: [D + 0.05, D - 0.05], aU: [D + 0.7, D - 0.7], aL: [D + 1.0, D - 1.0] }),
  def('curl', '웅크리기', 3, { t: 0.5, h: 0.5, absA: true, absL: true, tU: [D + 1.3, D - 1.3], sL: [D + 0.1, D - 0.1], aU: [D + 0.9, D - 0.9], aL: [D + 2.0, D - 2.0] }),
  def('kneel', '무릎 꿇기', 3, { tU: [D + 0.15, D - 0.15], sL: [PI - 0.25, 0.25], aU: [D + 0.5, D - 0.5], aL: [D + 1.0, D - 1.0] }),
  def('sideLow', '옆으로 낮추기', 3, { t: 1.25, h: -0.5, absA: true, absL: true, aU: [D + 1.6, D - 0.2], aL: [D + 1.7, D - 0.1], tU: [PI - 0.15, PI - 0.9], sL: [PI - 0.4, D + 0.9] }),
  def('halfGuard', '하프 가드(낮게 가리기)', 3, { t: 0.35, h: 0.3, absA: true, absL: true, tU: [D + 1.2, D - 1.2], sL: [D, D], aU: [D + 0.7, D - 0.5], aL: [D + 2.2, D - 1.8] }),
  def('sideLean', '한쪽으로 기울이기', 3, { t: 0.95, h: -0.3, absL: true, aU: [D + 1.5, D - 0.4], aL: [D + 1.6, D - 0.4], tU: [D + 0.55, D - 0.1], sL: [D + 0.1, D + 0.05] }),
  def('rollReady', '몸 말기(구르기 준비)', 3, { t: 0.75, h: 0.7, absA: true, absL: true, tU: [D + 1.45, D - 1.45], sL: [D - 0.1, D + 0.1], aU: [D + 1.0, D - 0.5], aL: [D + 2.4, D - 1.4] }),

  // ---------------------------------------------------------------- 4단계: 매우 어려움 (아주 작거나 중앙을 크게 벗어남)
  def('prone', '엎드리기(낮게)', 4, { t: 1.55 }),
  def('sideCurl', '옆으로 누워 웅크리기', 4, { t: 1.36, h: 0.27, absL: true, tU: [3.35, 2.83], sL: [3.6, 3.61], aU: [1.72, 1.23], aL: [2.1, -1.57] }),
  def('split', '다리 찢기(낮게)', 4, { aU: [PI - 0.3, 0.3], aL: [PI - 0.2, 0.2], tU: [PI - 0.02, 0.02], sL: [PI, 0] }),
  def('bridge', '뒤로 꺾기(브리지)', 4, { t: 2.39, h: 0.62, absA: true, absL: true, tU: [3.27, 1.98], sL: [2.59, 0.92], aU: [0.48, 2.29], aL: [1.08, 1.72] }),

  // ---------------------------------------------------------------- 5단계: 극한 (비현실적인 모양 허용, 위치도 다양)
  defFree('ball', '완전히 웅크리기(공처럼 말기)', { t: 1.53, h: -0.88, absA: true, absL: true, aU: [-2.44, -1.53], aL: [0.72, 2.07], tU: [-0.9, -0.35], sL: [1.54, -2.8] }),
  defFree('gamma', 'ㄱ자 자세(몸 접기)', { t: -D, h: 0, absA: true, absL: true, aU: [PI, PI], aL: [PI, PI], tU: [D, D], sL: [D, D] }),
  defFree('nieun', 'ㄴ자 자세(몸 접기)', { t: 0, absA: true, absL: true, aU: [D, D], aL: [D, D], tU: [0.02, -0.02], sL: [0.02, -0.02] }),
];

export const POSES_BY_TIER: PoseDef[][] = [1, 2, 3, 4, 5].map((t) => POSE_LIBRARY.filter((d) => d.tier === t));

// ---------------------------------------------------------------- 개그 회피 포즈
/**
 * assets/reference/funny-posture-reference.png 의 12개 포즈. POSE_LIBRARY 에 넣지 않으므로 평소 방어 자세 추첨에는 나오지 않는다.
 * 각도는 화면 좌표(0 = 오른쪽, π/2 = 아래, 3π/2 또는 -π/2 = 위). 인덱스 0 = 화면 왼쪽, 1 = 화면 오른쪽.
 * torso 양수는 윗몸이 오른쪽으로 기운다. head 는 몸통 기준이다. 팔·다리 각도는 모두 절대 각도다(몸통 기울기를 더하지 않는다).
 * 왼팔(0)이 위로 가는 값은 3π/2 쪽, 오른팔(1)이 위로 가는 값은 -π/2 쪽으로 써서 idlePose 에서 보간할 때 팔이 몸을 가로지르지 않게 한다.
 * 그래서 좌우 반전을 하지 않는다(레퍼런스의 방향 그대로).
 */
export interface FunnyPoseDef {
  id: string;
  name: string;
  /** 맞출 수 없는 체형/영역이면 null (호출자가 일반 방어 자세로 대체) */
  build: (dims: BodyDims) => Pose | null;
}

/** 지터와 관절 한계 없이 spec 각도를 그대로 쓰고, 바닥에 붙인 뒤 영역 안으로 옮긴다. 들어갈 수 없으면 null. */
function makeExact(dims: BodyDims, s: Spec): Pose | null {
  const base = idlePose(CX, FY, dims);
  const p: Pose = {
    dims,
    pelvis: base.pelvis,
    torso: s.t ?? 0,
    head: s.h ?? 0,
    armUp: s.aU ? [s.aU[0], s.aU[1]] : [base.armUp[0], base.armUp[1]],
    armLow: s.aL ? [s.aL[0], s.aL[1]] : [base.armLow[0], base.armLow[1]],
    thigh: s.tU ? [s.tU[0], s.tU[1]] : [base.thigh[0], base.thigh[1]],
    shin: s.sL ? [s.sL[0], s.sL[1]] : [base.shin[0], base.shin[1]],
  };
  const g = groundPose(p);
  const W = CONFIG.arena.w;
  const m = 3;
  for (let lift = s.lift ?? 0; ; lift = Math.max(0, lift - 10)) {
    const q: Pose = { ...g, pelvis: { x: g.pelvis.x, y: g.pelvis.y - lift } };
    let minX = Infinity;
    let maxX = -Infinity;
    for (const part of bodyParts(q)) {
      for (const pt of [part.a, part.b]) {
        minX = Math.min(minX, pt.x - part.r);
        maxX = Math.max(maxX, pt.x + part.r);
      }
    }
    if (maxX - minX > W - 2 * m) return null;
    q.pelvis.x += Math.max(0, m - minX) - Math.max(0, maxX - (W - m));
    if (insideArena(q)) return q;
    if (lift === 0) break;
  }
  return null;
}

const T = PI * 1.5;
const SPEC_FUNNY: Spec[] = [
  { t: -0.45, h: -0.25, aU: [4.2, -1.0], aL: [5.0, -2.6], tU: [1.9, 1.7], sL: [1.6, 1.5] },
  { t: 0.35, h: 0.1, aU: [4.5, 0.2], aL: [5.7, 0.1], tU: [2.9, 1.9], sL: [1.7, 2.4], lift: 55 },
  { t: -0.5, h: 0.3, aU: [0.9, 0.1], aL: [-0.2, -0.1], tU: [1.25, 1.1], sL: [1.25, 1.1] },
  { t: 0, h: 0, aU: [PI, 0], aL: [T, -PI / 2], tU: [2.4, 0.74], sL: [1.75, 1.39] },
  { t: -0.45, aU: [2.3, -0.1], aL: [0.9, -0.1], tU: [2.6, 0.55], sL: [2.1, 1.0] },
  { t: 0, h: 0, aU: [4.0, -0.86], aL: [5.6, -2.46], tU: [1.7, 1.45], sL: [1.6, 1.55] },
  { t: -0.1, h: 0.25, aU: [1.85, 1.29], aL: [5.1, -1.96], tU: [1.6, 1.1], sL: [1.55, 2.2] },
  { t: 0.15, h: 0.2, aU: [2.7, -1.45], aL: [4.4, -2.9], tU: [2.5, 0.75], sL: [1.8, 1.45] },
  { t: -0.35, h: 0.1, aU: [1.9, 0.55], aL: [1.7, 1.9], tU: [2.0, 1.85], sL: [1.45, 1.6] },
  { t: 0.05, h: 0.15, aU: [1.75, 1.4], aL: [0.15, -1.9], tU: [1.45, 1.65], sL: [1.2, 1.9] },
  { t: -1.0, h: -0.4, aU: [2.4, -0.15], aL: [2.2, -0.1], tU: [1.3, 1.15], sL: [1.3, 1.15] },
  { t: 0.05, h: -0.1, aU: [3.95, -0.81], aL: [3.8, -0.66], tU: [2.6, 1.45], sL: [1.7, 1.6], lift: 30 },
];

export const funnySCurve = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[0]);
export const funnyDramaticJump = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[1]);
export const funnyFingerGun = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[2]);
export const funnyPowerPose = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[3]);
export const funnyWidePoint = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[4]);
export const funnyHeadHeart = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[5]);
export const funnyFingerHeart = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[6]);
export const funnyAwkwardIdol = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[7]);
export const funnyHipSwagger = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[8]);
export const funnyLegCross = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[9]);
export const funnyDramaticLean = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[10]);
export const funnyCelebrate = (dims: BodyDims): Pose | null => makeExact(dims, SPEC_FUNNY[11]);

export const FUNNY_POSES: FunnyPoseDef[] = [
  { id: 'funny01', name: 'S자 기울기 회피', build: funnySCurve },
  { id: 'funny02', name: '드라마틱 점프 회피', build: funnyDramaticJump },
  { id: 'funny03', name: '핑거건 윙크', build: funnyFingerGun },
  { id: 'funny04', name: '양팔 파워 포즈', build: funnyPowerPose },
  { id: 'funny05', name: '와이드 지적 포즈', build: funnyWidePoint },
  { id: 'funny06', name: '머리 위 하트', build: funnyHeadHeart },
  { id: 'funny07', name: '손가락 하트', build: funnyFingerHeart },
  { id: 'funny08', name: '어색한 아이돌 포즈', build: funnyAwkwardIdol },
  { id: 'funny09', name: '허리 치켜세운 뽐내기', build: funnyHipSwagger },
  { id: 'funny10', name: '다리 꼬기 스타일 포즈', build: funnyLegCross },
  { id: 'funny11', name: '드라마틱 뒤로 젖히기', build: funnyDramaticLean },
  { id: 'funny12', name: '신나는 축하 포즈', build: funnyCelebrate },
];

/** 스테이지 N 은 N번 포즈 하나만 쓴다. 난수 없음. */
export function funnyPoseForStage(stageId: number): FunnyPoseDef {
  const n = FUNNY_POSES.length;
  return FUNNY_POSES[(((stageId - 1) % n) + n) % n];
}

/** 시작 화면 왼쪽(플레이어): 양손으로 칼을 앞쪽 아래로 늘어뜨려 든 자세. 칼은 화면에서 그린다. */
export function titlePlayerPose(): Pose {
  const p = idlePose();
  p.torso = 0.1;
  p.head = 0.08;
  p.armUp = [1.0, 1.2];
  p.armLow = [0.9, 1.1];
  p.thigh = [D + 0.42, D - 0.2];
  p.shin = [D + 0.4, D - 0.2];
  return groundPose(p);
}
/** 시작 화면 오른쪽(적): 팔짱을 낀 여유로운 서기. 칼은 뽑지 않는다. */
export function titleEnemyPose(): Pose {
  const p = idlePose();
  p.torso = 0;
  p.head = -0.05;
  p.armUp = [D + 0.08, D - 0.08];
  p.armLow = [-0.1, PI + 0.15];
  p.thigh = [D + 0.04, D - 0.04];
  p.shin = [D + 0.03, D - 0.03];
  return groundPose(p);
}
