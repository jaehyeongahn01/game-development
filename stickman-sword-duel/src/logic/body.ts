import { CONFIG } from './config.ts';

/** 부위별 피해 배율. 체형의 장단점을 조정하는 밸런스 값이다(기본 1). */
export interface Vuln {
  head: number;
  torso: number;
  arm: number;
  leg: number;
}

/**
 * 캐릭터 체형. 길이는 화면 좌표 단위이고, t* 는 표준 두께 대비 배율이다.
 * 판정 반지름과 화면에 그리는 굵기는 모두 같은 두께 값에서 계산하므로
 * 보이는 모습과 실제 판정이 어긋나지 않는다. 관절 구조는 모든 체형이 같다.
 */
export interface BodyDims {
  headR: number;
  neckGap: number;
  torso: number;
  upperArm: number;
  foreArm: number;
  thigh: number;
  shin: number;
  hipOffset: number;
  shoulderOffset: number;
  shoulderDrop: number;
  tTorso: number;
  tArm: number;
  tLeg: number;
  vuln: Vuln;
}

export const STD_BODY: BodyDims = {
  ...CONFIG.body,
  tTorso: 1,
  tArm: 1,
  tLeg: 1,
  vuln: { head: 1, torso: 1, arm: 1, leg: 1 },
};

export function makeBody(over: Partial<Omit<BodyDims, 'vuln'>> & { vuln?: Partial<Vuln> } = {}): BodyDims {
  const { vuln, ...rest } = over;
  return { ...STD_BODY, ...rest, vuln: { ...STD_BODY.vuln, ...vuln } };
}

export interface Radii {
  head: number;
  torso: number;
  arm: number;
  leg: number;
}

/** 충돌 판정 반지름 */
export function radiiOf(d: BodyDims): Radii {
  return {
    head: d.headR,
    torso: CONFIG.radii.torso * d.tTorso,
    arm: CONFIG.radii.arm * d.tArm,
    leg: CONFIG.radii.leg * d.tLeg,
  };
}

/** 화면에 그리는 선 굵기. 표준 체형에서는 기존 값(15/12/11/12)과 같다. */
export function widthsOf(d: BodyDims): { torso: number; shoulder: number; hip: number; arm: number; leg: number; hand: number; foot: number } {
  return {
    torso: 15 * d.tTorso,
    shoulder: 12 * d.tTorso,
    hip: 12 * d.tTorso,
    arm: 11 * d.tArm,
    leg: 12 * d.tLeg,
    hand: 7.5 * d.tArm,
    foot: 7.5 * d.tLeg,
  };
}

/** 서 있을 때의 키(발바닥부터 머리 꼭대기) */
export function bodyHeight(d: BodyDims): number {
  return d.thigh + d.shin + d.torso + d.neckGap + d.headR * 2;
}
