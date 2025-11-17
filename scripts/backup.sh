#!/bin/bash
# ============================================
# Le Syndicat des Tox - Backup Script
# ============================================
# Comprehensive backup solution with rotation
# Run as: sudo bash scripts/backup.sh [backup-directory]
#
# Features:
# - Database backup (mysqldump)
# - Redis backup (RDB snapshot)
# - Configuration backup (.env)
# - Application code backup
# - Automated rotation (30-day retention)
# - Compression and encryption support
# - Verification of backups

set -e  # Exit on error

# ============================================
# Configuration
# ============================================

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default backup settings
APP_DIR="/var/www/syndicat-tox"
DEFAULT_BACKUP_DIR="/var/backups/syndicat-tox"
BACKUP_RETENTION_DAYS=30
COMPRESS=true
ENCRYPT=false  # Set to true to enable GPG encryption

# Get backup directory from argument or use default
BACKUP_BASE_DIR="${1:-$DEFAULT_BACKUP_DIR}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$BACKUP_BASE_DIR/backup-$TIMESTAMP"

# ============================================
# Utility Functions
# ============================================

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

# ============================================
# Pre-Backup Checks
# ============================================

pre_backup_checks() {
    log "Starting pre-backup checks..."

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi

    # Check if .env file exists
    if [ ! -f "$APP_DIR/.env" ]; then
        log_error ".env file not found at $APP_DIR/.env"
        exit 1
    fi

    # Load environment variables
    set -a
    source "$APP_DIR/.env"
    set +a

    # Check required environment variables
    if [ -z "$DB_NAME" ] || [ -z "$DB_USER" ] || [ -z "$DB_PASSWORD" ]; then
        log_error "Database credentials not found in .env"
        exit 1
    fi

    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    chmod 700 "$BACKUP_DIR"

    # Check disk space (require at least 2GB free)
    DISK_FREE=$(df -BG "$BACKUP_BASE_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$DISK_FREE" -lt 2 ]; then
        log_error "Insufficient disk space. At least 2GB required, found ${DISK_FREE}GB"
        exit 1
    fi

    log_success "Pre-backup checks passed"
}

# ============================================
# Backup Database
# ============================================

backup_database() {
    log "Backing up database..."

    DB_BACKUP_FILE="$BACKUP_DIR/database.sql"

    # Create database backup with mysqldump
    if mysqldump \
        --user="$DB_USER" \
        --password="$DB_PASSWORD" \
        --host="${DB_HOST:-localhost}" \
        --port="${DB_PORT:-3306}" \
        --single-transaction \
        --routines \
        --triggers \
        --events \
        --add-drop-database \
        --databases "$DB_NAME" \
        > "$DB_BACKUP_FILE"; then

        log_success "Database backup created: $DB_BACKUP_FILE"

        # Get backup size
        DB_SIZE=$(du -h "$DB_BACKUP_FILE" | cut -f1)
        log "Database backup size: $DB_SIZE"

        # Verify backup is not empty
        if [ ! -s "$DB_BACKUP_FILE" ]; then
            log_error "Database backup is empty!"
            return 1
        fi

        # Compress if enabled
        if [ "$COMPRESS" = true ]; then
            log "Compressing database backup..."
            gzip -9 "$DB_BACKUP_FILE"
            DB_BACKUP_FILE="$DB_BACKUP_FILE.gz"
            log_success "Database backup compressed"
        fi

    else
        log_error "Database backup failed"
        return 1
    fi
}

# ============================================
# Backup Redis
# ============================================

backup_redis() {
    log "Backing up Redis data..."

    # Check if Redis is running
    if ! pgrep -x redis-server > /dev/null; then
        log_warning "Redis is not running, skipping Redis backup"
        return 0
    fi

    # Create Redis backup directory
    REDIS_BACKUP_DIR="$BACKUP_DIR/redis"
    mkdir -p "$REDIS_BACKUP_DIR"

    # Trigger Redis BGSAVE
    if [ -n "$REDIS_PASSWORD" ]; then
        redis-cli -a "$REDIS_PASSWORD" BGSAVE > /dev/null
    else
        redis-cli BGSAVE > /dev/null
    fi

    # Wait for BGSAVE to complete
    log "Waiting for Redis backup to complete..."
    sleep 2

    # Find Redis RDB file
    REDIS_RDB_PATH=$(redis-cli CONFIG GET dir | tail -n1)
    REDIS_RDB_FILE="$REDIS_RDB_PATH/dump.rdb"

    if [ -f "$REDIS_RDB_FILE" ]; then
        cp "$REDIS_RDB_FILE" "$REDIS_BACKUP_DIR/dump.rdb"
        log_success "Redis backup created"

        # Compress if enabled
        if [ "$COMPRESS" = true ]; then
            gzip -9 "$REDIS_BACKUP_DIR/dump.rdb"
            log_success "Redis backup compressed"
        fi
    else
        log_warning "Redis RDB file not found at $REDIS_RDB_FILE"
    fi
}

# ============================================
# Backup Configuration
# ============================================

backup_configuration() {
    log "Backing up configuration files..."

    CONFIG_BACKUP_DIR="$BACKUP_DIR/config"
    mkdir -p "$CONFIG_BACKUP_DIR"

    # Backup .env file
    if [ -f "$APP_DIR/.env" ]; then
        cp "$APP_DIR/.env" "$CONFIG_BACKUP_DIR/.env"
        chmod 600 "$CONFIG_BACKUP_DIR/.env"
        log_success "Backed up .env file"
    fi

    # Backup app config if exists
    if [ -f "$APP_DIR/config/app.config.js" ]; then
        cp "$APP_DIR/config/app.config.js" "$CONFIG_BACKUP_DIR/app.config.js"
        log_success "Backed up app.config.js"
    fi

    # Backup Nginx config
    if [ -f "/etc/nginx/sites-available/syndicat-tox.conf" ]; then
        cp "/etc/nginx/sites-available/syndicat-tox.conf" "$CONFIG_BACKUP_DIR/nginx.conf"
        log_success "Backed up Nginx config"
    fi

    # Backup PM2 ecosystem config
    if [ -f "$APP_DIR/ecosystem.config.js" ]; then
        cp "$APP_DIR/ecosystem.config.js" "$CONFIG_BACKUP_DIR/ecosystem.config.js"
        log_success "Backed up PM2 config"
    fi

    # Backup systemd service file
    if [ -f "/etc/systemd/system/syndicat-tox.service" ]; then
        cp "/etc/systemd/system/syndicat-tox.service" "$CONFIG_BACKUP_DIR/syndicat-tox.service"
        log_success "Backed up systemd service"
    fi

    log_success "Configuration backup completed"
}

# ============================================
# Backup Application Files
# ============================================

backup_application() {
    log "Backing up application files..."

    APP_BACKUP_DIR="$BACKUP_DIR/application"
    mkdir -p "$APP_BACKUP_DIR"

    # Backup package.json for dependency tracking
    if [ -f "$APP_DIR/package.json" ]; then
        cp "$APP_DIR/package.json" "$APP_BACKUP_DIR/package.json"
        cp "$APP_DIR/package-lock.json" "$APP_BACKUP_DIR/package-lock.json" 2>/dev/null || true
    fi

    # Backup custom user-uploaded content if any
    if [ -d "$APP_DIR/uploads" ]; then
        cp -r "$APP_DIR/uploads" "$APP_BACKUP_DIR/" || true
    fi

    # Create git info file if in git repo
    if [ -d "$APP_DIR/.git" ]; then
        cd "$APP_DIR"
        echo "Commit: $(git rev-parse HEAD)" > "$APP_BACKUP_DIR/git-info.txt"
        echo "Branch: $(git rev-parse --abbrev-ref HEAD)" >> "$APP_BACKUP_DIR/git-info.txt"
        echo "Date: $(git log -1 --format=%cd)" >> "$APP_BACKUP_DIR/git-info.txt"
        log_success "Saved git information"
    fi

    log_success "Application files backed up"
}

# ============================================
# Backup Logs
# ============================================

backup_logs() {
    log "Backing up logs..."

    LOGS_BACKUP_DIR="$BACKUP_DIR/logs"
    mkdir -p "$LOGS_BACKUP_DIR"

    # Backup application logs (last 7 days only to save space)
    if [ -d "$APP_DIR/logs" ]; then
        find "$APP_DIR/logs" -name "*.log" -mtime -7 -exec cp {} "$LOGS_BACKUP_DIR/" \;
        log_success "Application logs backed up"
    fi

    # Backup Nginx logs (last 7 days)
    if [ -d "/var/log/nginx" ]; then
        find /var/log/nginx -name "*syndicat*.log*" -mtime -7 -exec cp {} "$LOGS_BACKUP_DIR/" \; 2>/dev/null || true
        log_success "Nginx logs backed up"
    fi

    # Compress logs
    if [ "$COMPRESS" = true ] && [ -n "$(ls -A $LOGS_BACKUP_DIR)" ]; then
        tar -czf "$BACKUP_DIR/logs.tar.gz" -C "$LOGS_BACKUP_DIR" . && rm -rf "$LOGS_BACKUP_DIR"
        log_success "Logs compressed"
    fi
}

# ============================================
# Create Backup Manifest
# ============================================

create_manifest() {
    log "Creating backup manifest..."

    MANIFEST_FILE="$BACKUP_DIR/MANIFEST.txt"

    cat > "$MANIFEST_FILE" << EOF
============================================
Le Syndicat des Tox - Backup Manifest
============================================
Backup Date: $(date)
Backup Directory: $BACKUP_DIR
Server Hostname: $(hostname)
============================================

CONTENTS:
EOF

    # List all files with sizes
    find "$BACKUP_DIR" -type f -exec ls -lh {} \; | awk '{print $9, "-", $5}' >> "$MANIFEST_FILE"

    # Add checksums
    echo "" >> "$MANIFEST_FILE"
    echo "CHECKSUMS (SHA256):" >> "$MANIFEST_FILE"
    find "$BACKUP_DIR" -type f ! -name "MANIFEST.txt" -exec sha256sum {} \; >> "$MANIFEST_FILE"

    log_success "Manifest created"
}

# ============================================
# Encrypt Backup
# ============================================

encrypt_backup() {
    if [ "$ENCRYPT" != true ]; then
        return 0
    fi

    log "Encrypting backup..."

    # Check if GPG is installed
    if ! command -v gpg &> /dev/null; then
        log_warning "GPG not installed, skipping encryption"
        return 0
    fi

    # Create encrypted archive
    BACKUP_ARCHIVE="$BACKUP_BASE_DIR/backup-$TIMESTAMP.tar.gz.gpg"

    tar -czf - -C "$BACKUP_BASE_DIR" "backup-$TIMESTAMP" | \
        gpg --symmetric --cipher-algo AES256 --output "$BACKUP_ARCHIVE"

    if [ $? -eq 0 ]; then
        # Remove unencrypted backup
        rm -rf "$BACKUP_DIR"
        log_success "Backup encrypted: $BACKUP_ARCHIVE"
    else
        log_error "Encryption failed"
        return 1
    fi
}

# ============================================
# Rotate Old Backups
# ============================================

rotate_backups() {
    log "Rotating old backups..."

    # Remove backups older than retention period
    DELETED_COUNT=0

    if [ -d "$BACKUP_BASE_DIR" ]; then
        # Find and delete old backups
        while IFS= read -r -d '' backup; do
            rm -rf "$backup"
            ((DELETED_COUNT++))
        done < <(find "$BACKUP_BASE_DIR" -maxdepth 1 -type d -name "backup-*" -mtime +$BACKUP_RETENTION_DAYS -print0)

        # Delete old encrypted backups
        while IFS= read -r -d '' backup; do
            rm -f "$backup"
            ((DELETED_COUNT++))
        done < <(find "$BACKUP_BASE_DIR" -maxdepth 1 -type f -name "backup-*.tar.gz.gpg" -mtime +$BACKUP_RETENTION_DAYS -print0)

        if [ $DELETED_COUNT -gt 0 ]; then
            log_success "Removed $DELETED_COUNT old backup(s)"
        else
            log "No old backups to remove"
        fi
    fi
}

# ============================================
# Verify Backup
# ============================================

verify_backup() {
    log "Verifying backup integrity..."

    # Check if backup directory exists and is not empty
    if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR)" ]; then
        log_error "Backup directory is empty or missing"
        return 1
    fi

    # Verify database backup exists
    if [ ! -f "$BACKUP_DIR/database.sql" ] && [ ! -f "$BACKUP_DIR/database.sql.gz" ]; then
        log_error "Database backup missing"
        return 1
    fi

    # Verify manifest exists
    if [ ! -f "$BACKUP_DIR/MANIFEST.txt" ]; then
        log_warning "Manifest file missing"
    fi

    log_success "Backup verification passed"
}

# ============================================
# Main Backup Flow
# ============================================

main() {
    log "============================================"
    log "Le Syndicat des Tox - Backup Starting"
    log "============================================"
    log "Backup directory: $BACKUP_DIR"
    log "Retention period: $BACKUP_RETENTION_DAYS days"
    log "Compression: $COMPRESS"
    log "Encryption: $ENCRYPT"
    log ""

    # Execute backup steps
    pre_backup_checks
    backup_database
    backup_redis
    backup_configuration
    backup_application
    backup_logs
    create_manifest

    # Verify backup
    if ! verify_backup; then
        log_error "Backup verification failed!"
        exit 1
    fi

    # Encrypt if enabled
    encrypt_backup

    # Rotate old backups
    rotate_backups

    # Calculate total backup size
    if [ "$ENCRYPT" = true ]; then
        TOTAL_SIZE=$(du -h "$BACKUP_BASE_DIR/backup-$TIMESTAMP.tar.gz.gpg" 2>/dev/null | cut -f1 || echo "N/A")
    else
        TOTAL_SIZE=$(du -sh "$BACKUP_DIR" | cut -f1)
    fi

    log "============================================"
    log_success "Backup completed successfully!"
    log "============================================"
    log "Backup location: $BACKUP_DIR"
    log "Total size: $TOTAL_SIZE"
    log "Timestamp: $TIMESTAMP"
    log ""
    log "To restore this backup, use: scripts/restore.sh $BACKUP_DIR"
}

# ============================================
# Execute Main
# ============================================

main
