// 모든 게임 수치는 여기서 관리한다. (규칙 코드와 렌더링 코드 분리)

export const CONFIG = {
  /** 화면(스테이지) 크기. 화면 크기가 달라지면 전체를 비율에 맞춰 확대/축소한다. */
  stage: { w: 1600, h: 900 },
  /** 중앙 전투 영역. 공격/방어 모두 같은 위치와 크기를 쓴다. 영역이 좁을수록 피하기 어렵다. */
  arena: { x: 470, y: 230, w: 660, h: 480 },
  floorY: 440,

  hp: 100,
  maxSlashLength: 520,
  minSlashLength: 24,
  slashSpacing: 3,
  slashHalfWidth: 5,

  /** 검의 고유 스킬 수치 */
  skill: {
    /** 스킬을 쓴 뒤 다시 쓸 수 있을 때까지 지나야 하는 내 공격 턴 수 */
    cooldown: 3,
    /** 적(같은 검을 든다)이 스킬을 쓰는 주기: 이 턴 수마다 한 번 */
    enemyEvery: 5,
    /** 청풍도 잔월: 검격 최대 길이 배율 */
    lengthMul: 1.2,
    /** 적월도 열상: 적중한 부위마다 추가 피해 */
    bleed: 5,
    /** 환영도 이중참: 복제 검격이 떨어지는 거리, 피해 배율 */
    echoOffset: 70,
    echoFactor: 0.6,
    /** 금강도 파쇄: 검격 판정 반폭(기본 slashHalfWidth)과 화면에 그리는 굵기 배율 */
    thickHalfWidth: 24,
    thickScale: 2.8,
    /** 빙결도 서리 흔적: 양옆 추가 판정선까지의 거리 */
    frostOffset: 30,
    /** 염화도 폭염참: 검격 시작점과 끝점에 생기는 폭발의 반지름 */
    blastRadius: 70,
    /** 매화도 매화난무: 꽃잎 개수, 터지는 반지름, 피해 배율, 피어나는 시간(초), 꽃잎 사이 간격(초) */
    blossomCount: 4,
    blossomRadius: 30,
    blossomFactor: 0.3,
    blossomBloom: 0.5,
    blossomGap: 0.2,
    /** 뇌명도 낙뢰: 번개 피해 배율 */
    boltFactor: 0.6,
    /** 월식도 월식참: 두 번째 검격 피해 배율 */
    moonFactor: 0.7,
  },


  /** 부위별 고정 피해. 한 검격에서 머리/몸통/팔/다리는 각각 최대 한 번만 적용된다. */
  damage: { head: 30, torso: 20, arm: 10, leg: 10 },

  body: {
    headR: 36,
    neckGap: 4,
    torso: 144,
    upperArm: 62,
    foreArm: 58,
    thigh: 72,
    shin: 72,
    hipOffset: 8,
    shoulderOffset: 12,
    shoulderDrop: 10,
  },
  /** 충돌 판정용 반지름 */
  radii: { head: 36, torso: 14, arm: 9, leg: 10 },
  /** 자기 겹침 검사용 반지름 */
  selfRadius: 4,

  limits: {
    torso: 0.9,
    head: 0.9,
    elbowFlex: 2.6,
    kneeFlex: 2.4,
    armOutMin: -0.1,
    armOutMax: 3.0,
    legTorsoGap: 0.3,
  },

};
