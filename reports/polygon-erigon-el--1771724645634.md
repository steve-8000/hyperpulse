# Polygon(Erigon-EL) 운영 리포트

- 생성 시각: 2026-02-22T01:44:05.634Z
- RSS: v3.3.8 - Rocky Romp
- 비교 기준(Base): 9a898cf76896d02edb6fd42de0d4b4b4f78ce9d3
- 최신 커밋(Head): e071586a2a7b29bff67f0f8a11ed79f47b2fa81c

## 한줄 요약
v3.3.8 (Rocky Romp) 릴리즈는 주로 디버그 API, 데이터 컬럼 사이드카(데이터 컬럼) 처리 로직 개선과 RPC 테스트 스위트 조정, 그리고 리스티어(리포지션) 관련 버그 수정을 포함한다. 주요 변경 사항은 디버그 엔드포인트 경로 재정의, receipts 캐시 동작 조정, 그리고 데이터 컬럼 사이드카 구조에 대한 필수 필드 추가이다.

## 운영자 중요 체크
- RPC/JSON-RPC 관련 변경 단서가 감지되었습니다.
- 외부 API 엔드포인트/버전 관련 변경 단서가 감지되었습니다.
- 아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다.
- 노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다.

## 주요 변경점
- 주요 변경점 없음

## RPC/API 영향
- 해당 사항 없음

## 아카이브 노드 영향
- BlockRoot, Slot 필드를 파일에 기록해야 함. `dataColumnFilePath` 로직이 업데이트되었으며, 아카이브 노드가 새 필드를 인식하도록 재배포 필요.
- 비활성화 시 메모리 사용량이 증가할 수 있으나, 디버그 모드에서만 적용. 아카이브 노드는 `--persist.receipts` 옵션을 사용하면 캐시를 비활성화 할 수 있다.

## 운영 액션 아이템
- 기존 스크립트/툴에 /debug/data_column_sidecars 경로를 `/debug/beacon/data_column_sidecars` 로 교체.
- `DISABLE_RECEIPTS_LRU_CACHE` 를 필요 시 비활성화.
- BlockRoot, Slot 필드가 저장되는지 확인.

## 마이그레이션 체크리스트
- 디버그 엔드포인트 경로 테스트
- receipts 캐시 비활성화 옵션 테스트
- 데이터 컬럼 사이드카 파일 포맵 검토

## 위험/주의 사항
- 기존 클라이언트가 /debug/data_column_sidecars/{block_id} 엔드포인트를 호출할 경우 404 또는 잘못된 응답을 받을 수 있다. 기존 스크립트/툴이 경로를 하드코딩해 두는 경우 마이그레이션 필요.
- --persist.receipts 옵션과 --prune.mode=minimal 설정 시 receipts 캐시가 비활성화 되면 메모리 사용량이 급증하고, 디버그 모드에서 성능 저하 가능.
- 데이터 컬럼 사이드카를 저장/읽을 때 BlockRoot, Slot 필드를 수동으로 주입. 기존 DB 스키마에 없으므로 백업/아카이브 노드가 새 필드를 인식하지 못하면 데이터 손실 가능.

## 근거(Evidence)
- 근거 데이터 없음

## 운영 메모
- 디버그 엔드포인트가 `beacon` 패키지 내부에 위치해, 경로 변경으로 인해 외부 스크립트가 실패할 수 있다. 테스트 케이스를 재검토.
- BlockRoot, Slot 필드를 수동으로 주입. DB 저장 시 `dataColumnFilePath` 에서 이 두 필드를 설정하도록 로직이 추가되었음. 아카이브 노드가 새 필드를 인식하도록 업데이트 필요.
- `--persist.receipts` 옵션이 활성화되면 receipts 캐시가 비활성화 되며, `DISABLE_RECEIPTS_LRU_CACHE` 환경 변수를 통해 제어. 이 옵션은 메모리 사용량에 직접적인 영향을 미치므로 모니터링 필요.

## 원문 커밋 내용
### Commit Log
```text
e071586a2a vvv (#19283)
f7d6092e49 eth_getLogs: receipts availability check to be aware about `--persist.receipts` and `--prune.mode=minimal` (#19226)
2fccea249f New Chiado boot nodes (cherry-pick #18867) (#19241)
27579941d1 [3.3] protect History from events duplication (#19230)
dcc8d1a9fd [r33] rpc: add check on latest executed block (#19133)
b500191278 p2p: fix nil pointer crash with --nodiscover (#19056)
2f670ca63a [e33] execution/execmodule: fix unwinding logic when side forks go back in height (#18993) (#19063)
3afabefb4e [r33] rpc: bound checks in receipts cache V2 and generator (#19046)
e4e5b566ca [r33] rpc: env var for disabling receipt LRU caches (#19027)
8b2c735385 [r33] fix(caplin): Fixes for DataColumnSidecar (#18268) (#19003)
b2dc316c09 Reduce impact of background merge/compress to ChainTip (#18995)
6f898cd29a [r33] txnprovider/shutter: fix decryption keys processing when keys do not follow txnIndex order (#18951) (#18959)
d662df0f03 [r33] execution/types: harden EncodeBigInt (#18958)
d49b021288 [r3.3] rpc-tests: disable an erroneous test (remote) (#18924)
9ee70c58cc [r3.3] rpc-tests: disable an erroneous test (#18891)
f205c681cd [r3.3] execution: fix Chiado re-exec from genesis (#18887)
4b717421d0 execution/tests: minor fix chainmaker add withdrawals in shanghai (#18886)
```

