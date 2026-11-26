import { CONFIG } from './config.ts';
import { type BodyDims, STD_BODY, radiiOf } from './body.ts';
import { type Vec, v, add, sub, mul, dir, clamp, normAngle, lerp, lerpV, closestSegSeg, pointSegDist } from './geom.ts';

const L = CONFIG.limits;
const HALF_PI = Math.PI / 2;

/**
 * 자세. 팔다리는 "절대 각도"(화면 좌표계, 0 = 오른쪽, π/2 = 아래)로 저장한다.
 * 뼈 길이는 설정값에 고정되어 있으므로 어떤 자세에서도 길이가 변하지 않는다.
 * 인덱스 0 = 화면 왼쪽, 1 = 화면 오른쪽.
 */
export interface Pose {
  /** 이 자세를 취하는 캐릭터의 체형 */
  dims: BodyDims;
  pelvis: Vec;
  /** 몸통 기울기. 0 = 수직, 양수 = 윗부분이 오른쪽으로 기움 */
  torso: number;
  /** 몸통 기준 머리 기울기 */
  head: number;
  armUp: [number, number];
  armLow: [number, number];
  thigh: [number, number];
  shin: [number, number];
}

export interface Joints {
  pelvis: Vec;
  neck: Vec;
  headC: Vec;
  hip: [Vec, Vec];
  shoulder: [Vec, Vec];
  elbow: [Vec, Vec];
  hand: [Vec, Vec];
  knee: [Vec, Vec];
  foot: [Vec, Vec];
}

export type Cat = 'head' | 'torso' | 'arm' | 'leg';

export interface Part {
  id: string;
  cat: Cat;
  a: Vec;
  b: Vec;
  r: number;
}

export type HandleId =
  | 'head'
  | 'chest'
  | 'pelvis'
  | 'elbow0'
  | 'elbow1'
  | 'hand0'
  | 'hand1'
  | 'knee0'
  | 'knee1'
  | 'foot0'
  | 'foot1';

export const HANDLE_IDS: HandleId[] = [
  'hand0',
  'hand1',
  'foot0',
  'foot1',
  'elbow0',
  'elbow1',
  'knee0',
  'knee1',
  'head',
  'chest',
  'pelvis',
];

export function clonePose(p: Pose): Pose {
  return {
    dims: p.dims,
    pelvis: { ...p.pelvis },
    torso: p.torso,
    head: p.head,
    armUp: [p.armUp[0], p.armUp[1]],
    armLow: [p.armLow[0], p.armLow[1]],
    thigh: [p.thigh[0], p.thigh[1]],
    shin: [p.shin[0], p.shin[1]],
  };
}

/** 서 있는 자세의 변형(적 캐릭터의 기본 자세용). 값이 없으면 표준 차려 자세다. */
export interface Stance {
  /** 몸통 기울기(양수 = 오른쪽) */
  torso?: number;
  /** 다리를 벌리는 정도 */
  spread?: number;
  /** 팔을 벌리는 정도 */
  armOut?: number;
}

export function idlePose(cx = CONFIG.arena.w / 2, floor = CONFIG.floorY, dims: BodyDims = STD_BODY, stance?: Stance): Pose {
  const sp = stance?.spread ?? 0;
  const ao = stance?.armOut ?? 0;
  const p: Pose = {
    dims,
    pelvis: v(cx, floor - (dims.thigh + dims.shin)),
    torso: stance?.torso ?? 0,
    head: 0,
    armUp: [HALF_PI + 0.22 + ao, HALF_PI - 0.22 - ao],
    armLow: [HALF_PI + 0.12 + ao, HALF_PI - 0.12 - ao],
    thigh: [HALF_PI + 0.1 + sp, HALF_PI - 0.1 - sp],
    shin: [HALF_PI + 0.06 + sp * 0.4, HALF_PI - 0.06 - sp * 0.4],
  };
  if (stance && (sp !== 0 || ao !== 0 || (stance.torso ?? 0) !== 0)) {
    const J = computeJoints(p);
    p.pelvis.y += floor - 0.7 - Math.max(J.foot[0].y, J.foot[1].y);
  }
  return p;
}

/** 가장 낮은 신체 부위가 바닥에 닿도록 골반 높이를 맞춘다. */
export function groundPose(p: Pose, floor = CONFIG.floorY): Pose {
  let lowest = -Infinity;
  for (const part of bodyParts(p)) lowest = Math.max(lowest, part.a.y + part.r, part.b.y + part.r);
  const q = clonePose(p);
  q.pelvis.y += floor + 10 - lowest;
  return q;
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return {
    dims: a.dims,
    pelvis: lerpV(a.pelvis, b.pelvis, t),
    torso: lerp(a.torso, b.torso, t),
    head: lerp(a.head, b.head, t),
    armUp: [lerp(a.armUp[0], b.armUp[0], t), lerp(a.armUp[1], b.armUp[1], t)],
    armLow: [lerp(a.armLow[0], b.armLow[0], t), lerp(a.armLow[1], b.armLow[1], t)],
    thigh: [lerp(a.thigh[0], b.thigh[0], t), lerp(a.thigh[1], b.thigh[1], t)],
    shin: [lerp(a.shin[0], b.shin[0], t), lerp(a.shin[1], b.shin[1], t)],
  };
}

export function computeJoints(p: Pose): Joints {
  const B = p.dims;
  const up = v(Math.sin(p.torso), -Math.cos(p.torso));
  const right = v(Math.cos(p.torso), Math.sin(p.torso));
  const neck = add(p.pelvis, mul(up, B.torso));
  const hip: [Vec, Vec] = [add(p.pelvis, mul(right, -B.hipOffset)), add(p.pelvis, mul(right, B.hipOffset))];
  const base = sub(neck, mul(up, B.shoulderDrop));
  const shoulder: [Vec, Vec] = [add(base, mul(right, -B.shoulderOffset)), add(base, mul(right, B.shoulderOffset))];
  const elbow: [Vec, Vec] = [
    add(shoulder[0], mul(dir(p.armUp[0]), B.upperArm)),
    add(shoulder[1], mul(dir(p.armUp[1]), B.upperArm)),
  ];
  const hand: [Vec, Vec] = [
    add(elbow[0], mul(dir(p.armLow[0]), B.foreArm)),
    add(elbow[1], mul(dir(p.armLow[1]), B.foreArm)),
  ];
  const knee: [Vec, Vec] = [add(hip[0], mul(dir(p.thigh[0]), B.thigh)), add(hip[1], mul(dir(p.thigh[1]), B.thigh))];
  const foot: [Vec, Vec] = [add(knee[0], mul(dir(p.shin[0]), B.shin)), add(knee[1], mul(dir(p.shin[1]), B.shin))];
  const ha = p.torso + p.head;
  const headC = add(neck, mul(v(Math.sin(ha), -Math.cos(ha)), B.neckGap + B.headR));
  return { pelvis: p.pelvis, neck, headC, hip, shoulder, elbow, hand, knee, foot };
}

export function handlePos(p: Pose, id: HandleId): Vec {
  const B = p.dims;
  const J = computeJoints(p);
  switch (id) {
    case 'head': {
      // 눈을 가리지 않도록 머리 위쪽 가장자리에 핸들을 둔다.
      const ha = p.torso + p.head;
      return add(J.neck, mul(v(Math.sin(ha), -Math.cos(ha)), B.neckGap + B.headR * 2));
    }
    case 'chest': {
      const up = v(Math.sin(p.torso), -Math.cos(p.torso));
      return add(p.pelvis, mul(up, B.torso * 0.7));
    }
    case 'pelvis':
      return J.pelvis;
    default: {
      const side = id.endsWith('0') ? 0 : 1;
      const kind = id.slice(0, -1);
      if (kind === 'elbow') return J.elbow[side];
      if (kind === 'hand') return J.hand[side];
      if (kind === 'knee') return J.knee[side];
      return J.foot[side];
    }
  }
}

export function bodyParts(p: Pose): Part[] {
  const J = computeJoints(p);
  const R = radiiOf(p.dims);
  return [
    { id: 'head', cat: 'head', a: J.headC, b: J.headC, r: R.head },
    { id: 'torso', cat: 'torso', a: J.pelvis, b: J.neck, r: R.torso },
    { id: 'armUp0', cat: 'arm', a: J.shoulder[0], b: J.elbow[0], r: R.arm },
    { id: 'armLow0', cat: 'arm', a: J.elbow[0], b: J.hand[0], r: R.arm },
    { id: 'armUp1', cat: 'arm', a: J.shoulder[1], b: J.elbow[1], r: R.arm },
    { id: 'armLow1', cat: 'arm', a: J.elbow[1], b: J.hand[1], r: R.arm },
    { id: 'thigh0', cat: 'leg', a: J.hip[0], b: J.knee[0], r: R.leg },
    { id: 'shin0', cat: 'leg', a: J.knee[0], b: J.foot[0], r: R.leg },
    { id: 'thigh1', cat: 'leg', a: J.hip[1], b: J.knee[1], r: R.leg },
    { id: 'shin1', cat: 'leg', a: J.knee[1], b: J.foot[1], r: R.leg },
  ];
}

/** 관절 가동 범위를 강제한다. */
export function clampLimits(src: Pose): Pose {
  const p = clonePose(src);
  // 몸통은 360도 회전 가능(눕기, 뒤집기)
  p.torso = normAngle(p.torso);
  p.head = clamp(p.head, -L.head, L.head);
  const torsoUp = Math.atan2(-Math.cos(p.torso), Math.sin(p.torso));
  for (let i = 0; i < 2; i++) {
    const sgn = i === 0 ? 1 : -1;
    const down = HALF_PI + p.torso;
    const out = clamp(sgn * normAngle(p.armUp[i] - down), L.armOutMin, L.armOutMax);
    p.armUp[i] = down + sgn * out;
    p.armLow[i] = p.armUp[i] + clamp(normAngle(p.armLow[i] - p.armUp[i]), -L.elbowFlex, L.elbowFlex);

    // 허벅지가 몸통 방향과 겹치지 않도록만 제한한다. (다리 교차는 겹침 검사가 막는다)
    const gap = normAngle(p.thigh[i] - torsoUp);
    if (Math.abs(gap) < L.legTorsoGap) p.thigh[i] = torsoUp + (gap >= 0 ? 1 : -1) * L.legTorsoGap;
    p.shin[i] = p.thigh[i] + clamp(normAngle(p.shin[i] - p.thigh[i]), -L.kneeFlex, L.kneeFlex);
  }
  return p;
}

const ADJACENT = new Set<string>([
  'head|torso',
  'armUp0|torso',
  'armUp1|torso',
  'thigh0|torso',
  'thigh1|torso',
  'armLow0|armUp0',
  'armLow1|armUp1',
  'shin0|thigh0',
  'shin1|thigh1',
]);

function isAdjacent(a: string, b: string): boolean {
  return ADJACENT.has(`${a}|${b}`) || ADJACENT.has(`${b}|${a}`);
}

/** 모든 신체 부위가 전투 영역 안에 있는가 */
export function insideArena(p: Pose): boolean {
  const W = CONFIG.arena.w;
  const H = CONFIG.arena.h;
  for (const part of bodyParts(p)) {
    const r = part.r;
    for (const pt of [part.a, part.b]) {
      if (pt.x - r < 0 || pt.x + r > W || pt.y - r < 0 || pt.y + r > H) return false;
    }
  }
  return true;
}

/** 신체 부위끼리 비정상적으로 겹치는가 */
export function selfOverlap(p: Pose): boolean {
  const parts = bodyParts(p);
  const sr = CONFIG.selfRadius;
  for (let i = 0; i < parts.length; i++) {
    for (let j = i + 1; j < parts.length; j++) {
      const A = parts[i];
      const Bp = parts[j];
      if (isAdjacent(A.id, Bp.id)) continue;
      if (A.id === 'head' || Bp.id === 'head') {
        const h = A.id === 'head' ? A : Bp;
        const o = A.id === 'head' ? Bp : A;
        if (pointSegDist(h.a, o.a, o.b) < radiiOf(p.dims).head + sr) return true;
      } else if (closestSegSeg(A.a, A.b, Bp.a, Bp.b).dist < sr * 2) {
        return true;
      }
    }
  }
  return false;
}

export function validatePose(p: Pose): boolean {
  return insideArena(p) && !selfOverlap(p);
}

/** 2본 IK. 현재 자세에 가장 가까운 해를 고른다. */
function solveIK(
  root: Vec,
  target: Vec,
  l1: number,
  l2: number,
  flexMax: number,
  cur: [number, number],
): [number, number] {
  const delta = sub(target, root);
  let d = Math.hypot(delta.x, delta.y);
  const phi = d < 1e-6 ? HALF_PI : Math.atan2(delta.y, delta.x);
  const beta = Math.PI - flexMax;
  const dMin = Math.sqrt(l1 * l1 + l2 * l2 - 2 * l1 * l2 * Math.cos(beta));
  d = clamp(d, dMin, l1 + l2 - 0.01);
  const alpha = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const t = add(root, mul(dir(phi), d));
  let best: [number, number] = cur;
  let bestCost = Infinity;
  for (const a1 of [phi + alpha, phi - alpha]) {
    const knee = add(root, mul(dir(a1), l1));
    const a2 = Math.atan2(t.y - knee.y, t.x - knee.x);
    const cost = Math.abs(normAngle(a1 - cur[0])) + Math.abs(normAngle(a2 - cur[1]));
    if (cost < bestCost) {
      bestCost = cost;
      best = [a1, a2];
    }
  }
  return best;
}

/** 핸들을 target 위치로 끌었을 때의 자세 (겹침/영역 검사는 하지 않음) */
export function applyDrag(pose: Pose, id: HandleId, t: Vec): Pose {
  const B = pose.dims;
  const p = clonePose(pose);
  const J = computeJoints(pose);
  if (id === 'pelvis') {
    p.pelvis = v(t.x, t.y);
  } else if (id === 'chest') {
    // 상체(몸통, 머리, 팔)가 골반을 축으로 회전한다. 다리는 그 자리에 둔다.
    const nt = Math.atan2(t.x - p.pelvis.x, -(t.y - p.pelvis.y));
    const d = normAngle(nt - p.torso);
    p.torso = nt;
    for (let i = 0; i < 2; i++) {
      p.armUp[i] += d;
      p.armLow[i] += d;
    }
  } else if (id === 'head') {
    p.head = normAngle(Math.atan2(t.x - J.neck.x, -(t.y - J.neck.y)) - p.torso);
  } else {
    const side = id.endsWith('0') ? 0 : 1;
    const kind = id.slice(0, -1);
    if (kind === 'elbow') {
      p.armUp[side] = Math.atan2(t.y - J.shoulder[side].y, t.x - J.shoulder[side].x);
    } else if (kind === 'knee') {
      p.thigh[side] = Math.atan2(t.y - J.hip[side].y, t.x - J.hip[side].x);
    } else if (kind === 'hand') {
      const [a1, a2] = solveIK(J.shoulder[side], t, B.upperArm, B.foreArm, L.elbowFlex, [pose.armUp[side], pose.armLow[side]]);
      p.armUp[side] = a1;
      p.armLow[side] = a2;
    } else if (kind === 'foot') {
      const [a1, a2] = solveIK(J.hip[side], t, B.thigh, B.shin, L.kneeFlex, [pose.thigh[side], pose.shin[side]]);
      p.thigh[side] = a1;
      p.shin[side] = a2;
    }
  }
  return p;
}

/**
 * 핸들 드래그 결과 자세. 가동 범위를 지키고, 영역 이탈이나 겹침이 생기면
 * 이동 거리를 이분 탐색으로 줄여 가능한 가장 먼 지점까지만 움직인다.
 */
export function dragPose(pose: Pose, id: HandleId, target: Vec): Pose {
  const attempt = (tg: Vec): Pose => clampLimits(applyDrag(pose, id, tg));
  const full = attempt(target);
  if (validatePose(full)) return full;
  const cur = handlePos(pose, id);
  let lo = 0;
  let hi = 1;
  let best = pose;
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    const c = attempt(lerpV(cur, target, mid));
    if (validatePose(c)) {
      best = c;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

/** 가까운 핸들 찾기 */
export function pickHandle(p: Pose, pt: Vec, radius: number): HandleId | null {
  let best: HandleId | null = null;
  let bestD = radius;
  for (const id of HANDLE_IDS) {
    const hp = handlePos(p, id);
    const d = Math.hypot(hp.x - pt.x, hp.y - pt.y);
    if (d < bestD) {
      bestD = d;
      best = id;
    }
  }
  return best;
}

/** 몸 전체를 골반 기준으로 delta만큼 회전 */
export function rotatePose(pose: Pose, delta: number): Pose {
  const p = clonePose(pose);
  p.torso = normAngle(p.torso + delta);
  for (let i = 0; i < 2; i++) {
    p.armUp[i] += delta;
    p.armLow[i] += delta;
    p.thigh[i] += delta;
    p.shin[i] += delta;
  }
  return p;
}

/** 몸 전체 회전. 영역 이탈이나 겹침이 생기면 가능한 만큼만 회전한다. */
export function rotateDrag(pose: Pose, delta: number): Pose {
  const full = clampLimits(rotatePose(pose, delta));
  if (validatePose(full)) return full;
  let lo = 0;
  let hi = 1;
  let best = pose;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    const c = clampLimits(rotatePose(pose, delta * mid));
    if (validatePose(c)) {
      best = c;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}
