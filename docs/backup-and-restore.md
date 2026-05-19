# Database backup & restore

This project ships two shell scripts and a Kubernetes CronJob template for
PostgreSQL backups. They cover the **daily logical snapshot** layer. For
**point-in-time recovery (PITR)** you also need WAL archiving — covered at
the bottom of this document.

## Layers of defence

| Layer            | Recovery point | Recovery time | How                                            |
| ---------------- | -------------- | ------------- | ---------------------------------------------- |
| Nightly snapshot | up to 24h ago  | 5–30 min      | `pg_dump --format=custom` → encrypted, offsite |
| WAL archiving    | < 5 min ago    | 30–60 min     | `archive_command` → object storage             |
| Read replica     | seconds ago    | seconds       | streaming replication                          |

A small project should run **at least** the nightly snapshot. Anything that
touches money or user-generated content should add WAL archiving too. Read
replicas are an HA play, not a backup — replication doesn't protect against
"`DELETE FROM users` ran in prod".

## Nightly snapshot — `scripts/pg-backup.example.sh`

The script:

1. `pg_dump --format=custom --compress=9 --jobs=N` to a local file.
2. Writes a `.sha256` companion for integrity.
3. **Encrypts** — preferring GPG asymmetric (key material stays off the
   backup host) with an AES-256-CBC PBKDF2 fallback.
4. Uploads to S3 (`aws s3 cp`) — offsite.
5. Prunes local files older than `RETAIN_DAYS`.
6. Optional: pings a Healthchecks.io URL so a missed run alerts on-call.

### Local cron

```cron
# /etc/cron.d/linksy-pg-backup
0 3 * * * appuser \
  DATABASE_URL='postgresql://backup_ro:...@db:5432/linksy?sslmode=require' \
  BACKUP_DIR=/var/lib/linksy/backups \
  RETAIN_DAYS=14 \
  GPG_RECIPIENT=ops@linksy.example.com \
  S3_BUCKET=linksy-prod-backups \
  AWS_PROFILE=backup-writer \
  BACKUP_HEALTHCHECK_URL='https://hc-ping.com/UUID' \
  /opt/linksy/scripts/pg-backup.example.sh >> /var/log/linksy-backup.log 2>&1
```

The DB role used for backups should be **read-only** (`pg_read_all_data`
membership is enough). Don't reuse the application role.

### Kubernetes CronJob

See `deploy/k8s/base/cronjob-pg-backup.yaml` for a template. Mount the
backup script + AWS / GPG credentials, and point at the in-cluster Postgres
Service.

## Restore — `scripts/pg-restore.example.sh`

```bash
DATABASE_URL='postgresql://...@new-db:5432/linksy' \
BACKUP_PASSPHRASE='...' \
./scripts/pg-restore.example.sh /tmp/linksy_20260101T030000Z.dump.enc
```

The script verifies the checksum, decrypts, then runs
`pg_restore --clean --if-exists --jobs=N`. **It will drop existing tables**
in the target DB — never run it against prod.

## Restore drill — once a quarter

Untested backups don't exist. Run this drill quarterly and record the result:

```bash
# 1. Provision a scratch DB
createdb linksy_restore_test

# 2. Restore the latest production snapshot into it
aws s3 cp \
  "s3://linksy-prod-backups/pg/$(aws s3 ls s3://linksy-prod-backups/pg/ | tail -1 | awk '{print $4}')" \
  /tmp/latest.dump.gpg
DATABASE_URL='postgresql://localhost/linksy_restore_test' \
  ./scripts/pg-restore.example.sh /tmp/latest.dump.gpg

# 3. Sanity-check
psql linksy_restore_test -c 'SELECT count(*) FROM "User";'
psql linksy_restore_test -c 'SELECT count(*) FROM "Post";'

# 4. Tear down
dropdb linksy_restore_test
```

Track: dump size, restore wall-clock, row counts vs. prod. If any number
drifts unexpectedly, investigate before the next outage forces it on you.

## PITR (point-in-time recovery)

To recover to a specific second rather than "last night's snapshot":

1. **Enable WAL archiving** in `postgresql.conf`:
   ```conf
   archive_mode = on
   archive_command = 'aws s3 cp %p s3://linksy-prod-wal/%f --only-show-errors'
   wal_level = replica
   ```
2. Take a `pg_basebackup` weekly into the same bucket.
3. To restore at time `T`:
   ```bash
   pg_basebackup -D /var/lib/postgresql/data -h backup-host -X stream
   # then in recovery.conf / postgresql.auto.conf:
   restore_command = 'aws s3 cp s3://linksy-prod-wal/%f %p'
   recovery_target_time = '2026-04-15 14:23:00 UTC'
   ```

Managed Postgres (AWS RDS, Cloud SQL, Supabase, Neon) generally exposes
PITR as a one-click feature — prefer that over rolling your own.

## Encryption keys

- The GPG public key is committed to ops repo / vault under `keys/backup.pub`.
- The matching **private** key lives only on the restore-operator's hardware
  token (YubiKey) and in a sealed envelope in the safe. It must never sit
  on the backup host.
- Rotate the keypair annually. Old backups remain decryptable with the
  matching old private key — keep the previous key for `RETAIN_DAYS + 1`.

## Compliance hooks

- Bucket should have **versioning** + **object lock** in compliance mode for
  the retention window — prevents an attacker with prod credentials from
  deleting the backups they just exfiltrated.
- Bucket should be in a **separate AWS account** from the application, with
  a write-only IAM role for the backup host. Restores require a different,
  manually-assumed role.
- All access to the backup bucket goes through CloudTrail with object-level
  logging on.
