import { clamp } from './geom.ts';
import { type Pose, clonePose, computeJoints, lerpPose } from './stickman.ts';

const HALF_PI = Math.PI / 2;
const smooth = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};

/** 방어 확정 애니메이션의 시간 구성(초) */
export const DEF_ANIM = {
  /** 선 자세에서 무릎을 굽혀 웅크리는 시간 */
  crouch: 0.28,
  /** 점프하면서 방어 자세로 전환하는 시간. 이 시간이 끝나는 순간 최종 자세가 완성된다. */
  jump: 0.5,
  /** 최종 자세 완성 후 검격이 도달하기까지의 여유 */
  settle: 0.04,
};
export const DEF_ANIM_TOTAL = DEF_ANIM.crouch + DEF_ANIM.jump;

/** 서 있는 자세에서 무릎을 굽힌 웅크린 자세. 발 위치(바닥)는 유지한다. */
export function crouchPose(from: Pose): Pose {
  const c = clonePose(from);
  const bend = 0.62;
  c.thigh = [HALF_PI + bend, HALF_PI - bend];
  c.shin = [HALF_PI - 0.18, HALF_PI + 0.18];
  c.armUp = [from.armUp[0] + 0.12, from.armUp[1] - 0.12];
  c.armLow = [from.armLow[0] + 0.5, from.armLow[1] - 0.5];
  const before = computeJoints(from);
  const after = computeJoints(c);
  c.pelvis.y += Math.max(before.foot[0].y, before.foot[1].y) - Math.max(after.foot[0].y, after.foot[1].y);
  return c;
}

/**
 * 방어 애니메이션. t 는 애니메이션 시작 후 경과 시간(초).
 * 웅크림 -> 위로 점프하며 목표 자세로 전환 -> 완성. 모든 계산은 pose.dims(체형)를 그대로 따른다.
 * 점프는 연출일 뿐이고 최종 자세(to)가 판정 자세다.
 */
export function defenseAnimPose(from: Pose, to: Pose, t: number): Pose {
  if (t <= 0) return from;
  if (t >= DEF_ANIM_TOTAL) return to;
  const crouch = crouchPose(from);
  if (t < DEF_ANIM.crouch) return lerpPose(from, crouch, smooth(t / DEF_ANIM.crouch));
  const u = (t - DEF_ANIM.crouch) / DEF_ANIM.jump;
  const e = smooth(u);
  const p = lerpPose(crouch, to, e);
  const D = from.dims;
  const height = D.thigh + D.shin + D.torso + D.headR * 2;
  // 위로 솟았다가 내려오며 자세가 완성된다.
  p.pelvis.y -= height * 0.2 * Math.sin(Math.PI * u) ** 0.9;
  return p;
}
