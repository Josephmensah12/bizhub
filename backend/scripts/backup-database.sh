#!/usr/bin/env bash
#
# BizHub PostgreSQL Backup Script
# Dumps the database to a compressed .sql.gz file and rotates old backups.
#
# Usage: bash backend/scripts/backup-database.sh
#

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="$BACKEND_DIR/backups"
ENV_FILE="$BACKEND_DIR/.env"
RETENTION_DAYS=30

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# Load DATABASE_URL from .env
if [[ ! -f "$ENV_FILE" ]]; then
  log "ERROR: .env file not found at $ENV_FILE"
  exit 1
fi

DATABASE_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d'=' -f2-)
# Strip surrounding quotes if present
DATABASE_URL="${DATABASE_URL%\"}"
DATABASE_URL="${DATABASE_URL#\"}"
DATABASE_URL="${DATABASE_URL%\'}"
DATABASE_URL="${DATABASE_URL#\'}"

if [[ -z "$DATABASE_URL" ]]; then
  log "ERROR: DATABASE_URL not found in $ENV_FILE"
  exit 1
fi

# Create backups directory if needed
mkdir -p "$BACKUP_DIR"

# Generate filename with timestamp
TIMESTAMP=$(date '+%Y-%m-%d_%H%M%S')
BACKUP_FILE="$BACKUP_DIR/bizhub_${TIMESTAMP}.sql.gz"

# Run pg_dump
log "Starting database backup..."
if pg_dump "$DATABASE_URL" | gzip > "$BACKUP_FILE"; then
  SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
  log "Backup complete: $BACKUP_FILE ($SIZE)"
else
  log "ERROR: pg_dump failed"
  rm -f "$BACKUP_FILE"
  exit 1
fi

# Rotate old backups (delete files older than RETENTION_DAYS)
DELETED=0
find "$BACKUP_DIR" -name "bizhub_*.sql.gz" -type f -mtime +$RETENTION_DAYS | while read -r old_file; do
  rm -f "$old_file"
  log "Deleted old backup: $old_file"
  DELETED=$((DELETED + 1))
done

log "Backup rotation complete. Removed files older than $RETENTION_DAYS days."
log "Done."
