# Group calls — SFU integration plan

The 1:1 call flow ([lib/webrtc/call-client.ts](../lib/webrtc/call-client.ts)) uses
direct peer-to-peer WebRTC. That topology does not scale beyond 2 participants
— above ~3 peers the mesh fan-out wastes bandwidth and CPU on the client. To
support group calls the project needs an **SFU** (Selective Forwarding Unit)
that each client uploads to once and downloads from once.

This document is the migration plan, not the implementation. The supporting
schema is already in place (`Call.isGroup`, `Call.sfuRoomId`,
`CallParticipant`); the rest is integration work.

## Recommended stack

**LiveKit** ([livekit.io](https://livekit.io)) — open source, has hosted Cloud,
a TypeScript client SDK, recording add-on, and a permissive license. The
client SDK (`livekit-client`) covers track publication, simulcast, adaptive
bitrate, and room state. The Node SDK (`livekit-server-sdk`) handles JWT
generation for room access and room lifecycle webhooks.

Alternative: mediasoup — lower-level, more control, but more glue code.

## Backend changes

1. **Env vars**
   - `LIVEKIT_API_KEY`
   - `LIVEKIT_API_SECRET`
   - `LIVEKIT_WS_URL` (e.g. `wss://yourproject.livekit.cloud`)

2. **New endpoint** `POST /api/calls/[id]/sfu-token`
   - Verifies caller is a member of the call's conversation
   - On first call to a group: creates a LiveKit room (server SDK), stores
     `sfuRoomId` on the `Call` row
   - Mints a short-lived (5 min) participant access JWT and returns it
   - Inserts/updates a `CallParticipant` row

3. **Webhook** `POST /api/livekit/webhook`
   - Listens for `participant_joined` / `participant_left` events
   - Marks `CallParticipant.leftAt` so call history shows accurate join/leave
   - Marks the parent `Call.status = ENDED` when the last participant leaves

4. **POST `/api/calls`** — when called with `isGroup: true` (or for any
   conversation with more than 2 members), set `isGroup = true`. The existing
   1:1 P2P path should remain available so direct chats keep working without
   round-tripping the SFU.

5. **Call lifecycle PATCH route** — accept new participant join/leave logic;
   the existing `accept`/`end` actions still apply but the "ended" definition
   is "0 remaining participants" rather than "two parties hung up".

## Client changes

1. **New `GroupCallClient`** ([lib/webrtc/group-call-client.ts](../lib/webrtc/group-call-client.ts)
   — to be created) backed by `livekit-client`. Same hook contract as
   `CallClient` (`onLocalStream`, `onRemoteStream`, `onStateChange`) so the
   existing `CallSurface` can reuse most of its UI.

2. **CallSurface** — branch on `call.isGroup`:
   - 1:1: keep current `CallClient`
   - Group: use `GroupCallClient` + a tiled grid for N remote streams (cap to
     screen-fitting, others go to "others" overlay)

3. **Recording** — LiveKit's Egress API records server-side and stores to S3 /
   GCS. The existing client-side `MediaRecorder` flow (introduced for 1:1
   calls) does **not** apply to group calls; use Egress instead and persist
   the resulting URL on the same `Call.recordingUrl` field.

## Migration steps (incremental, no big-bang)

1. Land the schema (already done in `20260514130000_call_sfu_scaffold`).
2. Install `livekit-server-sdk` and `livekit-client` dependencies.
3. Implement `POST /api/calls/[id]/sfu-token`.
4. Implement `GroupCallClient` (client SDK wrapper).
5. Add CallSurface group-grid rendering.
6. Implement Egress recording wiring.
7. Feature-flag rollout (env: `GROUP_CALLS_ENABLED`).

## Capacity / cost notes

LiveKit Cloud bills on participant-minutes + bandwidth. For internal testing
the OSS server (`livekit-server` Docker image + `redis`) is sufficient and
runs on a single VM. Plan for STUN/TURN — LiveKit bundles a TURN server but
custom deployments need a publicly routable port (UDP 7881).
