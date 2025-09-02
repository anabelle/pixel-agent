#!/bin/bash

# ElizaOS PostgreSQL Database Backup Script
# Backs up the embedded PostgreSQL database used by ElizaOS

# Database configuration
DB_DIR="./.eliza/.elizadb"
BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${BACKUP_DIR}/eliza_db_backup_${TIMESTAMP}.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Check if database is running
if [ -f "$DB_DIR/postmaster.pid" ]; then
    echo "Database is running, creating hot backup..."

    # For running PostgreSQL, use pg_dump
    # First, we need to find the port the database is running on
    PORT=$(grep -oP '(?<=port = )\d+' "$DB_DIR/postgresql.conf" 2>/dev/null || echo "5432")

    # Create backup using pg_dump
    pg_dump -h localhost -p "$PORT" -U pixel -d pixel_db --no-password --compress=9 --format=custom > "${BACKUP_DIR}/eliza_db_backup_${TIMESTAMP}.backup"

    if [ $? -eq 0 ]; then
        echo "Hot backup created: ${BACKUP_DIR}/eliza_db_backup_${TIMESTAMP}.backup"
    else
        echo "Hot backup failed, trying cold backup..."

        # Fallback to cold backup by copying the database directory
        cp -r "$DB_DIR" "${BACKUP_DIR}/eliza_db_cold_backup_${TIMESTAMP}"
        echo "Cold backup created: ${BACKUP_DIR}/eliza_db_cold_backup_${TIMESTAMP}"
    fi
else
    echo "Database is not running, creating cold backup..."

    # Cold backup - just copy the database directory
    cp -r "$DB_DIR" "${BACKUP_DIR}/eliza_db_cold_backup_${TIMESTAMP}"
    echo "Cold backup created: ${BACKUP_DIR}/eliza_db_cold_backup_${TIMESTAMP}"
fi

# Compress the backup if it's a directory
if [ -d "${BACKUP_DIR}/eliza_db_cold_backup_${TIMESTAMP}" ]; then
    tar -czf "${BACKUP_DIR}/eliza_db_cold_backup_${TIMESTAMP}.tar.gz" -C "$BACKUP_DIR" "eliza_db_cold_backup_${TIMESTAMP}"
    rm -rf "${BACKUP_DIR}/eliza_db_cold_backup_${TIMESTAMP}"
    echo "Backup compressed: ${BACKUP_DIR}/eliza_db_cold_backup_${TIMESTAMP}.tar.gz"
fi

# Clean up old backups (keep last 7 days)
find "$BACKUP_DIR" -name "eliza_db_*" -mtime +7 -delete

echo "ElizaOS database backup completed"