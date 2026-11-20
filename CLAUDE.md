# 작업 메모 (Claude용)

- 앱 이름은 **꿈꾸는부엉이** (2.2부터, 붙여 씀. 예전 이름 "꿈탐정 부엉"). 캐릭터는 황금 망토를 두른 신비로운 하얀 부엉이 탐정 **"부엉"**(화면에서는 "부엉 탐정"). 내부 이름(저장소 dreamingU, IndexedDB 이름 dreamingU, 내보내기 app 값 dreamingU)은 바꾸지 않음: 바꾸면 휴대폰 꿈 일기를 못 읽음. 저장소 이름은 `dreamingU`. 사용자는 개발자가 아님. 설명은 쉬운 한국어로, 단계별로.
- 사용자 환경: 윈도우 PC, 크롬. `start.bat` / `make-shortcut.bat` 로 실행. 같은 사용자의 다른 앱 **재잘이**(`nunim71-lab/jaejali`, 3000번 주소)와 따로 움직임 (꿈꾸는부엉이는 3100번).
- 할 일 목록은 `다음-업데이트.md` 를 먼저 확인.
- **업데이트할 때마다 빌드 번호의 끝자리를 1 올린다** (1.9 → 1.10 → 1.11 …처럼 점 뒤의 숫자를 계속 올림. 점은 소수점이 아니라 칸 구분. 앞자리(2.0 등)는 휴대폰 버전 같은 큰 변화 때만, 사용자에게 물어보고): `package.json` 의 `build`, 그리고 `다음-업데이트.md` 의 "현재 빌드"와 "업데이트 기록" 표를 함께 고친다. `docs/index.html` 의 `icon.png?v=…`(2곳) 도 새 빌드 번호로 (아이콘이 바뀌면 바로 보이게).
- 외부 라이브러리 없이 Node.js 내장 기능만 사용. 테스트: `npm test`.
- 꿈 분석은 Claude API(`docs/js/claude.js`, 내장 fetch, 휴대폰에서는 브라우저가 바로 부름). 수사 보고서는 쉬운 문장으로, `<분석심리학>` 과 `<천궁도>` 두 부분으로 따로 (`docs/js/report.js` 가 나눔). API 키 없이 **Claude 구독** 으로도 분석: `[📋 Claude에게 물어볼 글 복사]` → claude.ai → 답을 붙여넣기 (`/api/dreams/:id/prompt`, `/report`). 이때는 `【분석심리학】` 같은 표시 줄을 씀 (화면에서 복사하면 `<꼬리표>` 가 사라질 수 있어서). 차트 계산은 `docs/js/astro.js`, 무료 기본 풀이는 `docs/js/reading.js` (둘 다 브라우저와 함께 씀).
- 꿈 일기·API 키는 사용자 컴퓨터의 `data/` 폴더에만 (깃에 올리지 않음).
- **2.0 구조**: 화면·두뇌는 `docs/` (GitHub Pages 로 휴대폰 버전: https://nunim71-lab.github.io/dreamingU/). `docs/js/app.js` 가 두뇌(모든 /api 처리)이고, 컴퓨터 버전 `src/server.js`(data 폴더)와 휴대폰 버전 `docs/js/local.js`(브라우저 IndexedDB)가 함께 씀. 화면은 `./api/status` 가 되면 컴퓨터 모드, 아니면 휴대폰 모드 (https 면 바로 휴대폰 모드). `docs/sw.js` 는 휴대폰 전용(오프라인·자동 업데이트, 화면 파일을 새로 추가하면 SHELL 목록에도 넣기). 화면의 빌드 번호는 `icon.png?v=…` 에서 읽음. 꿈 일기 옮기기: `/api/export`, `/api/import` (같은 id 는 분석·메모를 따로 비교해 각각 더 최근 것). 나의 메모: `/api/dreams/:id/memo` (memo, memoAt), 화면에서 0.8초 뒤·화면 떠날 때 자동 저장, Claude 프롬프트에는 넣지 않음.
