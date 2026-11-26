<div align="center">

# Games I Built

### 직접 기획하고 개발한 인터랙티브 게임 모음

**TypeScript · Vite · Canvas · Game Design**

</div>

## ⚔️ Stickman Sword Duel · 써는 놈 피하는 놈

### [▶ 지금 플레이하기 — 설치 없이 브라우저에서](https://game.saaskr.com/games/%EC%8D%A8%EB%8A%94-%EB%86%88-%ED%94%BC%ED%95%98%EB%8A%94-%EB%86%88)

<a href="https://game.saaskr.com/games/%EC%8D%A8%EB%8A%94-%EB%86%88-%ED%94%BC%ED%95%98%EB%8A%94-%EB%86%88"><img src="stickman-sword-duel/thumbnail.png" width="900" alt="써는 놈 피하는 놈 — 클릭하면 플레이 페이지로 이동"></a>

**검격은 직접 그리고, 공격은 온몸으로 피하는 턴제 검술 게임입니다.**

마우스로 공격 궤적을 그리고 캐릭터의 관절과 자세를 조정하며, 서로 다른 공격 패턴을 가진 10단계의 검객에 도전합니다. PC와 마우스 사용을 권장합니다. 위 링크를 열고 플레이 시작을 누르면 게임을 실행할 수 있습니다.

| 재미 요소 | 내용 |
| --- | --- |
| 직접 그리는 공격 | 제한된 길이 안에서 검격의 궤적 설계 |
| 자세를 만드는 방어 | 머리·몸·팔·다리를 움직여 공격 회피 |
| 단계별 도전 | 10개 스테이지, 5·10단계 보스 |
| 다양한 검 | 고유 스킬을 가진 검 10종 |

### 조작 방법

- **마우스 드래그:** 검격 그리기 / 신체 관절 이동
- **머리 위 회전 버튼 드래그:** 몸 기울이기 / 뒤집기
- **클릭:** 스킬 활성화 / 턴 완료
- 공격과 방어를 번갈아 진행합니다.

[게임 상세 설명 및 소스](stickman-sword-duel/) · [게임 명세](stickman-sword-duel/docs/GAME_SPEC.md)

### 결과 업데이트

성적·순위·평가 결과는 아직 발표 전이며, 확정되는 대로 업데이트할 예정입니다. 현재는 플레이 가능한 게임과 구현 내용을 소개합니다.

## 로컬 실행

```bash
git clone https://github.com/jaehyeongahn01/game-development.git
cd game-development/stickman-sword-duel
npm ci
npm run dev
```

`npm run build`는 TypeScript 검사와 단일 HTML 빌드, 파일 크기 확인을 수행합니다.

## 개발 도구

TypeScript, Vite, HTML Canvas를 사용했습니다. 게임 기획과 개발은 개인 프로젝트로 진행했으며, 제작 과정에서 ChatGPT 등 AI 도구를 활용했습니다.
