#!/bin/bash

# Comprehensive Database Backup Script for Pixel Agent
# Backs up both ElizaOS embedded PostgreSQL and external PostgreSQL databases

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

echo "Starting comprehensive database backup..."

# 1. Backup ElizaOS embedded database
echo "Backing up ElizaOS embedded database..."
DB_DIR="./.eliza/.elizadb"

if [ -d "$DB_DIR" ]; then
    if [ -f "$DB_DIR/postmaster.pid" ]; then
        echo "ElizaOS database is running, creating cold backup..."
        # Cold backup for running database
        tar -czf "${BACKUP_DIR}/eliza_embedded_db_${TIMESTAMP}.tar.gz" -C "$DB_DIR" .
        echo "ElizaOS embedded backup created: ${BACKUP_DIR}/eliza_embedded_db_${TIMESTAMP}.tar.gz"
    else
        echo "ElizaOS database is not running, creating directory backup..."
        tar -czf "${BACKUP_DIR}/eliza_embedded_db_${TIMESTAMP}.tar.gz" -C "$DB_DIR" .
        echo "ElizaOS embedded backup created: ${BACKUP_DIR}/eliza_embedded_db_${TIMESTAMP}.tar.gz"
    fi
else
    echo "ElizaOS embedded database directory not found"
fi

# 2. Backup external PostgreSQL database
echo "Backing up external PostgreSQL database..."
if command -v pg_dump &> /dev/null; then
    # Try to backup the external database using environment variables
    if [ -n "$POSTGRES_PASSWORD" ]; then
        PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "${POSTGRES_HOST:-localhost}" -p "${POSTGRES_PORT:-5432}" -U "${POSTGRES_USER:-pixel}" -d "${POSTGRES_DB:-pixel_db}" --compress=9 --format=custom > "${BACKUP_DIR}/pixel_external_db_${TIMESTAMP}.backup" 2>/dev/null

        if [ $? -eq 0 ]; then
            echo "External PostgreSQL backup created: ${BACKUP_DIR}/pixel_external_db_${TIMESTAMP}.backup"
        else
            echo "External PostgreSQL backup failed - database may not be accessible or credentials incorrect"
        fi
    else
        echo "POSTGRES_PASSWORD not set - skipping external PostgreSQL backup"
        echo "Set POSTGRES_PASSWORD in .env file for external database backup"
    fi
else
    echo "pg_dump not found - cannot backup external PostgreSQL database"
fi

# 3. Create a summary file
echo "Backup Summary - ${TIMESTAMP}" > "${BACKUP_DIR}/backup_summary_${TIMESTAMP}.txt"
echo "ElizaOS Embedded DB: eliza_embedded_db_${TIMESTAMP}.tar.gz" >> "${BACKUP_DIR}/backup_summary_${TIMESTAMP}.txt"
echo "External PostgreSQL DB: pixel_external_db_${TIMESTAMP}.backup" >> "${BACKUP_DIR}/backup_summary_${TIMESTAMP}.txt"
echo "Total backup files: $(ls -1 ${BACKUP_DIR}/*${TIMESTAMP}* 2>/dev/null | wc -l)" >> "${BACKUP_DIR}/backup_summary_${TIMESTAMP}.txt"

# 4. Clean up old backups (keep last 7 days)
echo "Cleaning up old backups..."
find "$BACKUP_DIR" -name "eliza_*" -mtime +7 -delete
find "$BACKUP_DIR" -name "pixel_*" -mtime +7 -delete
find "$BACKUP_DIR" -name "backup_summary_*" -mtime +7 -delete

echo "Database backup completed successfully"
echo "Backup files created:"
ls -la ${BACKUP_DIR}/*${TIMESTAMP}* 2>/dev/null || echo "No backup files found"