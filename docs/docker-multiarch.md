# Multi-arch container images

This project's [Dockerfile](../Dockerfile) and [Dockerfile.email-worker](../Dockerfile.email-worker)
are already **multi-arch compatible**:

- Both inherit from `node:22-alpine`, whose Docker Hub tag carries an
  amd64 **and** arm64 manifest.
- `npm ci` runs *inside* the build container, so native binaries
  (`sharp`, `ffmpeg-static`) resolve the correct platform binary at
  install time.
- No `RUN` step pulls a platform-specific binary by URL.

## Local dev (Apple Silicon, etc.)

Just run compose. Docker picks the right variant for your host:

```sh
docker compose up --build
```

On Apple Silicon this pulls `node:22-alpine` (arm64) and produces an
arm64 image. On Intel/AMD it produces amd64. Nothing else to configure.

## Distributing one image that works on both archs (CI / registry)

When you want a **single tag** that any host can pull and run (e.g.
amd64 production server + arm64 CI runner + arm64 dev laptop), use the
helper script:

```sh
./scripts/docker-multiarch.sh v1.2.3 ghcr.io/my-org/linksy
```

The script:

1. Creates a one-off `buildx` builder (`linksy-multiarch`) on first run.
2. Builds `linux/amd64` and `linux/arm64` in parallel.
3. Pushes a single multi-arch manifest to the registry.

For the email worker:

```sh
./scripts/docker-multiarch.sh v1.2.3 ghcr.io/my-org/linksy-email-worker \
  -f Dockerfile.email-worker
```

### Verify the manifest

```sh
docker buildx imagetools inspect ghcr.io/my-org/linksy:v1.2.3
```

Look for:

```
Manifests:
  …  Platform: linux/amd64
  …  Platform: linux/arm64
```

If only one platform appears, the build/push didn't include the other —
re-run the script with `docker buildx ls` to debug the builder state.

## Why not just trust `docker compose build`?

`docker compose build` produces a **single-arch** image tagged for
**your host**. If you push that to a registry and a different-arch
client pulls it, Docker emulates via QEMU — slow and unreliable for
runtime workloads. `buildx` produces a proper multi-arch manifest so
each client pulls its native variant directly.

## CI integration (future)

When CI lands ([`.github/workflows/`](../.github/workflows/) is empty
today), add a workflow that:

1. Logs in to the registry (`docker/login-action`).
2. Runs `docker/setup-buildx-action`.
3. Calls `docker/build-push-action` with `platforms: linux/amd64,linux/arm64`.

Skeleton:

```yaml
- uses: docker/setup-buildx-action@v3
- uses: docker/login-action@v3
  with:
    registry: ghcr.io
    username: ${{ github.actor }}
    password: ${{ secrets.GITHUB_TOKEN }}
- uses: docker/build-push-action@v6
  with:
    context: .
    platforms: linux/amd64,linux/arm64
    push: true
    tags: ghcr.io/${{ github.repository }}:${{ github.ref_name }}
```
