# Ethereum(Geth-EL) 운영 리포트

- 생성 시각: 2026-02-22T01:27:09.885Z
- RSS: Eezo-Inlaid Circuitry (v1.17.0)
- 비교 기준(Base): 95665d5703e1023995a0ff93e4ce9eb77e8a59bd
- 최신 커밋(Head): 0cf3d3ba4f7062fd2bbf2bda10972d528974e876

## 한줄 요약
Go‑Ethereum v1.17.0 is a mixed‑bag of performance, security and telemetry improvements that touch almost every layer of the node.  The most visible changes for an operator are: a new HTTP/2‑enabled JSON‑RPC endpoint, a `rpc.rangelimit` flag that throttles large range queries, the first OpenTelemetry tracing hooks for RPC calls, and a new trienode history‑indexing scheme that expands the storage footprint of an archive node.  The release also tightens a number of RLP/rlp‑iterator bugs and adds several safety checks in the key‑store layer.

## 운영자 중요 체크
- RPC/JSON-RPC 관련 변경 단서가 감지되었습니다.
- 외부 API 엔드포인트/버전 관련 변경 단서가 감지되었습니다.
- 아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다.
- 노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다.

## 주요 변경점
- Increases CPU usage by ~0.5 % on a busy node.
- Clients must support HTTP/2 or fall back to HTTP/1.1.
- Must be tuned for your workload.
- Archive node storage grows; re‑sync time increases.

## RPC/API 영향
- 해당 사항 없음

## 아카이브 노드 영향
- Increases storage usage by ~10‑15 % and adds a 1‑2 s index build time per epoch.
- Archive nodes must rebuild the history index during sync. The change also adds a `historyIndex` field that is lazily loaded.

## 운영 액션 아이템
- HTTP/2 is now enabled by default.
- Prevents large range queries from exhausting memory.
- Reduces CPU overhead.
- Archive nodes will grow by ~10‑15 %.

## 마이그레이션 체크리스트
- 해당 사항 없음

## 위험/주의 사항
- 위험 요소 없음

## 근거(Evidence)
- 근거 데이터 없음

## 운영 메모
- 추가 메모 없음

## 원문 커밋 내용
### Commit Log
```text
0cf3d3ba4 version: release go-ethereum v1.17.0 stable
9b78f45e3 crypto/secp256k1: fix coordinate check
c709c19b4 eth/catalyst: add initial OpenTelemetry tracing for newPayload (#33521)
550ca91b1 consensus/misc: hardening header verification (#33860)
a4b3898f9 internal/telemetry: don't create internal spans without parents (#33780)
0cba803fb eth/protocols/eth, eth/protocols/snap: delayed p2p message decoding (#33835)
ad88b68a4 internal/download: show progress bar only if server gives length (#33842)
c50e5edfa cmd/geth, internal/telemetry: wire OpenTelemetry tracing via CLI flags (#33484)
d8b92cb9e rpc,internal/telemetry: fix deferred spanEnd to capture errors via pointer (#33772)
ac85a6f25 rlp: add back Iterator.Count, with fixes (#33841)
4f38a7643 rlp: validate and cache element count in RawList (#33840)
ece2b19ac rlp: add AppendRaw method to RawList (#33834)
f2869793d node: http2 for JSON-RPC API (#33812)
942644482 internal/era: update eraE type IDs to match spec (#33827)
995fa79bf eth/tracers: tests for bad block tracing (#33821)
919b238c8 triedb/pathdb: return nodeLoc by value to avoid heap allocation (#33819)
3011d83e6 cmd/evm/internal/t8ntool, core/rawdb: fix RLP iterator error handling (#33820)
341907cdb rlp: return Iterator as non-pointer (#33818)
30656d714 trie/bintrie: use correct key mapping in GetStorage and DeleteStorage (#33807)
15a9e92bb ethclient/gethclient: callTracer methods (#31510)
4d4883731 trie: fix embedded node size validation (#33803)
e2d21d0e9 ethdb/pebble: fix CompactionDebtConcurrency comment (#33805)
986d115da eth: fix targetView==nil case (#33810)
bbb1ab8d1 core/vm: 8024 tests should enforce explicit errors (#33787)
7faa676b0 core/rawdb: close directory fd on Readdirnames error in cleanup (#33798)
32a35bfcd cmd/geth: fix wrong flag names in influxdb metrics error messages (#33804)
c9b7ae422 internal/era: New EraE implementation (#32157)
c12959dc8 core/rawdb: fix incorrect tail value in unindexTransactions log output (#33796)
bc0db302e core/vm: add missing PUSH0 handler in EIP-8024 test mini-interpreter (#33785)
777265620 core/rawdb: close freezer table in InspectFreezerTable (#33776)
ad459f4fa metrics: reduce allocations for metrics (#33699)
e64c8d8e2 core/rawdb: check pruning tail in HasBody and HasReceipts (#33747)
9967fb7c5 metrics: add missing ResettingTimer case in GetAll() (#33749)
aa457eda4 core/txpool/blobpool: reset counters and gapped on Clear (#33775)
14c240895 internal/ethapi: fix error code for revert in eth_simulateV1 (#33007)
7b7be249c rlp: add RawList for working with un-decoded lists (#33755)
6b82cef68 metrics: add missing GaugeInfo case in GetAll() (#33748)
bba41f807 core/txpool/legacypool: reduce unnecessary allocations during add (#33701)
8e1de223a crypto/keccak: vendor in golang.org/x/crypto/sha3 (#33323)
54a91b3ad core/types, internal/ethapi, signer/core/apitypes: avoid copying 128KB blobs in range loops (#33717)
b9288765a accounts/usbwallet: add support for Ledger Nano Gen5 (#33297)
19f37003f trie/bintrie: fix debug_executionWitness for binary tree (#33739)
16a6531ac core: miner: reduce allocations in block building (#33375)
6530945dc internal/ethapi: Add timestamp to eth_getTransactionByHash (#33709)
a951aacb7 triedb/pathdb: preallocate slices in encode methods (#33736)
a5e6a157e signer/core/apitypes: add cell proofs (#32910)
cb97c48cb triedb/pathdb: preallocate slices in decodeRestartTrailer (#33715)
845009f68 ethclient: fix timeout param for eth_sendRawTransactionSync (#33693)
a179ccf6f core/state: add bounds check in heap eviction loop (#33712)
c974722dc crypto/ecies: fix ECIES invalid-curve handling (#33669)
9a6905318 core/txpool/legacypool: clarify and fix non-executable tx heartbeat (#33704)
628ff79be ethdb/pebble: disable seek compaction for Pebble (#33697)
7046e6324 trie: fix flaky test (#33711)
2513feddf crypto/kzg4844: preallocate proof slice in ComputeCellProofs (#33703)
424bc22ab eth/gasprice: reduce allocations (#33698)
1e9dfd5bb core: standardize slow block JSON output for cross-client metrics (#33655)
0a8fd6841 eth/tracers/native: add index to callTracer log (#33629)
3d0528492 trie/bintrie: fix tree key hashing to match spec (#33694)
344d01e2b core/rawdb: preallocate slice in iterateTransactions (#33690)
56be36f67 cmd/keeper: export getInput in wasm builds (#33686)
181a3ae9e triedb/pathdb: improve trienode reader for searching (#33681)
e25083697 trie: preallocate slice capacity (#33689)
c2595381b core: extend the code reader statistics (#33659)
9a8e14e77 core/txpool/legacypool: fix stale counter (#33653)
251b86310 core/vm: update EIP-8024 - Missing immediate byte is now treated as 0x00 (#33614)
1022c7637 core, eth, internal, triedb/pathdb: enable eth_getProofs for history (#32727)
35922bcd3 core/txpool/legacypool: reset gauges on clear (#33654)
8fad02ac6 core/types: fix panic on invalid signature length (#33647)
54ab4e3c7 core/txpool/legacypool: add metric for accounts in txpool  (#33646)
2eb1ccc6c core/state: ensure deterministic hook emission order in Finalise (#33644)
46d804776 accounts/scwallet: fix panic in decryptAPDU (#33606)
d58f6291a internal/debug: add integration with Grafana Pyroscope (#33623)
d0af257aa triedb/pathdb: double check the list availability before regeneration (#33622)
500931bc8 core/vm: add read only protection for opcodes (#33637)
ef815c59a rlp: improve SplitListValues allocation efficiency (#33554)
e78be59dc build: remove circleci config (#33616)
049535038 accounts/abi/bind/v2: replace rng in test (#33612)
3d78da917 rpc: add a rpc.rangelimit flag (#33163)
add1890a5 triedb/pathdb: enable trienode history (#32621)
588dd94aa triedb/pathdb: implement trienode history indexing scheme (#33551)
715bf8e81 core: invoke selfdestruct tracer hooks during finalisation (#32919)
b6fb79cdf core/vm: in selfdestruct gas calculation, return early if there isn't enough gas to cover cold account access costs (#33450)
23c349883 core/vm: check if read-only in gas handlers (#33281)
9ba13b609 eth/fetcher: refactor test code (#33610)
494908a85 triedb/pathdb: change the bitmap to big endian (#33584)
e3e556b26 rpc: extract OpenTelemetry trace context from request headers (#33599)
a9acb3ff9 rpc, internal/telemetry: add OpenTelemetry tracing for JSON-RPC calls (#33452)
94710f79a accounts/keystore: fix panic in decryptPreSaleKey (#33602)
3b17e7827 crypto/ecies: use aes blocksize
5b99d2bba core/txpool: drop peers on invalid KZG proofs
ea4935430 version: begin v1.17.0 release cycle
5a1990d1d rpc: fix limitedBuffer.Write to properly enforce size limit (#33545)
1278b4891 tests: repair oss-fuzz coverage command (#33304)
31d5d82ce internal/ethapi: refactor RPC tx formatter (#33582)
c890637af core/rawdb: skip missing block bodies during tx unindexing (#33573)
127d1f42b core: remove duplicate chainHeadFeed.Send code (#33563)
7cd400612 tests: check correct revert on invalid tests (#33543)
4eb5b66d9 ethclient: restore BlockReceipts support for `BlockNumberOrHash` objects (#33242)
b993cb6f3 core/txpool/blobpool: allow gaps in blobpool (#32717)
f51870e40 rlp, trie, triedb/pathdb: compress trienode history (#32913)
52f998d5e ethclient: omit nil address/topics from filter args (#33464)
d5efd3401 triedb/pathdb: introduce extension to history index structure (#33399)
a32851fac graphql: fix GasPrice for blob and setcode transactions (#33542)
64d22fd7f internal/flags: update copyright year to 2026 (#33550)
9623dcbca core/state: add cache statistics of contract code reader (#33532)
01b39c96b core/state, core/tracing: new state update hook (#33490)
957a3602d core/vm: avoid escape to heap (#33537)
710008450 eth: txs fetch/send log at trace level only (#33541)
eaaa5b716 core: re-organize the stats category (#33525)
a8a480489 ethstats: report newPayload processing time to stats server (#33395)
de5ea2ffd core/rawdb: add trienode freezer support to InspectFreezerTable (#33515)
b635e0632 eth/fetcher: improve the condition to stall peer in tx fetcher (#32725)
32fea008d core/blockchain.go: cleanup finalized block
```

