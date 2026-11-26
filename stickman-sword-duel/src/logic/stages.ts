import { type BodyDims, makeBody } from './body.ts';
import type { Stance } from './stickman.ts';

/** 스테이지 데이터: 적의 체형, 외형, 이펙트, AI 설정, 밸런스 수치를 한 곳에서 관리한다. */

export type Pattern =
  | 'horizontal'
  | 'vertical'
  | 'diagonal'
  | 'curve'
  | 's'
  | 'focusHead'
  | 'focusTorso'
  | 'focusLegs'
  | 'wide'
  | 'zigzag'
  | 'loop';

export interface AiConfig {
  /** 공격 위치의 무작위 오차(좌표 단위). 작을수록 정확하다. */
  jitter: number;
  lenMin: number;
  lenMax: number;
  /** 공격 후보 생성 횟수. 많을수록 더 아프게 맞히는 검격을 고른다. */
  tries: number;
  /** 사용할 수 있는 검격 패턴(다양성) */
  patterns: Pattern[];
  /** 플레이어의 최근 방어 자세를 예측에 반영하는 정도(0~1) */
  adapt: number;
  /** 방어 후보 자세 수 */
  candidates: number;
  /** 후보 중 최선을 고를 확률. 1 - 이 값이 실수 확률이다. */
  bestDefense: number;
  /** 고른 자세를 미세 조정하는 횟수 */
  refine: number;
  /** 회피 자세 난이도별 선택 비중 [매우 쉬움, 보통, 어려움, 매우 어려움, 극한]. 합이 1일 필요는 없다. (poses.ts 참고) */
  tiers: [number, number, number, number, number];
  /** 매 공격마다 아레나 가장자리를 노릴 확률(0~1). 없으면 노리지 않는다. 6스테이지부터 쓴다. */
  edgeAttack?: number;
  /** 모서리에서 3번 연속 방어하면 그 모서리를 노리는 첫 공격을 쓰는가. 4스테이지부터 쓴다. */
  cornerAttack?: boolean;
}

export type FxKind = 'none' | 'blue' | 'red' | 'violet' | 'gold' | 'frost' | 'ember' | 'ghost' | 'lightning' | 'eclipse';

export interface SwordStyle {
  color: string;
  glow: string;
  length: number;
  width: number;
  heavy?: boolean;
}

export interface StageDef {
  id: number;
  name: string;
  boss: boolean;
  hp: number;
  /** 카드에 표시하는 한 줄 설명 */
  trait: string;
  dims: BodyDims;
  stance?: Stance;
  eye: string;
  /** 눈의 크기 배율 */
  eyeScale: number;
  rim: string;
  sword: SwordStyle;
  fx: FxKind;
  ai: AiConfig;
}

const T: Record<string, [number, number, number, number, number]> = {
  s1: [0.8, 0.2, 0, 0, 0],
  s2: [0.55, 0.4, 0.05, 0, 0],
  s3: [0.35, 0.45, 0.2, 0, 0],
  s4: [0.2, 0.4, 0.35, 0.05, 0],
  s5: [0.1, 0.3, 0.4, 0.2, 0],
  s6: [0.1, 0.25, 0.35, 0.25, 0.05],
  s7: [0.05, 0.2, 0.35, 0.3, 0.1],
  s8: [0, 0.15, 0.35, 0.4, 0.1],
  s9: [0, 0.1, 0.3, 0.45, 0.15],
  s10: [0, 0, 0.25, 0.55, 0.2],
};

const P = {
  p1: ['horizontal', 'vertical', 'diagonal'] as Pattern[],
  p2: ['horizontal', 'vertical', 'diagonal', 'curve'] as Pattern[],
  p3: ['horizontal', 'vertical', 'diagonal', 'curve', 'focusHead'] as Pattern[],
  p4: ['horizontal', 'vertical', 'diagonal', 'curve', 's', 'focusHead', 'focusTorso'] as Pattern[],
  boss5: ['wide', 'wide', 'horizontal', 'diagonal', 'curve', 'focusTorso'] as Pattern[],
  p6: ['horizontal', 'vertical', 'diagonal', 'curve', 's', 'focusHead', 'focusTorso', 'focusLegs'] as Pattern[],
  p7: ['horizontal', 'vertical', 'diagonal', 'curve', 's', 'focusHead', 'focusTorso', 'focusLegs', 'wide'] as Pattern[],
  p8: ['horizontal', 'vertical', 'diagonal', 'curve', 's', 'focusHead', 'focusTorso', 'focusLegs', 'wide', 'zigzag'] as Pattern[],
  p9: ['diagonal', 'curve', 's', 'focusHead', 'focusTorso', 'focusLegs', 'wide', 'zigzag', 'loop'] as Pattern[],
  boss10: ['zigzag', 'loop', 'loop', 's', 'curve', 'diagonal', 'focusHead', 'focusTorso', 'focusLegs', 'wide'] as Pattern[],
};

/** 큰 머리와 가는 팔다리 체형. 4단계와 8단계가 같이 쓴다. */
const BIG_HEAD_BODY: BodyDims = makeBody({
  headR: 46,
  torso: 138,
  upperArm: 58,
  foreArm: 56,
  thigh: 70,
  shin: 70,
  tTorso: 0.7,
  tArm: 0.62,
  tLeg: 0.7,
  shoulderOffset: 10,
  vuln: { head: 1.15, torso: 1, arm: 1.05, leg: 1.05 },
});

export const STAGES: StageDef[] = [
  {
    id: 1,
    name: '무명 검객',
    boss: false,
    hp: 100,
    trait: '표준 체형',
    dims: makeBody(),
    eye: '#FFFFFF',
    eyeScale: 1,
    rim: 'rgba(150,180,235,0.75)',
    sword: { color: '#EAF1FF', glow: '#9FC4FF', length: 128, width: 4 },
    fx: 'none',
    ai: { jitter: 140, lenMin: 240, lenMax: 360, tries: 1, patterns: P.p1, adapt: 0, candidates: 7, bestDefense: 0.55, refine: 1, tiers: T.s1 },
  },
  {
    id: 2,
    name: '푸른 그림자',
    boss: false,
    hp: 95,
    trait: '작고 날렵함',
    dims: makeBody({ headR: 32, torso: 116, upperArm: 52, foreArm: 50, thigh: 62, shin: 62, tTorso: 0.9, tArm: 0.9, tLeg: 0.9, shoulderOffset: 11, hipOffset: 7 }),
    stance: { torso: 0.22, spread: 0.5, armOut: 0.15 },
    eye: '#46C8FF',
    eyeScale: 1,
    rim: 'rgba(120,190,255,0.85)',
    sword: { color: '#DFF4FF', glow: '#46C8FF', length: 126, width: 4 },
    fx: 'blue',
    ai: { jitter: 200, lenMin: 260, lenMax: 380, tries: 2, patterns: P.p2, adapt: 0.05, candidates: 9, bestDefense: 0.6, refine: 1, tiers: T.s2 },
  },
  {
    id: 3,
    name: '적안 검객',
    boss: false,
    hp: 110,
    trait: '키가 크고 팔다리가 김',
    dims: makeBody({ headR: 34, torso: 154, upperArm: 72, foreArm: 68, thigh: 84, shin: 84, tTorso: 0.95, tArm: 0.95, tLeg: 0.95 }),
    eye: '#FF3B3B',
    eyeScale: 1,
    rim: 'rgba(255,110,110,0.75)',
    sword: { color: '#FFD6D6', glow: '#FF2E3E', length: 140, width: 4 },
    fx: 'red',
    ai: { jitter: 180, lenMin: 290, lenMax: 410, tries: 2, patterns: P.p3, adapt: 0.1, candidates: 10, bestDefense: 0.65, refine: 1, tiers: T.s3 },
  },
  {
    id: 4,
    name: '환영 검객',
    boss: false,
    hp: 100,
    trait: '큰 머리와 가는 팔다리',
    dims: BIG_HEAD_BODY,
    eye: '#B070FF',
    eyeScale: 0.9,
    rim: 'rgba(180,140,255,0.8)',
    sword: { color: '#EBDDFF', glow: '#A060FF', length: 132, width: 3 },
    fx: 'violet',
    ai: { jitter: 160, lenMin: 310, lenMax: 430, tries: 2, patterns: P.p4, adapt: 0.15, candidates: 11, bestDefense: 0.52, refine: 1, tiers: T.s4, cornerAttack: true },
  },
  {
    id: 5,
    name: '금안의 수호자',
    boss: true,
    hp: 160,
    trait: '큰 머리와 두꺼운 몸 (보스)',
    dims: makeBody({
      headR: 46,
      torso: 138,
      upperArm: 60,
      foreArm: 56,
      thigh: 66,
      shin: 66,
      tTorso: 2.1,
      tArm: 1.7,
      tLeg: 1.7,
      shoulderOffset: 32,
      hipOffset: 14,
      shoulderDrop: 16,
      vuln: { head: 1.1, torso: 0.9, arm: 0.9, leg: 0.9 },
    }),
    stance: { spread: 0.18 },
    eye: '#FFC93A',
    eyeScale: 1.25,
    rim: 'rgba(255,200,90,0.85)',
    sword: { color: '#FFF0C2', glow: '#FFB020', length: 168, width: 11, heavy: true },
    fx: 'gold',
    ai: { jitter: 100, lenMin: 340, lenMax: 470, tries: 3, patterns: P.boss5, adapt: 0.25, candidates: 13, bestDefense: 0.62, refine: 2, tiers: T.s5, cornerAttack: true },
  },
  {
    id: 6,
    name: '서리 검객',
    boss: false,
    hp: 115,
    trait: '키가 크고 몸통이 길고 가늚',
    dims: makeBody({ headR: 32, torso: 174, upperArm: 64, foreArm: 60, thigh: 76, shin: 76, tTorso: 0.8, tArm: 0.8, tLeg: 0.8, shoulderOffset: 11 }),
    eye: '#BFEFFF',
    eyeScale: 1,
    rim: 'rgba(170,225,255,0.85)',
    sword: { color: '#E8FAFF', glow: '#7FD8FF', length: 138, width: 4 },
    fx: 'frost',
    ai: { jitter: 90, lenMin: 340, lenMax: 460, tries: 2, patterns: P.p6, adapt: 0.3, candidates: 11, bestDefense: 0.45, refine: 1, tiers: T.s6, edgeAttack: 0.15, cornerAttack: true },
  },
  {
    id: 7,
    name: '잿불 검객',
    boss: false,
    hp: 125,
    trait: '상체가 크고 다리가 짧음',
    dims: makeBody({
      headR: 38,
      torso: 158,
      upperArm: 66,
      foreArm: 62,
      thigh: 52,
      shin: 52,
      tTorso: 1.6,
      tArm: 1.5,
      tLeg: 1.25,
      shoulderOffset: 24,
      hipOffset: 11,
      shoulderDrop: 14,
    }),
    stance: { spread: 0.1, armOut: 0.1 },
    eye: '#FF9A2E',
    eyeScale: 1.05,
    rim: 'rgba(255,150,80,0.8)',
    sword: { color: '#FFE2B8', glow: '#FF7A1A', length: 140, width: 5 },
    fx: 'ember',
    ai: { jitter: 75, lenMin: 350, lenMax: 470, tries: 3, patterns: P.p7, adapt: 0.4, candidates: 12, bestDefense: 0.55, refine: 2, tiers: T.s7, edgeAttack: 0.15, cornerAttack: true },
  },
  {
    id: 8,
    name: '낭만 검객',
    boss: false,
    hp: 120,
    trait: '큰 머리와 가는 팔다리',
    dims: BIG_HEAD_BODY,
    eye: '#FF8FC2',
    eyeScale: 1.15,
    rim: 'rgba(255,143,194,0.7)',
    sword: { color: '#FF8FC2', glow: '#FF4FA3', length: 154, width: 4 },
    fx: 'none',
    ai: { jitter: 60, lenMin: 360, lenMax: 480, tries: 3, patterns: P.p8, adapt: 0.5, candidates: 13, bestDefense: 0.65, refine: 2, tiers: T.s8, edgeAttack: 0.15, cornerAttack: true },
  },
  {
    id: 9,
    name: '뇌전 검객',
    boss: false,
    hp: 135,
    trait: '작고 팔다리가 길며 날렵함',
    dims: makeBody({ headR: 30, torso: 108, upperArm: 76, foreArm: 72, thigh: 84, shin: 84, tTorso: 0.85, tArm: 0.85, tLeg: 0.85, shoulderOffset: 11 }),
    stance: { torso: 0.1, spread: 0.55, armOut: 0.35 },
    eye: '#B58CFF',
    eyeScale: 1,
    rim: 'rgba(190,150,255,0.85)',
    sword: { color: '#F1E8FF', glow: '#9A6BFF', length: 140, width: 4 },
    fx: 'lightning',
    ai: { jitter: 45, lenMin: 370, lenMax: 490, tries: 4, patterns: P.p9, adapt: 0.6, candidates: 14, bestDefense: 0.75, refine: 3, tiers: T.s9, edgeAttack: 0.15, cornerAttack: true },
  },
  {
    id: 10,
    name: '월식의 검성',
    boss: true,
    hp: 220,
    trait: '매우 크고 날렵함 (최종 보스)',
    dims: makeBody({ headR: 32, torso: 168, upperArm: 74, foreArm: 70, thigh: 90, shin: 90, tTorso: 0.85, tArm: 0.85, tLeg: 0.85, shoulderOffset: 11 }),
    eye: '#FFFFFF',
    eyeScale: 1.3,
    rim: 'rgba(255,90,90,0.85)',
    sword: { color: '#FFE8E8', glow: '#E0152B', length: 156, width: 5 },
    fx: 'eclipse',
    ai: { jitter: 28, lenMin: 380, lenMax: 520, tries: 8, patterns: P.boss10, adapt: 0.9, candidates: 18, bestDefense: 0.8, refine: 6, tiers: T.s10, edgeAttack: 0.15, cornerAttack: true },
  },
];

export const STAGE_COUNT = STAGES.length;
