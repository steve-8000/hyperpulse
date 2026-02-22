# Polygon(Heimdall-CL) 운영 리포트

- 생성 시각: 2026-02-22T01:44:32.560Z
- RSS: v1.5.0
- 비교 기준(Base): 281c549fc125f9280166283e4ecbc3c5878c5ae7
- 최신 커밋(Head): eceb9ccaca013c0594923e2035960444e7f3f173

## 한줄 요약
v1.5.0 릴리즈는 백필(Backfill) 기능과 헐리데이(Heimdall) 스팬 처리 로직을 대폭 개선하고, 신규 RPC 엔드포인트를 추가했습니다. 또한 테스트넷용 genesis 파일을 새로 추가하고, 패키징 스크립트에 amoy‑v1.json 을 포함시켜 배포 프로세스를 정비했습니다. 이 릴리즈는 백필 메시지 처리 로직과 헐리데이 스팬 ID 조회 RPC를 도입해 운영자가 백필 상황을 모니터링하고, 아카이브 노드가 최신 스팬 정보를 정확히 인식하도록 보장합니다.  



## 운영자 중요 체크
- 외부 API 엔드포인트/버전 관련 변경 단서가 감지되었습니다.
- 아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다.
- 노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다.

## 주요 변경점
- 주요 변경점 없음

## RPC/API 영향
- 해당 사항 없음

## 아카이브 노드 영향
- 아카이브 노드가 최신 스팬 정보를 정확히 인식하려면, 헐리데이 스팬 ID를 정기적으로 조회해야 함. GetStartBlockHeimdallSpanID RPC 호출을 통해 최신 스팬 ID를 확인하도록 설정 필요.
- amoy‑v1 genesis 파일이 새로 추가되었으나, 아카이브 노드가 이 파일을 로드하도록 설정 필요. 없으면 초기화 실패.

## 운영 액션 아이템
- Dockerfile, goreleaser 설정에 파일 복사 명령 추가.
- 서버 측에 해당 엔드포인트를 추가하고, 클라이언트에서 호출하도록 설정.
- 백필 메시지 처리 로직이 정상 동작하는지 백엔 테스트를 추가.

## 마이그레이션 체크리스트
- 배포 시 해당 파일을 포함하도록 빌드 스크립트에 반영.
- 클라이언트 호출 시 정상 동작하도록.
- 백필 메시지 처리 로직이 정상 동작하는지 테스트 케이스 추가.

## 위험/주의 사항
- 위험 요소 없음

## 근거(Evidence)
- 근거 데이터 없음

## 운영 메모
- 백필 메시지에서 헐리데이 스팬 ID 검증 로직은 현재 테스트 커버리지가 낮음. 운영자는 백필 시 헐리데이 스팬 ID와 BOR 스팬 ID를 정확히 매칭하도록 모니터링 지표를 추가 권장.
- GetStartBlockHeimdallSpanID RPC는 헐리데이 스팬 ID를 조회할 수 있으나, 현재 서버에 구현된 RPC가 없으므로 클라이언트 호출 시 404 혹은 nil 반환이 발생할 수 있다. 서버 코드에 해당 RPC를 추가해야 함.
- amoy‑v1 genesis 파일이 새로 추가되었으나, 배포 스크립트가 이 파일을 참조하도록 설정이 필요. 기존 빌드 시 amoy‑v1.json 이 없으면 초기화 실패.

## 원문 커밋 내용
### Commit Log
```text
eceb9cca Merge remote-tracking branch 'origin/bhilai-hotfix' into v1.5.0-candidate
13e47ca4 Merge tag 'v1.3.3-test' into v1.5.0-beta-candidate
80db282c Disable evidence
d6ecf320 Disable Evidence
7a9250d2 Use defualt mainnet span duration
ccd060e7 Cleanup debug logs
d8349948 Fix broadcasting backfill tx
77c84223 Added debug logging
84bd6409 Register backfill msg
9a6585e0 Fix span by id url
c6dc4259 Debug log
90e5dee1 Debug log
3eec8790 Remove dependency on latest bor
dff87ea7 Dont allow creating spans until backfill didnt executed
e3f771ec Backfill spans
00cf3b72 Remove halt height logic
dafcbb67 spans propositions skip for bor without heimdall (#1278)
020f6c0d Merge pull request #1281 from maticnetwork/raneet10/checkpoint-halt
f3f46981 bridge: allow everyone to send ack post CheckpointHaltHeight
b1cfaf3f bridge,checkpoint,cmd,helper: address comments
3b60721d bridge: send ack irrespective of being the current proposer
5f10dc33 bridge,checkpoint,helper,simulation: prevent checkpoint submission in bridge
89886cac helper: bump apocalypseHeight for tests
dfeac586 checkpoint,common: prevent checkpoint submission prior to the apocalypse
b7fd9ac3 fix typo (#1280)
00976c13 amoy genesis file (#1279)
74c8af58 don't use LoadLatest
b6ea4637 fix command
4c134987 add cli command to fetch latest block height
a67b8dd9 force app exit on beginBlocker after halt_height
7d9bb7a7 change apocalypseHeight to 200 for testing purposes
0a62a66c Merge branch 'develop' into mardizzone/apocalypse
bed97195 Export milestones (#1277)
6a8921eb Merge branch 'develop' into mardizzone/apocalypse
8cd45ea7 Packager updates (#1276)
d438ed17 Merge branch 'develop' into mardizzone/apocalypse
4499a755 change apocalypseHeight to 3000 for testing purposes
cfa43fcb Merge pull request #1273 from maticnetwork/master
d69a137b change haltHeight to 200 for testing
beee4755 test for GetHaltHeight
9482291c add endpoint for halt-height
9450387f remove panic as redundant now
a6d55d8e make flags required
fd2f14d8 Merge branch 'mardizzone/apocalypse' of https://github.com/maticnetwork/heimdall into mardizzone/apocalypse
99fbdbd6 make genesis export deterministic
6f930fdf make genesis export not deterministic
8b0cd93c place TODOs for export genesis non deterministic output
cc9beea0 reduce halt height to 20
f87e199a print filePath for bridgeDB
708736ef reduce halt height to 100
7a53951a remove dubg logs containing contracts ABIs
5d576637 rm HF on apocalypse
dbac1723 test apocalypse
```

