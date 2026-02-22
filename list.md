아래는 최신 타깃 목록입니다.

```csv
Protocol,Official Website,Official GitHub Repository,Recommended Docker Image,Note
Aelf,aelf.com,AElfProject/AElf,aelf/node,설정 파일 마운트 필수
Aptos,aptoslabs.com,aptos-labs/aptos-core,aptoslabs/validator,Validator/Fullnode 공용 이미지
Arbitrum,arbitrum.io,OffchainLabs/nitro,offchainlabs/nitro-node,L1 이더리움 노드 연결 필수
Avalanche,avax.network,ava-labs/avalanchego,avaplatform/avalanchego,3개 체인(X
Babylon,babylonchain.io,babylonlabs-io/babylon,babylonlabs/babylond,비트코인 스테이킹 프로토콜
Base,base.org,base/node,ghcr.io/base-org/node,OP Stack 기반
Bitcoin,bitcoin.org,bitcoin/bitcoin,(없음) ruimarinho/bitcoin-core 추천,보안상 공식 이미지 미제공
Bitcoin Cash,bitcoincashnode.org,bitcoin-cash-node/bitcoin-cash-node,zquestz/bitcoin-cash-node,BCHN 구현체 사용 권장
BNB Chain,bnbchain.org,bnb-chain/bsc,ghcr.io/bnb-chain/bsc,Docker Hub에서 GHCR로 이전 추세
Canton,canton.network,digital-asset/canton,digitalasset/canton-open-source,엔터프라이즈 프라이버시 중심
Chiliz,chiliz.com,chiliz-chain/v2,chilizchain/ccv2-geth,스포츠 팬 토큰 특화
Core DAO,coredao.org,coredao-org/core-chain,ghcr.io/coredao-org/core-chain,Satoshi Plus 합의
Dogecoin,dogecoin.com,dogecoin/dogecoin,(없음) gxgow/dogenode 추천,커뮤니티 이미지 의존
dYdX,dydx.exchange,dydxprotocol/v4-chain,dydxprotocol/node,Cosmos SDK 기반 앱체인
Ethereum(Geth-EL),ethereum.org,ethereum/go-ethereum,ethereum/client-go,실행 레이어 표준 클라이언트
Ethereum(Reth-EL),ethereum.org,paradigmxyz/reth,ghcr.io/paradigmxyz/reth,Rust 기반 차세대 실행 레이어
Ethereum(Lighthouse-CL),ethereum.org,sigp/lighthouse,sigp/lighthouse,안정적인 합의 레이어 클라이언트
ETC,ethereumclassic.org,etclabscore/core-geth,etclabscore/core-geth,Core-Geth 사용
Filecoin,filecoin.io,filecoin-project/lotus,glif/lotus (커뮤니티 표준),공식 빌드는 복잡함
Flow(Access),onflow.org,onflow/flow-go,gcr.io/flow-container-registry/access,Access 노드 이미지
Flow(Consensus),onflow.org,onflow/flow-go,gcr.io/flow-container-registry/consensus,Consensus 노드 이미지
Flow(Execution),onflow.org,onflow/flow-go,gcr.io/flow-container-registry/execution,Execution 노드 이미지
Giwa,giwa.io,giwa-io/node,(Repo 내 Dockerfile 빌드),OP Stack 기반
Initia,initia.xyz,initia-labs/initia,ghcr.io/initia-labs/initiad,Interwoven Rollups
Injective,injective.com,InjectiveLabs/injective-chain-releases,injectivelabs/injective-core,DeFi 특화 Cosmos 체인
IOTA,iota.org,iotaledger/hornet,iotaledger/hornet,경량화된 Go 구현체
Kaia (Klaytn),kaia.io,kaiachain/kaia,kaiachain/kaia,Klaytn + Finschia 통합
Linea,linea.build,Consensys/linea-monorepo,consensys/linea-besu,zkEVM
Manta,manta.network,Manta-Network/Manta,mantanetwork/manta,Polkadot 파라체인
Merlin,merlinchain.io,MerlinLayer2/cdk-erigon,merlinadmin/cdk-erigon,Polygon CDK 기반 BTC L2
Metal,metalblockchain.org,MetalBlockchain/metalgo,metalblockchain/metalgo,Avalanche 포크
Neo,neo.org,neo-project/neo,cityofzion/neo-python (커뮤니티),공식 CLI 이미지 부재
Optimism,optimism.io,ethereum-optimism/optimism,us-docker.pkg.dev/oplabs-tools-artifacts/images/op-node,Google Artifact Registry 사용
Pocket,pokt.network,pokt-network/pocket-core,poktnetwork/pocket-core,탈중앙화 RPC 인프라
Polygon(Bor-EL),polygon.technology,0xPolygon/bor,0xpolygon/bor,Polygon 실행 레이어
Polygon(Erigon-EL),polygon.technology,erigontech/erigon,0xpolygon/erigon,Erigon 기반 Polygon RPC 운영
Polygon(Heimdall-CL),polygon.technology,0xPolygon/heimdall,(소스 빌드 권장),Polygon 합의 레이어
Solana(Agave),solana.com,anza-xyz/agave,anzaxyz/agave,메인넷 주력 클라이언트(이미지 유지보수 축소 추세)
Solana(Jito),solana.com,jito-foundation/jito-solana,(소스 빌드 권장),Jito 공식 가이드는 소스 빌드 중심
Sonic,soniclabs.com,0xsoniclabs/Sonic,(소스 빌드 권장),고성능 EVM
Stratis,stratisplatform.com,stratisproject/go-stratis,(소스 빌드 권장),EVM 전환 중
Sui,sui.io,MystenLabs/sui,mysten/sui-node,객체 중심 데이터 모델
Tezos,tezos.com,tezos/tezos,tezos/tezos,Octez 구현체
ThunderCore,thundercore.com,thundercore/public-full,thundercore/thunder,EVM 호환 고성능 체인
TRON,tron.network,tronprotocol/java-tron,tronprotocol/java-tron,Java 기반 구현체
VeChain,vechain.org,vechain/thor,vechain/thor,PoA 합의
World Chain,worldcoin.org,worldcoin/world-chain,(OP Stack 이미지 활용),World ID 통합
XDC,xinfin.org,XinFinOrg/XinFin-Node,xinfinorg/xdposchain,기업형 하이브리드 체인
XRP,xrpl.org,XRPLF/rippled,rippleci/rippled,리플 레저 데몬
ZetaChain,zetachain.com,zeta-chain/node,ghcr.io/zeta-chain/zetacored,옴니체인 상호운용성
Zilliqa,zilliqa.com,Zilliqa/zq1,zilliqa/zilliqa,샤딩 기술 도입
Zircuit,zircuit.com,zircuit-labs/zkr-monorepo-public,(소스 빌드 권장),AI 보안 ZK 롤업
```
