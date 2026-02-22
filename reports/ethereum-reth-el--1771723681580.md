# Ethereum(Reth-EL) 운영 리포트

- 생성 시각: 2026-02-22T01:28:01.580Z
- RSS: Reth v1.11.0
- 비교 기준(Base): 8e3b5e6a99439561b73c5dd31bd3eced2e994d60
- 최신 커밋(Head): 564ffa586845fa4a8bb066f0c7b015ff36b26c08

## 한줄 요약
Reth v1.11.0 릴리즈는 주로 엔진, 스토리지, 네트워크 및 CLI 기능에 대한 개선과 버그 픽스를 포함한다. 주요 변경 사항은 스토리지 모드 제어링, 트라이 파라미터 조정, 그리고 새 CLI 서브커맨드와 스냅샷 URL 옵션이다. 이 릴리즈는 RPC/JSON‑RPC 인터페이스에 직접적인 변동은 없으나, 스토리지와 엔진 레벨에서의 내부 동작이 바뀜으로 인해 아카이브 노드 운영에 영향을 줄 수 있다.

## 운영자 중요 체크
- RPC/JSON-RPC 관련 변경 단서가 감지되었습니다.
- 아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다.
- 노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다.

## 주요 변경점
- 주요 변경점 없음

## RPC/API 영향
- 현재 릴리즈에서는 JSON‑RPC 인터페이스에 직접적인 변경은 없으며, `EthMessageID::max` 값이 정정되어서 메시지 ID 범위가 조정되었다.

## 아카이브 노드 영향
- `--storage.v2` 플래그 도입으로 RocksDB 기반 스토리지가 기본값이 된다. 기존 `edge` 플래그를 사용하던 노드는 재설정 필요.
- `--engine.disable-sparse-trie-cache-pruning` 플래그 도입으로 트라이 캐시가 비활성화되면 메모리 사용량이 증가할 수 있다. 아카이브 노드가 대용량 데이터를 다룰 때 주의 필요.

## 운영 액션 아이템
- 스토리지 플래그(`--storage.v2`) 를 활성화하고, 필요 시 `--static-files.*` 혹은 `--rocksdb.*` 옵션을 명시적으로 지정.
- 스파이 파라미터(`--engine.disable-sparse-trie-cache-pruning`) 를 필요 시 활성화 혹은 비활성화.
- 스냅샷 URL 옵션이 새로 추가되었으므로, 스냉샷 다운로드 시 `--download.snapshot-url` 옵션을 검토.
- DB 복사 시 `reth db copy` 서브커맨드를 테스트하고, 데이터 무결성 검증을 수행.

## 마이그레이션 체크리스트
- 스토리지 플래그(`--storage.v2`) 도입에 따른 설정 파일 업데이트.
- RocksDB 기반 스토리지 사용 시 `--rocksdb.*` 옵션이 활성화되었는지 확인.
- 스파이 파라미터(`--engine.disable-sparse-trie-cache-pruning`) 가 필요 시 활성화 여부를 검토.
- 스냅샷 URL 옵션(`--download.snapshot-url`) 이 올바른지 검토.
- 스냉샷 다운로드 시 새 URL 포맵이 지원되는지 테스트.

## 위험/주의 사항
- 스토리지 모드 전환: `--storage.v2` 플래그 도입으로 기존 `edge` feature flag 가 제거되고, RocksDB 기반 스토리지가 기본값이 된다. 기존 설정을 사용 중인 노드에서 `--static-files.*` 혹은 `--rocksdb.*` 옵션을 명시적으로 지정해 주어야 한다.
- 스파이 파라미터 변경으로 인한 트라이 캐시 동작(예: `--engine.disable-sparse-trie-cache-pruning` 플래그) 이 활성화되면, 메모리 사용량이 증가할 수 있다.
- 스냅샷 URL 옵션 추가(옵션: `--download.snapshot-url`) 으로 인한 스냅샷 다운로드 경로가 바뀜 경우, 기존 스냅샷 저장소와의 호환성 이슈가 발생할 수 있다.
- 스테이트리스 검증 로직이 `validate_stateless` 와 `validate_stateful` 으로 리네임되었으나, 내부 테스트 코드에 의존하는 부분이 있다면 테스트 환경에서 예외가 발생할 수 있다.

## 근거(Evidence)
- 근거 데이터 없음

## 운영 메모
- 스토리지 플래그 변경은 스토리지 레이어(rocksdb, static‑files) 에 대한 feature gate 를 바꾸어 주므로, 스토리지 설정 파일(`config.toml`) 과 `reth` 실행 시 옵션을 재검토해야 한다.
- 스파이 파라미터가 비활성화되면, 트라이 캐시가 남아있지 않게 되므로 메모리 사용량이 증가할 수 있다. 이는 아카이브 노드에서 큰 데이터셋을 다룰 때 주의해야 한다.
- 스냅샷 URL 옵션이 추가되었으나, 기존 스냅샷 저장소가 새 URL 포맵을 지원하지 않으면 다운로드 실패 위험이 있다.
- `reth db copy` 서브커맨드는 `mdbx_copy` 를 내부적으로 호출하므로, DB 복사 시 파일 포맵이 바뀜 경우 데이터 무결성 검증을 수행해야 한다.

## 원문 커밋 내용
### Commit Log
```text
564ffa586 fix(ci): pass docker tags as separate set entries in bake action (#22151)
12891dd17 chore: allow invalid storage metadata (#22150)
c1015022f chore: release reth v1.11.0 (#22148)
e3fe6326b chore(storage): rm storage settings, use only one (#22042)
e3d520b24 feat(network): add inbound / outbound scopes for disconnect reasons (#22070)
9f29939ea feat: bundle mdbx_copy as `reth db copy` subcommand (#22061)
10881d1c7 chore: fix book (#22142)
408593467 feat(download): optional chain-aware snapshot url (#22119)
8caf8cdf1 docs: improve reth.rs/overview page (#22131)
1e8030ef2 fix(engine): return error on updates channel disconnect in sparse trie task (#22139)
f72c503d6 feat(metrics): use 5M first gas bucket for finer-grained newPayload metrics (#22136)
42890e6e7 fix: improve nightly Docker build failure Slack notification (#22130)
e30e441ad fix: stage drop prunes account/storage changeset static files (#22062)
121160d24 refactor(db): use hashed state as canonical state representation (#21115)
7ff78ca08 perf(engine): use transaction count threshold for prewarm skip (#22094)
d7f56d509 chore: add DaniPopes as codeowner for tasks crate (#22128)
3300e404c feat(engine): add --engine.disable-sparse-trie-cache-pruning flag (#21967)
77cb99fc7 chore(node): update misleading consensus engine log message (#22124)
66169c7e7 feat(reth-bench): add progress field to per-block benchmark logs (#22016)
4f5fafc8f fix(net): correct EthMessageID::max for eth70 and later versions (#22076)
0b8e6c6ed feat(net): enforce EIP-868 fork ID for discovered peers (#22013)
4a62d38af perf(engine): use sequential sig recovery for blocks with small blocks (#22077)
dc4f249f0 chore: zero-pad thread indices in thread names (#22113)
c915841a4 chore(stateless): Remove reth-stateless crate (#22115)
217a337d8 chore(engine): remove biased select in engine service loop (#21961)
74d57008b chore(engine): downgrade failed response delivery logs to warn (#22055)
f8767bc67 fix(engine): add await_state_root span to timeout path (#22111)
81c83bba6 refactor(engine): remove unnecessary turbofish on CachedStateProvider, add new_prewarm (#22107)
cd8ec5870 refactor(engine): move CachedStateProvider prewarm to const generic (#22106)
931b17c3f chore: bump alloy-core deps (#22104)
807d328cf fix: move alloy-primitives to regular dependency in bin/reth (#22105)
8a6bbd29f fix(tracing): return error instead of panicking on log directory creation failure (#22100)
8bedaaee7 feat(docker): include debug symbols in maxperf images (#22003)
09cd10567 fix(primitives): move feature-referenced deps from dev-dependencies to optional dependencies (#22103)
a0b60b7e6 feat(evm): impl ExecutableTxTuple for Either via EitherTxIterator (#22102)
90e15d096 perf: reduce tracing span noise in prewarm and proof workers (#22101)
a161ca294 feat(net): add reason label to backed_off_peers metric (#22009)
3a5c41e3d test: add WebSocket subscription integration tests for eth_subscribe (#22065)
968d3c953 revert: skip transaction prewarming for small blocks (#22059) (#22097)
fc6666f6a perf: treat hashes as bytes in BranchNodeCompact (#22089)
ff3a85432 perf: use dedicated trie rayon pool for proof workers (#22051)
04543ed16 chore: add span and log to runtime build (#22064)
ae3f0d4d1 test: expand CLI integration tests (#22086)
5bccdc4a5 feat(engine): add state root task timeout with sequential fallback (#22004)
0b7cd6066 perf(engine): skip transaction prewarming for small blocks (#22059)
aa983b49a perf(engine): add PrewarmMode::Skipped to avoid spawning idle workers (#22066)
2aff61776 feat(cli): split account-history and storage-history stage drops (#22083)
2c5d00ffb feat(engine): add gas bucket label to newPayload metrics (#22067)
```

