#!/usr/bin/env bash
# Restore companion to pg-backup.example.sh.
#
# Usage:
#   DATABASE_URL='postgresql://...' \
#   ./pg-restore.example.sh path/to/linksy_YYYYMMDDTHHMMSSZ.dump[.gpg|.enc]
#
# Required env:
#   DATABASE_URL — target database (will be REPLACED — do not point at prod)
#
# Optional env:
#   BACKUP_PASSPHRASE — required for .enc files
#   GPG_PRIVATE_KEY   — path / ID of the GPG private key for .gpg files
#   PG_RESTORE_JOBS   (default 2)

set -euo pipefail

log() { printf '[pg-restore] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit "${2:-1}"; }

if [[ -z "${DATABASE_URL:-}" ]]; then fail "DATABASE_URL is required" 1; fi
INPUT="${1:-}"
if [[ -z "$INPUT" || ! -f "$INPUT" ]]; then fail "Usage: $0 <dump-file>" 1; fi

JOBS="${PG_RESTORE_JOBS:-2}"

# 1. Verify checksum if present.
if [[ -f "${INPUT}.sha256" ]]; then
  log "Verifying checksum"
  sha256sum -c "${INPUT}.sha256"
fi

# 2. Decrypt if needed.
PLAINTEXT="$INPUT"
case "$INPUT" in
  *.gpg)
    PLAINTEXT="${INPUT%.gpg}"
    log "Decrypting GPG → ${PLAINTEXT}"
    gpg --batch --yes --output "$PLAINTEXT" --decrypt "$INPUT"
    ;;
  *.enc)
    [[ -z "${BACKUP_PASSPHRASE:-}" ]] && fail "BACKUP_PASSPHRASE required for .enc" 1
    PLAINTEXT="${INPUT%.enc}"
    log "Decrypting AES-256 → ${PLAINTEXT}"
    openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
      -in "$INPUT" -out "$PLAINTEXT" -pass env:BACKUP_PASSPHRASE
    ;;
esac

# 3. Confirm before destroying the target DB.
TARGET_HOST="$(echo "$DATABASE_URL" | sed -E 's#.*@([^/:?]+).*#\1#')"
log "About to restore into host=${TARGET_HOST}"
log "Press Ctrl-C within 5s to cancel..."
sleep 5

# 4. pg_restore. --clean drops existing objects before recreating; --if-exists
#    avoids errors on a fresh DB.
log "Restoring (jobs=${JOBS})"
pg_restore \
  --dbname="$DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --jobs="$JOBS" \
  --verbose \
  "$PLAINTEXT"

log "Restore complete."
