# Ethereum(Lighthouse-CL) 운영 리포트

- 생성 시각: 2026-02-22T05:02:03.476Z
- RSS: Squanchy
- 비교 기준(Base): ced49dd265e01ecbf02b12073bbfde3873058abe
- 최신 커밋(Head): edba56b9a654cea555cb0db2e8d0712525686973

## 한줄 요약
Lighthouse v8.1.0 릴리즈는 블록체인 노드 운영에 영향을 주는 여러 핵심 변경사항을 포함한다. 주요 포인트는 RPC/JSON‑RPC 인터페이스 조정, 데이터 컬럼 검증 로직 개선, 블롭(Blob) 처리 최적화, 그리고 재현성 빌드 지원을 위한 Docker 워크플로우 추가다. 이 릴리즈는 기존에 비활성화된 SQLite 지원을 끄고, 블록 헤드 이벤트를 조기 발행하도록 변경해 SSE 이벤트 흐름을 가속화했다. 또한, 블록 체인과 데이터 컬럼 검증 로직이 대폭 리팩터링되면서 아카이브 노드의 스토리지/리소스 관리에 영향을 미친다.



## 운영자 중요 체크
- 외부 API 엔드포인트/버전 관련 변경 단서가 감지되었습니다.
- 아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다.
- 노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다.

## 주요 변경점
- Convert RpcBlock to enum indicating availability (#8424)
- Add `optimistic_sync` metric (#8059)
- Remove sqlite default enablement (#8708)
- Add `NewHead` SSE event earlier in block import (#8718)
- Rework data_availability_checker and blob_verification modules (#... )

## RPC/API 영향
- `/eth/v1/beacon/blocks/head/root` 경로가 fast‑path 로 변경돼 응답 속도 개선
- `/eth/v1/debug/fork_choice`에 블록 루트 추가

## 아카이브 노드 영향
- 데이터 컬럼 검증 로직이 새 모듈로 분리돼 블록 저장 시 메모리 사용량 증가 가능성
- 블록 헤드 이벤트 조기 발행으로 인한 SSE 스트리밍 지연 가능성

## 운영 액션 아이템
- Docker 빌드 재현성 워크플로우를 실행해 이미지가 동일한지 확인
- 새 버전으로 인한 블록 헤드 이벤트 조기 발행을 모니터링
- 아카이브 노드에서 데이터 컬럼 검증 로직을 재설정해 메모리 사용량 조절

## 마이그레이션 체크리스트
- 기존 노드에 `sqlite` 비활성화 옵션이 있다면 재설정
- 블록 헤드 이벤트 조기 발행 설정 검증
- 데이터 컬럼 검증 로직이 새 모듈로 이동했으므로, 테스트 스크립트에 `data_availability_checker` 모듈 포함

## 위험/주의 사항
- RPC API 구조 변경으로 인한 클라이언트 호환성 이슈 가능성
- 블록 데이터 컬럼 검증 로직 변경으로 인한 아카이브 노드 재동기화 지연 가능성
- Docker 빌드 재현성 검증 실패 시 이미지 배포 중단 위험

## 근거(Evidence)
- commit 819d... "Convert RpcBlock to an enum that indicates availability" (#8424)
- commit 8708 "Disable sqlite by default" (#8708)
- commit 8718 "Emit NewHead SSE event earlier in block import" (#8718)
- commit 8059 "Add optimist_sync metric" (#8059)

## 운영 메모
- RPC API: /eth/v1/beacon/blocks/head/root 경로가 fast‑path 로 변경돼 응답 속도 개선
- 블록 헤드 이벤트를 조기 발행해 SSE 소비자에게 더 빠른 업데이트 제공
- 데이터 컬럼 검증 로직이 새 모듈로 분리돼 블록 저장 시 성능 향상
- 아카이브 노드에서 데이터 컬럼을 재검증할 때 추가 메모리 사용량 증가 가능성

## 원문 커밋 내용
### Commit Log
```text
edba56b9a Release v8.1.0 (#8749)
819dae3d9 fix bootnode entry (#8748)
bd1966353 Use events API to eager send attestations  (#7892)
c25a97592 Bump bytes to 1.11.1 to fix RUSTSEC-2026-0007 (#8743)
99e957ad3 Merge remote-tracking branch 'origin/stable' into unstable
940fa81a5 Fast path for `/eth/v1/beacon/blocks/head/root` (#8729)
3ecf96438 Replace `INTERVALS_PER_SLOT` with explicit slot component times (#7944)
cd8049a69 Emit `NewHead` SSE event earlier in block import (#8718)
119dc565a Call beacon_committee_selections only once per epoch (#8699)
bbb074692 Disable `sqlite` by default (#8708)
b202e98dd Gloas gossip boilerplate (#8700)
f7b5c7ee3 Convert RpcBlock to an enum that indicates availability (#8424)
c4409cdf2 Remove unused anvil references (#8710)
9bec8df37 Add Gloas data column support  (#8682)
0f57fc9d8 Check slashability of attestations in batches to avoid sequential bottleneck (#8516)
1476c20cf Remove `data` dependency from from `core` module in `consensus/types (#8694)
7f065009a Implement custom OpenTelemetry sampler to filter uninstrumented traces (#8647)
21cabba1a Updated consensus types for Gloas `1.7.0-alpha.1` (#8688)
33e41d3f4 update libp2p dependency to upstream (#8200)
f78757bc4 Revised log when all validators have exited (#8623)
58b153cac Remove remaining facade module re-exports from `consensus/types` (#8672)
d099ad56f Remove `execution` dependency from `core` module in `consensus/types` (#8666)
3903e1c67 More `consensus/types` re-export cleanup (#8665)
acc746d94 Update chainspec p2p and etc (#8601)
1abc41e33 Cleanup `consensus/types`  re-exports (#8643)
605ef8e8e Remove `state` dependency from `core` module in `consensus/types` (#8653)
f584521e8 chore(validator_client): Read genesis time and genesis validators root from eth2_network_config (#8638)
c91345782 Get blobs v2 metrics (#8641)
57bbc93d7 Update buckets for metric (#8651)
3fac61e0c Re-introduce clearer variable names in beacon processor work queue (#8649)
39c542a37 Remove http-api tests, and test on `unstable` by default, with option to override. (#8646)
b8c386d38 Move beacon processor work queue implementation to its own file (#8141)
6166ad2eb Replace tracing::debug! with debug! same for other levels (#8300)
d1028c9b3 Add nightly tests workflow to test prior forks (#8319) (#8636)
0706e62f5 fix(peerdb): use start_slot instead of end_slot for safer actions (#8498)
a39558f6e Remove Windows in the documentation (#8628)
79d314ddb Tweak a log message for mock-el (#8599)
3662e1ab7 Remove duplicated `crypto` dependencies (#8605)
2fe59405b Gloas add off protocol payment field to bid (#8596)
dbe474e13 Delete attester cache (#8469)
ea3a3da1a fix: improve error for insufficient blob data columns (#8595)
ea811d66c perf: remove allocations from merkle tree proof verification logic (#8614)
9b3d7e3a5 refactor: remove `service_name`  (#8606)
6dab3c9a6 update ruint dependency (#8617)
008dec125 Update `procfs` (#8608)
2ce6b5126 Refine cargo-deny rules (#8602)
4e35e9d58 Add cargo deny on CI (#8580)
4c268bc0d Delete `PartialBeaconState` (#8591)
a39e99155 Gloas(EIP-7732): Containers / Constants (#7923)
86c2b7cfb Append client version info to graffiti (#7558)
afa6457ac fix visual bug on visualize_batch_state leading to a non-wanted comma (#8499)
ac8d77369 Fix Makefile to avoid git describe error in CI (#8513)
32f7615cc Update `syn` to `2.0.110` (#8563)
6a3a32515 Update `strum` to `0.27` (#8564)
49e1112da Add regression test for unaligned checkpoint sync with payload pruning (#8458)
cd0b1ef64 fix(bls): fix is_infinity when aggregating onto empty AggregateSignature (#8496)
556e91709 Rust 1.92 lints (#8567)
5abbdb660 Do not request attestation data when attestation duty is empty (#8559)
d9ddb72f5 Fix testnet script (#8557)
f3fd1f210 Remove `consensus/types` re-exports (#8540)
77d58437d Clarify `alloy` dependencies (#8550)
7bfcc0352 Reduce `eth2` dependency space  (#8524)
2afa87879 Move beacon pool http api to its own separate module (#8543)
e27f31648 Move validator http endpoints to a separate module (#8536)
4e958a92d Refactor `consensus/types` (#7827)
51d033602 Move beacon state endpoints to a separate module. (#8529)
41ba13503 Move deposit contract artifacts to /target (#8518)
0bccc7090 Always use committee index 0 when getting attestation data (#8171)
7ef9501ff Instrument attestation signing. (#8508)
4fbe51749 Fix data columns sorting when reconstructing blobs (#8510)
f42b14ac5 Update local testnet scripts for the fulu fork (#8489)
90dd5bb5d Refactor get_validator_blocks_v3 fallback (#8186)
64031b6cb Add tracing spans to validator client duty cycles (#8482)
7cee5d609 Optimise pubkey cache initialisation during beacon node startup  (#8451)
939466315 fix: compare bls changes in op-pool (#8465)
713e47791 feat: Add reproducible builds release workflows and push images to DockerHub  (#7614)
847fa3f03 Remove `context_deserialize` and import from crates.io (#8172)
e29195540 Integration tests ergonomics (#7836)
070e39571 Remove quickcheck in favour of proptest (#8471)
4494b0a68 Update docs on Siren port and other small updates (#8399)
e21a43374 Allow manual checkpoint sync without blobs (#8470)
d6cec0ba5 Dockerfile with cargo artifacts caching (#8455)
bdfade8e3 Consolidate reqwest versions (#8452)
03832b0ad chore: Add Dockerfile.dev for local development (#8295)
0d0232e8f Optimise out block header calculation (#8446)
2ba8a8e6a Cargo Update (#8443)
261322c3e Merge remote-tracking branch 'origin/stable' into unstable
d59e340d3 Add nightly tests workflow to test prior forks (#8319)
e28236366 Gracefully handle deleting states prior to anchor_slot (#8409)
b5260db5e Add extra data in `/eth/v1/debug/fork_choice` (#7845)
d54dc685a Add `optimistic_sync` metric (#8059)
fff248d41 Migrate `execution_engine_integration` to `alloy` (#8140)
53e73fa37 Remove duplicate state in ProtoArray (#8324)
11d1f6075 Migrate the `deposit_contract` crate to `alloy` (#8139)
b3df0d198 fix: clarify `bb` vs `bl` variable names in BeaconProcessorQueue (#8315)
22dea2bc3 Include block root in publish block logs (#8111)
93b8f4686 Remove `ethers-core` from `execution_layer` (#8149)
1bd4ac211 Fix flaky reconstruction test (#8321)
2c1f1c160 Migrate derivative to educe (#8125)
0090b35ee Remove `sensitive_url` and import from `crates.io` (#8377)
e6e3d783a CI workflows to use warpbuild ci runner (#8343)
f387090b9 Remove ecdsa feature of libp2p (#8374)
3066f0bef Prepare `sensitive_url` for `crates.io` (#8223)
7b1cbca26 Downgrade and remove unnecessary logs (#8367)
8f7dcf02b Fix unaggregated delay metric (#8366)
1e10329c9 Update proposer-only section in the documentation (#8358)
efadbb315 Remove Windows CI jobs (#8362)
a7e89a876 Optimise `state_root_at_slot` for finalized slot (#8353)
0507eca7b Merge remote-tracking branch 'origin/stable' into unstable-merge-v8
bc86dc09e Reduce number of blobs used in tests to speed up CI (#8194)
2c9b670f5 Rework `lighthouse_version` to reduce spurious recompilation (#8336)
c46cb0b5b Merge remote-tracking branch 'origin/release-v8.0' into unstable
af9cae4d3 Add `version` to the response of beacon API client side (#8326)
30094f0c0 Remove redundant `subscribe_all_data_column_subnets` field from network (#8259)
f70c650d8 Update spec tests to v1.6.0-beta.1 (#8263)
b69c2f5ba Run CI tests only recent forks (#8271)
3bfdfa5a1 Merge remote-tracking branch 'origin/release-v8.0' into unstable
341eeeabe Extracting the Error impl from the monolith `eth2`  (#7878)
f4b1bb46b Remove `compare_fields` and import from crates.io (#8189)
f5809aff8 Bump `ssz_types` to `v0.12.2` (#8032)
```

