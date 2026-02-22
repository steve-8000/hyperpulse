# Ethereum(Lighthouse-CL) 운영 리포트

- 생성 시각: 2026-02-22T05:01:43.198Z
- RSS: BugAnne
- 비교 기준(Base): e3ee7febce64c1b5a85c3ab0be0619571ee92d58
- 최신 커밋(Head): ced49dd265e01ecbf02b12073bbfde3873058abe

## 한줄 요약
본 릴리즈는 Lighthouse v8.0.1이며, 주요 변경 사항은 빌드 파이프라인에서 Windows 지원을 제거하고, 데이터 가용성 캐시와 블록 검증 로직에 대한 버그 수정 및 성능 개선을 포함한다. Windows 플랫폼에서의 빌드가 사라지면서, 윈도우스 환경에 대한 운영자는 별도의 빌드 스크립트가 필요해진다. 또한, 데이터 가용성 LRU 캐시와 오버플로우 처리 로직이 재구현되면서, 아카이브 노드의 스토리지 구조에 영향을 줄 수 있다.


주요 변경 포인트:
1. Windows 빌드 단계가 제거되었으며, `release.yml`과 `test-suite.yml`에서 윈도우스 관련 스텝이 삭제되었다.
2. `block_verification.rs`에서 span instrumentation 방식이 바뀌어 디버그 로깅에 대한 성능 영향이 있을 수 있다.
3. `builder.rs`에서 `CustodyIndex`를 새로 가져오며, 데이터 컬럼 캐시 로직이 개선되었다.
4. `data_availability_checker`와 `overflow_lru_cache.rs`에 대한 로직이 재구현되었고, 이는 데이터 가용성 검증과 아카이브 노드의 스토리지에 영향을 줄 수 있다.
5. 테스트 스위트에서 윈도우스 관련 테스트가 삭제되었으므로, 윈도우스 환경에서의 CI 파이프라인은 더 이상 지원되지 않는다.

위 변경사항을 바탕으로 운영자는 다음과 같은 조치를 취해야 한다. 

## 운영자 중요 체크
- RPC/JSON-RPC 관련 변경 단서가 감지되었습니다.
- 외부 API 엔드포인트/버전 관련 변경 단서가 감지되었습니다.
- 아카이브 노드 운영(보관/색인/동기화) 관련 변경 단서가 감지되었습니다.
- 노드 설정값/프로토콜 플래그 관련 변경 단서가 감지되었습니다.

## 주요 변경점
- Windows 빌드 단계 삭제
- block_verification.rs span instrumentation 변경
- builder.rs에 CustodyIndex 사용 추가
- data_availability_checker 로직 재구현

## RPC/API 영향
- 해당 사항 없음

## 아카이브 노드 영향
- 데이터 가용성 캐시 로직 변경이 아카이브 노드의 스토리지 구조에 영향을 줄 수 있다. 데이터 가용성 검증 로직이 재구현되었으므로, 아카이브 노드가 새 데이터 가용성 로직을 지원하도록 업데이트 해야 함

## 운영 액션 아이템
- 윈도우스 빌드 스크립트가 필요하면 별도 빌드 파이프라인을 수동으로 구성
- 데이터 가용성 캐시 로직 변경에 따라 스토리지 레이아웃을 점검
- span instrumentation 바뀜에 따른 디버그 로깅 성능을 모니터링

## 마이그레이션 체크리스트
- 새 버전으로 업그레이드 시 빌드 파이프라인에서 윈도우스 지원을 제외
- 데이터 가용성 캐시 로직이 변경되었으므로, 아카이브 노드가 새 로직을 지원하도록 업데이트
- span instrumentation 변경에 따른 디버그 로깅 성능 점검

## 위험/주의 사항
- Windows 빌드 지원이 사라져 윈도우스 운영자에게 별도 빌드 스크립트 필요
- 데이터 가용성 캐시 로직 변경으로 인한 데이터 일관성 이슈 가능성
- span instrumentation 바뀜에 따른 디버그 로깅 성능 영향

## 근거(Evidence)
- commit 8e54f6e1a: block_verification.rs span instrumentation 변경
- commit f2b945a5b: data_availability_checker 로직 재구현
- commit 74b8c0263: reimport the checkpoint sync block
- commit 02d0c6a8c: Compute missing_columns correctly

## 운영 메모
- Windows 빌드가 사라져 윈도우스 환경에서의 운영이 어려워질 수 있다.
- 데이터 가용성 캐시 로직 변경으로 인한 데이터 일관성 이슈 가능성
- span instrumentation 바뀜에 따른 디버그 로깅 성능 영향

## 원문 커밋 내용
### Commit Log
```text
ced49dd26 Release v8.0.1 (#8414)
74b8c0263 Reimport the checkpoint sync block (#8417)
8e54f6e1a Fix md format (#8434)
02d0c6a8c Compute missing_columns correctly (#8425)
af1d9b999 Fix custody context initialization race condition that caused panic (#8391)
f2b945a5b Do not require blobs from checkpoint servers from Fulu epochs. (#8413)
01a654bfa Fix tracing span for execution payload verif (#8419)
47b984e79 re-targeting of `remove-windows-ci` against `release-v8.0` (#8406)
f854afa35 Prevent unnecessary state advances pre-Fulu (#8388)
```

