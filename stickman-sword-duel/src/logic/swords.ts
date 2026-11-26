/**
 * 플레이어가 쓸 수 있는 검 10자루. assets/reference/weapon-revolution-reference.png 참고.
 * n번 검은 (n-1)단계를 클리어하면 얻는다(무명도는 처음부터). 얻은 검은 언제든 다시 고를 수 있다.
 */
export type SkillId = 'none' | 'crescent' | 'rend' | 'echo' | 'shatter' | 'frost' | 'blast' | 'blossom' | 'thunder' | 'eclipse';

export interface SwordDef {
  index: number;
  name: string;
  skill: SkillId;
  skillName: string;
  /** 카드에 보이는 설명(두 줄) */
  desc: [string, string];
  color: string;
  glow: string;
  /** 검의 길이/굵기(전투 화면에서 손에 든 모습) */
  length: number;
  width: number;
  heavy?: boolean;
}

export const SWORDS: SwordDef[] = [
  { index: 0, name: '무명도', skill: 'none', skillName: '스킬 없음', desc: ['기본 검격.', '별도 스킬 없음'], color: '#EAF1FF', glow: '#9FB4D8', length: 150, width: 4 },
  { index: 1, name: '청풍도', skill: 'crescent', skillName: '잔월', desc: ['검격 최대 길이', '20% 증가'], color: '#DFF4FF', glow: '#46C8FF', length: 152, width: 4 },
  { index: 2, name: '적월도', skill: 'rend', skillName: '열상', desc: ['적중한 부위에', '추가 피해 +5'], color: '#FFD6D6', glow: '#FF2E3E', length: 154, width: 4 },
  { index: 3, name: '환영도', skill: 'echo', skillName: '이중참', desc: ['그린 검격을 조금 떨어진', '위치에 한 번 더 생성'], color: '#EBDDFF', glow: '#A060FF', length: 152, width: 4 },
  { index: 4, name: '금강도', skill: 'shatter', skillName: '파쇄', desc: ['검격의 두께가 두꺼워져', '더 넓게 벤다'], color: '#FFF0C2', glow: '#FFB020', length: 158, width: 9, heavy: true },
  { index: 5, name: '빙결도', skill: 'frost', skillName: '서리 흔적', desc: ['검격 양옆에 짧게 남는', '추가 판정선 생성'], color: '#E8FAFF', glow: '#7FD8FF', length: 154, width: 4 },
  { index: 6, name: '염화도', skill: 'blast', skillName: '폭염참', desc: ['검격의 시작과 끝에', '작은 원형 폭발'], color: '#FFE2B8', glow: '#FF7A1A', length: 154, width: 5 },
  { index: 7, name: '매화도', skill: 'blossom', skillName: '매화난무', desc: ['네모칸 안 무작위 4곳에 꽃잎이', '피어났다 터지며 피해'], color: '#FF8FC2', glow: '#FF4FA3', length: 154, width: 4 },
  { index: 8, name: '뇌명도', skill: 'thunder', skillName: '낙뢰', desc: ['시작점과 끝점 사이에', '직선 번개 공격 추가'], color: '#F1E8FF', glow: '#7C8CFF', length: 156, width: 4 },
  { index: 9, name: '월식도', skill: 'eclipse', skillName: '월식참', desc: ['반대 방향으로', '두 번째 검격 발동'], color: '#FFE8E8', glow: '#E0152B', length: 160, width: 5 },
];

export const SWORD_COUNT = SWORDS.length;

/** n번 검(0부터)을 얻는 데 필요한 클리어 단계. 0이면 처음부터 쓸 수 있다. */
export const swordUnlockStage = (index: number): number => index;
