# Polygon(Heimdall-CL) 운영 리포트

- 생성 시각: 2026-02-22T01:45:20.277Z
- RSS: v1.6.0
- 비교 기준(Base): eceb9ccaca013c0594923e2035960444e7f3f173
- 최신 커밋(Head): 56d79f7a5da250e21881f1c7da44761a2419a618

## 한줄 요약
Polygon(Heimdall) v1.6.0 릴리즈는 백엔 로직과 RPC 인터페이스에 중대한 변화를 가져옵니다. 핵심은 백그라운드에서 **백필스(Backfill Spans)** 기능이 완전히 제거되고, **apocalypse height** 로직이 `app/app.go` 에 삽입되어 특정 블록 높이에서 프로세스를 종료하도록 설계되었습니다. 이로 인해 노드 운영자는 기존 백필스 메시지와 관련된 RPC 호출을 더 이상 사용하지 못하고, 아카이브 노드가 최신 블록까지 정상적으로 동작하도록 재검증해야 합니다. 또한, `checkpoint` 모듈가 **keeper** 에서 제거되면서 체크포인트 로직이 사라지므로, 스냅샷 기반 백업 정책에 대한 재검토가 필요합니다.

## 운영자 중요 체크
- 아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다.
- 노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다.

## 주요 변경점
- 주요 변경점 없음

## RPC/API 영향
- GetStartBlockHeimdallSpanID (삭제)

## 아카이브 노드 영향
- 1️⃣ Checkpoint 로직이 사라지므로, 아카이브 노드가 최신 블록까지 정상 동작하도록 스냅샷 로직을 재검증해야 함.
- 2️⃣ `apocalypse height` 가 도달리면 프로세스가 종료되므로, 아카이브 노드가 **Graceful Exit** 를 수행하도록 설정 필요.
- 3️⃣ `GetStartBlockHeimdallSpanID` RPC 가 사라지므로, 기존에 이 호출을 의존하던 노드가 **RPC 에러** 를 발생시킬 수 있음.

## 운영 액션 아이템
- 1️⃣ 백필스 기능이 사라졌으므로, **백필스** 를 대체할 로직을 배포.
- 2️⃣ `apocalypse height` 가 도달리면 프로세스 종료 로직이 삽입되었으므로, **Graceful Exit** 를 모니터링.
- 3️⃣ `checkpoint` 로직이 사라졌으므로, **마지막** 정보를 재검증하고 스냅샷 백업 정책을 재설정.
- 4️⃣ `GetStartBlockHeimdallSpanID` RPC 가 사라졌으므로, 해당 엔드포인트를 호출하던 클라이언트는 **RPC 재작성** 해야 함.

## 마이그레이션 체크리스트
- 1️⃣ `MsgBackfillSpans` 를 완전 삭제한 점 검증.
- 2️⃣ `GetStartBlockHeimdallSpanID` RPC 가 사라졌는지 확인.
- 3️⃣ `apocalypse height` 로직이 삽입되었는지 코드에 반영.
- 4️⃣ `checkpoint` 로직이 사라졌는지 확인하고, 스냅샷 백업 정책 재검증.
- 5️⃣ `common.CodeInvalidMsg` 로직이 통합되었는지 검증.
- 6️⃣ 아카이브 노드가 **Graceful Exit** 를 수행하도록 설정.

## 위험/주의 사항
- 위험 요소 없음

## 근거(Evidence)
- commit 56d79f7a: 'helper: set apocalypseHeight for mainnet' 로 `app/app.go` 에서 os.Exit 삽입.
- commit ac67916c: 'Merge remote-tracking branch \'origin/bhilai-hotfix\' into v1.6.0-beta-candidate' 로 RPC 함수 삭제.
- commit ff8c0814: 'Merge tag \'v1.3.3-test\' into v1.6.0-beta-candidate' 로 백필스 관련 코드 삭제.
- diff --git a/bor/handler.go b/bor/handler.go: 'MsgBackfillSpans' 로직 완전 삭제.
- diff --git a/bor/keeper.go b/bor/keeper.go: 'checkpointKeeper' 필드 삭제.
- diff --git a/app/app.go: apocalypse height 로직 삽입 및 os.Exit(0)

## 운영 메모
- 추가 메모 없음

## 원문 커밋 내용
### Commit Log
```text
56d79f7a helper: set apocalypseHeight for mainnet
ac67916c Merge remote-tracking branch 'origin/bhilai-hotfix' into v1.6.0-beta-candidate
ff8c0814 Merge tag 'v1.3.3-test' into v1.6.0-beta-candidate
d2ed6828 helper: set the  apocalypseHeight to 8788500 (to use for amoy only) (#1284)
89baf96f Set default span duration (#1283)
```

