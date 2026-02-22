# Polygon(Erigon-EL) 운영 리포트

- 생성 시각: 2026-02-22T01:43:38.459Z
- RSS: v3.3.7 - Rocky Romp
- 비교 기준(Base): 745451f6a8c7eeef9c12bf4a36995009d8259ee9
- 최신 커밋(Head): 9a898cf76896d02edb6fd42de0d4b4b4f78ce9d3

## 한줄 요약
이번 릴리즈(버전 3.3.7)는 주로 내부 DB 구조와 메모리 관리 로직을 정제하고, 일부 API/옵션에 대한 기본값을 재정의한 버전이다. 핵심 변경은 `seg_paged_rw.go`에서 페이지 크기 파라미터를 명시적으로 전달하도록 함으로써, 압축/압축 해제 시 페이지 단위 계산 로직이 바뀌었다. 이로 인해 압축 파일 포맷과 페이지 수 계산 로직이 바뀌면서, 아카이브 노드가 저장소를 재구성할 때 페이지 수에 따라 파일 구조가 달라질 가능성이 있다. 또한 `db/state/history.go`에서 압축 페이지 값 계산 로직이 바뀌면서, 과거 버전과의 호환성 이슈가 발생할 수 있다. `cmd/utils/flags.go`에서 V5 discovery flag에 대한 alias를 추가해, CLI 옵션이 두 가지 형태로 동작하도록 변경했다. 이 외에 `db/state/aggregator.go`에서 비효율적인 공간 체크 로직을 제거해, 메모리 사용량이 늘어날 수 있다. 이 변경은 RPC/JSON‑RPC 인터페이스에는 직접적인 영향이 없으나, 내부 DB 구조가 바뀌면서 아카이브 노드 재구동 시 파일 포맷 변화를 감지해야 한다.

## 운영자 중요 체크
- 아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다.
- 노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다.

## 주요 변경점
- 주요 변경점 없음

## RPC/API 영향
- 해당 사항 없음

## 아카이브 노드 영향
- 해당 사항 없음

## 운영 액션 아이템
- CLI 옵션 `--discovery.v5`에 대한 alias(`v5disc`)를 지원하도록, 노드 설정 파일에 `discovery.v5` 옵션을 명시.
- 아카이브 노드 재구동 시, `seg_paged_rw.go`에 전달되는 페이지 크기 값이 올바른지 확인.
- 대규모 노드에서 `PruneSmallBatches` 로직이 비효율적일 수 있으므로, 메모리 사용량을 모니터링하고 필요 시 `--prune` 옵션 조정.
- 버전 3.3.7 로 업그레이드 시, `History` 파일 포맷이 바뀌는지 확인하고, 필요 시 스냅샷 재생성.

## 마이그레이션 체크리스트
- 새로운 `seg_paged_rw.go`에 전달되는 페이지 크기 파라미터가 없을 경우, 기본값(16)으로 fallback하도록 테스트 케이스를 검토.
- 아카이브 노드가 재구동 시, `History` 파일 포맷을 확인해 호환성 이슈가 없는지 테스트.
- 대규모 노드에서 메모리 사용량이 급증하지 않도록, `PruneSmallBatches` 로직을 모니터링.
- CLI 옵션 `--discovery.v5`에 대한 alias(`v5disc`)가 정상 동작하는지 테스트.
- 버전 3.3.7 로 업그레이드 후, RPC/JSON‑RPC 인터페이스가 변하지 않았는지 테스트.

## 위험/주의 사항
- 아카이브 노드가 재구동 시, 압축 파일 포맷이 바뀌면 기존 스냅샷을 읽지 못할 수 있다. 특히 `History` 구조에서 페이지 값 계산 로직이 바뀌면서, 과거 버전과의 호환성 이슈가 발생할 수 있다.
- 메모리 사용량이 늘어날 경우, 재구동 시 `PruneSmallBatches` 로직이 비효율적일 수 있다.

## 근거(Evidence)
- 근거 데이터 없음

## 운영 메모
- 아카이브 노드가 재구동 시, `seg_paged_rw.go`에 전달되는 페이지 크기 값이 올바른지 확인. 테스트 케이스(`seg_paged_rw_test.go`)를 참고해, `pageSize`가 0 이면 기본값(16)으로 fallback하도록 구현.
- 아카이브 노드가 재구동 시, `History` 파일 포맷을 확인해, 과거 버전과의 호환성 여부를 테스트. 필요 시 `h.HistoryValuesOnCompressedPage` 값을 조정.
- `PruneSmallBatches` 로직을 모니터링하고, 메모리 사용량이 급증 시 재구동 전 `--prune` 옵션을 검토.

## 원문 커밋 내용
### Commit Log
```text
9a898cf768 v up (#18881)
d99a308050 execution/eth1: fix flake in TestValidateChainWithLastTxNumOfBlockAtStepBoundary (#18879)
572e586968 Backport TestResubscribeWithCompletedSubscription and deadlock fix to release/3.3 (#18862)
d17627649a [r3.3] execution: fix commitment state key txNum when last block tx is at step boundary (#18858)
bc42e38537 Fixed seg_paged_rw to use correct config parameter for page size (#18843)
d0e523e7d3 Fixed index building for v0 snapshot format (#18824)
41c364bf47 Show the default P2P discovery bools in --help (#18819)
8c5695bfc9 prune: remove early-exit based on DirtySpace() (#18787)
d31ed43b9e Add --v5disc alias (#18785)
```

