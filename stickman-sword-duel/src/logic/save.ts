import { STAGE_COUNT } from './stages.ts';

const KEY = 'ssd.save.v1';

export interface SaveData {
  /** cleared[i] = (i + 1)단계 클리어 여부 */
  cleared: boolean[];
  /** 장착한 검 번호(0 = 무명도 ... 9 = 월식도) */
  sword: number;
  /** 스킬 버튼 도움말을 이미 보여 줬는가 */
  seenSkillHint: boolean;
  /** 1단계 조작법 안내를 이미 확인했는가 */
  seenTutorial: boolean;
}

function empty(): SaveData {
  return { cleared: Array.from({ length: STAGE_COUNT }, () => false), sword: 0, seenSkillHint: false, seenTutorial: false };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    const data = JSON.parse(raw) as Partial<SaveData>;
    const base = empty();
    if (Array.isArray(data.cleared)) {
      for (let i = 0; i < STAGE_COUNT; i++) base.cleared[i] = data.cleared[i] === true;
    }
    if (typeof data.sword === 'number' && isSwordUnlocked(base, data.sword)) base.sword = data.sword;
    base.seenSkillHint = data.seenSkillHint === true;
    base.seenTutorial = data.seenTutorial === true || base.cleared.some(Boolean);
    return base;
  } catch {
    return empty();
  }
}

export function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // 저장소를 쓸 수 없어도 게임은 계속된다.
  }
}

/** 1단계는 항상 열려 있고, 그 다음부터는 앞 단계를 클리어해야 열린다. */
export function isUnlocked(data: SaveData, stageId: number): boolean {
  return stageId <= 1 || data.cleared[stageId - 2] === true;
}

/** 무명도(0)는 처음부터, n번 검은 n단계를 클리어하면 얻는다. */
export function isSwordUnlocked(data: SaveData, index: number): boolean {
  return index === 0 || (index > 0 && index < STAGE_COUNT && data.cleared[index - 1] === true);
}
