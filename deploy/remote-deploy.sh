#!/usr/bin/env bash
# Executed on the server over SSH by the GitHub Actions deploy job.
# Expects IMAGE_TAG and APP_DIR in the environment.
set -euo pipefail

cd "$APP_DIR"
trap 'docker logout ghcr.io >/dev/null 2>&1 || true' EXIT

if [ ! -f .env ]; then
  echo "Missing $APP_DIR/.env. Create it with the application secrets before deploying." >&2
  exit 1
fi

export IMAGE_TAG
echo "Deploying ghcr.io/pmqmark/tgsco_backend:$IMAGE_TAG"

docker compose pull
if ! docker compose up -d --remove-orphans --wait --wait-timeout 120; then
  echo "Container did not become healthy. Recent logs:" >&2
  docker compose logs --tail 100 >&2
  exit 1
fi

# Remove only this app's superseded images; other projects' images are untouched.
docker image prune -af --filter "label=com.qmarkdesk.app=tgsco-backend" >/dev/null

docker compose ps
