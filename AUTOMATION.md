# 투자전략 팀 자동 리포트 설정 가이드

> **2026-11 변경: 예약 실행을 Claude 구독 예약(Routines)으로 이전 — API 크레딧을 쓰지 않습니다.**
> - 분석·노션 저장: Claude 구독 예약이 `routines/morning.md`, `routines/close.md` 플레이북대로 수행 (노션 커넥터 사용)
> - 카톡 알림: 예약 실행이 GitHub `Kakao Notify` 워크플로를 호출 (카카오 키는 GitHub Secrets 그대로 사용)
> - 투자자 프로필: 비공개 노션 페이지 **⚙️ 투자자 프로필 (투자전략봇)**
> - `Daily Market Report` 워크플로는 API 크레딧으로 돌리는 **비상용 수동 실행**만 남김 (예약 제거)
> - 아래 1~3절의 노션 통합·카카오·GitHub Secrets 설정은 그대로 필요합니다 (`INVEST_PROFILE` 변수는 비상용 실행에만 쓰임)

매 개장일 두 번, 투자전략 팀이 분석을 수행하고 **노션에 리포트를 저장한 뒤 카카오톡으로 알림**을 보냅니다.

| 시각 (KST) | 리포트 | 내용 |
|---|---|---|
| 08:00 전후 | 🌅 모닝 브리핑 | 밤사이 글로벌 매크로·미국 시장 상태, 오늘 한국장 예상, **신규 뉴스 선별**(최근 5일 브리핑과 중복 제외), 체크리스트 |
| 16:00 전후 | 🌆 장 마감 | 애널리스트 5인 → 리스크 매니저 → CIO. 전일 판정·오늘 아침 예상 복기, 분산일 카운트 연속 추적 |

- 실행: GitHub Actions (`.github/workflows/daily-report.yml`)
- 휴장일: 주말 + `scripts/krx-holidays.json` 자동 건너뜀 → **매년 12월 KRX 휴장일 공지와 대조해 갱신**
- 연속성: 노션 DB의 `메모리` 속성에 다룬 뉴스·시장 상태·분산일 수를 저장하고 다음 실행이 읽어갑니다 (수정하지 마세요)
- 실패 시: 카톡으로 실패 알림 + Actions 로그 링크

---

## 1. 노션

데이터베이스 **📈 투자전략 리포트**는 이미 생성되어 있습니다 (개인 페이지).
DB ID: `8c77ed355ce74fed9b115a98dcd676b7`

1. https://www.notion.so/profile/integrations → **새 API 통합** (내부 통합) 생성 → 시크릿(`ntn_...`) 복사
2. 노션에서 `📈 투자전략 리포트` 열기 → 우측 상단 `···` → **연결(Connections)** → 방금 만든 통합 추가
   (이 단계를 빠뜨리면 `object_not_found` 오류)

## 2. 카카오톡 (나에게 보내기)

1. https://developers.kakao.com → 내 애플리케이션 → **애플리케이션 추가**
2. **앱 키** → `REST API 키` 복사
3. **카카오 로그인** → 활성화 ON → Redirect URI에 `https://localhost` 등록
4. **카카오 로그인 → 동의항목** → `카카오톡 메시지 전송(talk_message)` → 선택 동의로 설정
5. **플랫폼 → Web** → 사이트 도메인에 `https://www.notion.so`, `https://github.com` 등록 (카톡 메시지의 링크 버튼용)
6. (보안 → Client Secret을 켰다면 코드 값 복사)
7. 브라우저에서 아래 주소 접속 → 카카오 로그인·동의 → 이동된 주소창의 `code=` 뒤 값 복사

```
https://kauth.kakao.com/oauth/authorize?client_id=<REST_API_KEY>&redirect_uri=https://localhost&response_type=code&scope=talk_message
```

8. 저장소를 받은 PC에서 리프레시 토큰 발급 (코드는 1회용, 수 분 내 실행)

```bash
KAKAO_REST_API_KEY=<REST_API_KEY> KAKAO_REDIRECT_URI=https://localhost npm run kakao:token -- <code>
```

## 3. GitHub 저장소 설정

**Settings → Secrets and variables → Actions**

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `ANTHROPIC_API_KEY` | Claude API 키 |
| Secret | `NOTION_TOKEN` | 노션 통합 시크릿 |
| Secret | `KAKAO_REST_API_KEY` | 카카오 REST API 키 |
| Secret | `KAKAO_REFRESH_TOKEN` | 2-8에서 발급한 리프레시 토큰 |
| Secret (선택) | `KAKAO_CLIENT_SECRET` | Client Secret 사용 시 |
| Secret (권장) | `GH_PAT` | Fine-grained PAT — 이 저장소의 **Secrets: Read and write** 권한. 카카오 리프레시 토큰(약 2개월 유효)이 갱신될 때 자동 저장 |
| Variable | `NOTION_DATABASE_ID` | `8c77ed355ce74fed9b115a98dcd676b7` |
| Variable | `INVEST_PROFILE` | 투자자 프로필 JSON (아래 예시) |

```json
{"market":"KR","risk":"중립","horizon":"스윙(수주~수개월)","holdings":"삼성전자 30% 평단 68000, SK하이닉스 20%","watchlist":"한화에어로스페이스, 알테오젠"}
```

## 4. 활성화 및 테스트

1. 이 브랜치를 **main에 머지** (GitHub 예약 실행은 기본 브랜치의 워크플로만 동작)
2. Actions → **Daily Market Report** → Run workflow → `morning` 선택 → 실행
3. 노션 페이지 생성 + 카톡 수신 확인 후 `close`도 테스트

로컬 점검 (노션·카톡 전송 없이 콘솔 출력):

```bash
ANTHROPIC_API_KEY=... node scripts/daily-report.mjs morning --force --dry-run
```

## 운영 시 유의사항

- **시각 오차**: GitHub 예약 실행은 혼잡 시 5~20분 지연될 수 있어 07:30 / 15:45에 시작합니다. 분석 자체에 5~10분이 걸려 도착은 대략 8시·4시 전후입니다. 더 정확한 시각이 필요하면 `cron` 값을 조정하세요.
- **60일 비활성 정지**: 공개 저장소는 60일간 커밋이 없으면 GitHub가 예약 워크플로를 자동 중지합니다(이메일 안내). Actions 탭에서 다시 활성화하면 됩니다.
- **비용**: Claude API 1일 약 $1~3 (웹 검색량에 따라 변동). 각 노션 페이지의 `비용USD`에 실행별 추정 비용이 기록됩니다.
- **데이터 한계**: 지수 거래량·투자주체 수급은 웹 검색 기반이라 누락·지연될 수 있으며, 확인 못 한 수치는 "미확인"으로 표기됩니다.
