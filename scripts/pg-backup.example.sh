#!/usr/bin/env bash
# PostgreSQL nightly snapshot — encrypted, retention-managed, optionally offsite.
#
# Usage (cron, 03:00 UTC daily):
#   0 3 * * * \
#     DATABASE_URL='postgresql://...' \
#     BACKUP_DIR=/secure/backups \
#     RETAIN_DAYS=14 \
#     GPG_RECIPIENT=ops@example.com \
#     S3_BUCKET=linksy-prod-backups \
#     AWS_PROFILE=backup-writer \
#     /opt/linksy/scripts/pg-backup.example.sh >> /var/log/linksy-backup.log 2>&1
#
# Required env:
#   DATABASE_URL
#
# Optional env:
#   BACKUP_DIR       (default ./backups/pg)
#   RETAIN_DAYS      (default 14) — applies to both local files and S3 prefix
#   GPG_RECIPIENT    — enables GPG asymmetric encryption (recommended)
#   BACKUP_PASSPHRASE — enables AES-256-CBC symmetric fallback if GPG not set
#   S3_BUCKET        — enables `aws s3 cp` to s3://${S3_BUCKET}/pg/...
#   S3_PREFIX        (default pg)
#   AWS_PROFILE      — passed through to aws cli
#   PG_DUMP_JOBS     (default 2) — parallel workers for --format=directory
#
# Exit codes:
#   0 success
#   1 missing required env
#   2 pg_dump failed
#   3 encryption failed
#   4 upload failed

set -euo pipefail

log() { printf '[pg-backup] %s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
fail() { log "ERROR: $*" >&2; exit "${2:-1}"; }

if [[ -z "${DATABASE_URL:-}" ]]; then
  fail "DATABASE_URL is required" 1
fi

BACKUP_DIR="${BACKUP_DIR:-./backups/pg}"
RETAIN_DAYS="${RETAIN_DAYS:-14}"
S3_PREFIX="${S3_PREFIX:-pg}"
PG_DUMP_JOBS="${PG_DUMP_JOBS:-2}"

mkdir -p "$BACKUP_DIR"

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DUMP_FILE="$BACKUP_DIR/linksy_${STAMP}.dump"
CHECKSUM_FILE="${DUMP_FILE}.sha256"

# 1. Dump (custom format — supports parallel restore later via pg_restore -j).
log "Dumping to ${DUMP_FILE}"
if ! pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --jobs="$PG_DUMP_JOBS" \
  --no-owner \
  --no-privileges \
  --file="$DUMP_FILE" 2>/tmp/pg-backup.err; then
  cat /tmp/pg-backup.err >&2
  fail "pg_dump failed" 2
fi

# 2. Integrity checksum — verified before restore.
sha256sum "$DUMP_FILE" > "$CHECKSUM_FILE"
log "Wrote checksum $(cat "$CHECKSUM_FILE")"

# 3. Encrypt. Prefer GPG asymmetric (key material stays off the backup host);
#    fall back to symmetric AES-256 if BACKUP_PASSPHRASE is set.
UPLOAD_FILE="$DUMP_FILE"
if [[ -n "${GPG_RECIPIENT:-}" ]]; then
  ENC_FILE="${DUMP_FILE}.gpg"
  log "Encrypting with GPG recipient ${GPG_RECIPIENT}"
  if ! gpg --batch --yes --trust-model always \
    --recipient "$GPG_RECIPIENT" \
    --output "$ENC_FILE" \
    --encrypt "$DUMP_FILE"; then
    fail "gpg encrypt failed" 3
  fi
  shred -uf "$DUMP_FILE" 2>/dev/null || rm -f "$DUMP_FILE"
  UPLOAD_FILE="$ENC_FILE"
elif [[ -n "${BACKUP_PASSPHRASE:-}" ]]; then
  ENC_FILE="${DUMP_FILE}.enc"
  log "Encrypting with OpenSSL AES-256-CBC (passphrase)"
  if ! openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 \
    -in "$DUMP_FILE" \
    -out "$ENC_FILE" \
    -pass env:BACKUP_PASSPHRASE; then
    fail "openssl encrypt failed" 3
  fi
  shred -uf "$DUMP_FILE" 2>/dev/null || rm -f "$DUMP_FILE"
  UPLOAD_FILE="$ENC_FILE"
else
  log "WARNING: backup is unencrypted (set GPG_RECIPIENT or BACKUP_PASSPHRASE for prod)"
fi

# 4. Offsite copy.
if [[ -n "${S3_BUCKET:-}" ]]; then
  log "Uploading to s3://${S3_BUCKET}/${S3_PREFIX}/"
  if ! aws s3 cp "$UPLOAD_FILE" "s3://${S3_BUCKET}/${S3_PREFIX}/" --only-show-errors; then
    fail "s3 cp failed" 4
  fi
  if ! aws s3 cp "$CHECKSUM_FILE" "s3://${S3_BUCKET}/${S3_PREFIX}/" --only-show-errors; then
    fail "s3 cp checksum failed" 4
  fi

  # Remote retention via S3 lifecycle policy is preferred; this is a fallback
  # for buckets without one. Walk listing and delete older than RETAIN_DAYS.
  if [[ "${ENFORCE_S3_RETENTION:-false}" == "true" ]]; then
    cutoff="$(date -u -d "-${RETAIN_DAYS} days" +%Y-%m-%d 2>/dev/null || \
              date -u -v "-${RETAIN_DAYS}d" +%Y-%m-%d)"
    log "Enforcing S3 retention cutoff ${cutoff}"
    aws s3 ls "s3://${S3_BUCKET}/${S3_PREFIX}/" | \
      awk -v c="$cutoff" '$1 < c && $4 ~ /linksy_/ { print $4 }' | \
      while read -r old; do
        log "Deleting s3://${S3_BUCKET}/${S3_PREFIX}/${old}"
        aws s3 rm "s3://${S3_BUCKET}/${S3_PREFIX}/${old}" --only-show-errors
      done
  fi
fi

# 5. Local retention.
log "Pruning local backups older than ${RETAIN_DAYS} days"
find "$BACKUP_DIR" \
  \( -name 'linksy_*.dump' -o -name 'linksy_*.dump.gpg' -o -name 'linksy_*.dump.enc' -o -name 'linksy_*.dump.sha256' \) \
  -type f -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true

log "Backup complete: ${UPLOAD_FILE}"

# Health-check ping — set to your Healthchecks.io / Better Uptime ping URL
# so a missing backup alerts the on-call rotation.
if [[ -n "${BACKUP_HEALTHCHECK_URL:-}" ]]; then
  curl -fsS -m 10 --retry 3 "$BACKUP_HEALTHCHECK_URL" >/dev/null || \
    log "WARNING: healthcheck ping failed"
fi
