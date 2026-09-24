# 발표 슬라이드

15분 발표용 18장. 발행본은 Artifact 에 있고 **이 폴더는 그 원본**이다.

- 발행본: <https://claude.ai/artifact/87HcTzvPirZxPChibNpgUX> (비공개 — 공유 전에는 소유자만 열린다)
- 이 폴더의 파일을 고친 뒤 아래 방법으로 다시 발행한다

## 순서

`deck.json` 의 `order` 가 정본이다. 파일명이 곧 슬라이드 id 다.

| # | 파일 | 무엇 |
|---|---|---|
| 1 | `cover.html` | 표지 |
| 2 | `problem.html` | 정합성과 처리량은 다른 문제다 |
| 3 | `demo-1.html` | **[LIVE]** 순진하게 짜면 정원이 깨진다 |
| 4 | `broken.html` | 정원 50 에 339명 — 중앙값과 범위 |
| 5 | `why.html` | 읽기와 쓰기 사이가 열려 있다 (TOCTOU) |
| 6 | `concurrency.html` | 요청 수가 아니라 동시성이 원인이다 |
| 7 | `isolation.html` | "격리 수준을 올리면 되지 않나" |
| 8 | `fixes.html` | 고치는 방법 네 가지 |
| 9 | `numbers.html` | 자리다툼이 긴 조건에서의 수치 |
| 10 | `m3.html` | 낙관적 락이 뒤집히는 자리 |
| 11 | `pool.html` | "느리니까 풀을 키우자"가 틀리는 경우 |
| 12 | `choice.html` | 그래서 무엇을 고르나 |
| 13 | `m5.html` | Redis — 그리고 그 약점을 먼저 |
| 14 | `demo-2.html` | **[LIVE]** 대기열이 지키는 것은 DB 다 |
| 15 | `queue.html` | 유입 속도를 조이면 생기는 일 |
| 16 | `trust.html` | 이 수치를 믿어도 되나 (k6 대조) |
| 17 | `limits.html` | 이 구조의 한계 |
| 18 | `qa.html` | 받을 만한 질문 |

`demo-1` 과 `demo-2` 는 화면 전환용 슬라이드다. **여기서 실제 데모를 돌린다** —
각 장의 `<aside>`(발표자 노트)에 어느 주소에서 무엇을 누를지 적어 뒀다.

## 고치고 다시 발행하기

각 파일은 `<section>` 하나이고 모든 스타일이 인라인이다. 쓸 수 있는 CSS 는 정해진 부분집합이라
`margin`·`z-index`·`var()` 같은 것은 들어가지 않는다. 캔버스는 1920×1080, 안쪽 여백 128px 이다.

Claude Code 에서 다시 발행할 때는 이 폴더를 Artifact 가 요구하는 경로로 옮겨 보낸다 —
`deck.json` 은 `project/deck.json`, 각 슬라이드는 `project/slides/<id>.html` 이다.
슬라이드만 고쳤으면 `deck.json` 은 보내지 않는다. 제목·순서·섹션·글꼴을 바꿀 때만 함께 보낸다.

## 수치의 출처

슬라이드의 모든 숫자는 `../results/` 의 측정 결과에서 왔다. 조건과 읽는 법은
[../results/MEASUREMENT.md](../results/MEASUREMENT.md) 에 있다.
**측정하지 않은 값은 넣지 않는다** — 고칠 때도 같다.
