#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if ! command -v docker >/dev/null 2>&1; then
  echo "需要已安装 Docker。" >&2
  exit 1
fi

if docker compose version >/dev/null 2>&1; then
  compose=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  compose=(docker-compose)
else
  echo "需要 Docker Compose（docker compose 或 docker-compose）。" >&2
  exit 1
fi

"${compose[@]}" up --build -d

echo "等待 API 健康检查 /api/health ..."
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    echo
    echo "演示环境已启动（SQLite 种子含 DEMO-PASS / SOFT / BLOCK / GATE / FOB，无需制裁 API Key）"
    echo "  H5 界面:     http://127.0.0.1:8080"
    echo "  API 健康:    http://127.0.0.1:3000/api/health"
    echo "  同源 /api:   http://127.0.0.1:8080/api/health"
    echo
    echo "停止:          docker compose down"
    echo "清库并重种:    docker compose down -v && docker compose up -d"
    exit 0
  fi
  sleep 2
done

echo "启动超时，最近日志：" >&2
"${compose[@]}" logs --tail=80
exit 1
