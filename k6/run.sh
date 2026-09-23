#!/usr/bin/env bash
# k6 를 Docker 로 돌리고 결과를 results/ 에 남긴다.
#
#   k6/run.sh M4              정원은 현재 값 그대로
#   k6/run.sh M4 5000         정원을 5000 으로 바꾸고 측정
#   k6/run.sh M4 5000 10000 1000   정원·총요청·VU 지정
#
# 컨테이너에서 호스트의 신청 서버(4100)로 나가야 하므로 host.docker.internal 을 쓴다.
set -euo pipefail

MODE="${1:-M1}"
CAPACITY="${2:-0}"
TOTAL="${3:-10000}"
VUS="${4:-1000}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$ROOT/results"

echo "▶ k6  mode=$MODE total=$TOTAL vus=$VUS capacity=${CAPACITY:-현재값}"

OUT=$(docker run --rm -i \
  --add-host=host.docker.internal:host-gateway \
  -e BASE_URL=http://host.docker.internal:4100 \
  -e MODE="$MODE" -e TOTAL="$TOTAL" -e VUS="$VUS" -e CAPACITY="$CAPACITY" \
  grafana/k6 run --quiet - < "$ROOT/k6/enroll.js")

echo "$OUT" | grep -v '^K6_JSON '

JSON=$(echo "$OUT" | grep '^K6_JSON ' | cut -d' ' -f2-)

# 정합성은 k6 가 모른다. 서버에 직접 물어본다.
STATS=$(curl -s "http://localhost:4100/admin/stats?courseId=1")

FILE="$ROOT/results/k6-${MODE}-cap${CAPACITY}-c${VUS}-$(date +%s).json"
python3 -c "
import json, sys
k6 = json.loads(sys.argv[1]); stats = json.loads(sys.argv[2])
k6['capacity'] = stats['capacity']
k6['enrolledRows'] = stats['enrolledRows']
k6['over'] = stats['over']
k6['duplicateStudents'] = stats['duplicateStudents']
if stats.get('redis'): k6['redis'] = stats['redis']
json.dump(k6, open(sys.argv[3], 'w'), ensure_ascii=False, indent=2)
print(f\"  정원 {stats['capacity']}  등록 {stats['enrolledRows']}  초과 {stats['over']}  중복 {stats['duplicateStudents']}\")
" "$JSON" "$STATS" "$FILE"

echo "  저장 ${FILE#"$ROOT/"}"
