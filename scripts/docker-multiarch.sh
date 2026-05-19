#!/usr/bin/env bash
# Build + push multi-arch container images (linux/amd64 + linux/arm64).
#
# When you `docker compose build` locally, Docker already pulls the right
# variant of `node:22-alpine` for your host arch (Apple Silicon → arm64,
# Intel/AMD → amd64). This script is for the registry case: pushing one
# tag that any host can pull and run.
#
# Usage:
#   ./scripts/docker-multiarch.sh <tag> [<image-name>]
#
# Examples:
#   ./scripts/docker-multiarch.sh v1.2.3
#   ./scripts/docker-multiarch.sh v1.2.3 ghcr.io/my-org/linksy
#   ./scripts/docker-multiarch.sh latest ghcr.io/my-org/linksy-email-worker -f Dockerfile.email-worker
#
# Requires:
#   - docker buildx (Docker Desktop 19.03+ ships with it)
#   - `docker login <registry>` already run
#
# Behaviour:
#   - Creates a one-off builder (linksy-multiarch) if it doesn't exist
#   - Builds linux/amd64 + linux/arm64 in parallel
#   - Pushes a single multi-arch manifest to the registry

set -euo pipefail

TAG="${1:-}"
IMAGE="${2:-linksy}"
DOCKERFILE="Dockerfile"

# Allow `-f Dockerfile.email-worker` etc.
shift || true
shift || true
while [ $# -gt 0 ]; do
  case "$1" in
    -f|--file) DOCKERFILE="$2"; shift 2 ;;
    *) echo "Unknown arg: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag> [<image-name>] [-f <dockerfile>]" >&2
  echo "Example: $0 v1.2.3 ghcr.io/my-org/linksy" >&2
  exit 2
fi

BUILDER="linksy-multiarch"
if ! docker buildx inspect "$BUILDER" >/dev/null 2>&1; then
  echo "→ Creating buildx builder: $BUILDER"
  docker buildx create --name "$BUILDER" --use --bootstrap
else
  docker buildx use "$BUILDER"
fi

echo "→ Building $IMAGE:$TAG for linux/amd64 + linux/arm64 from $DOCKERFILE"
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  --file "$DOCKERFILE" \
  --tag "$IMAGE:$TAG" \
  --push \
  .

echo ""
echo "✓ Pushed $IMAGE:$TAG (multi-arch manifest: linux/amd64, linux/arm64)"
echo "  Verify with:  docker buildx imagetools inspect $IMAGE:$TAG"
