#!/bin/bash
# ============================================
# Le Syndicat des Tox - Restore Script
# ============================================
# Restore from backup created by backup.sh
# Run as: sudo bash scripts/restore.sh /path/to/backup-directory
#
# Features:
# - Restore database from mysqldump
# - Restore Redis data
# - Restore configuration files
# - Verification of restored data
# - Safety checks and confirmations

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

# Default settings
APP_DIR="/var/www/syndicat-tox"

# Get backup directory from argument
if [ -z "$1" ]; then
    echo -e "${RED}Error: Backup directory not specified${NC}"
    echo "Usage: sudo bash scripts/restore.sh /path/to/backup-directory"
    exit 1
fi

BACKUP_DIR="$1"

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

confirm() {
    read -p "$1 (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Restore cancelled by user"
        exit 1
    fi
}

# ============================================
# Pre-Restore Checks
# ============================================

pre_restore_checks() {
    log "Starting pre-restore checks..."

    # Check if running as root
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi

    # Check if backup directory exists
    if [ ! -d "$BACKUP_DIR" ]; then
        log_error "Backup directory not found: $BACKUP_DIR"
        exit 1
    fi

    # Check if manifest exists
    if [ -f "$BACKUP_DIR/MANIFEST.txt" ]; then
        log "Backup manifest found"
        log "Backup contents:"
        head -20 "$BACKUP_DIR/MANIFEST.txt"
    else
        log_warning "Manifest file not found"
    fi

    # Check if .env file exists
    if [ ! -f "$APP_DIR/.env" ]; then
        log_error ".env file not found at $APP_DIR/.env"
        log_error "Please ensure the application is installed first"
        exit 1
    fi

    # Load environment variables
    set -a
    source "$APP_DIR/.env"
    set +a

    # Confirm restore operation
    echo ""
    echo -e "${RED}============================================${NC}"
    echo -e "${RED}WARNING: This will overwrite current data!${NC}"
    echo -e "${RED}============================================${NC}"
    echo ""
    confirm "Are you sure you want to restore from $BACKUP_DIR?"

    log_success "Pre-restore checks passed"
}

# ============================================
# Create Pre-Restore Backup
# ============================================

create_pre_restore_backup() {
    log "Creating pre-restore backup of current state..."

    PRE_RESTORE_BACKUP="/var/backups/syndicat-tox/pre-restore-$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$PRE_RESTORE_BACKUP"

    # Quick backup of current database
    if command -v mysqldump &> /dev/null; then
        mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$PRE_RESTORE_BACKUP/database.sql" 2>/dev/null || true
        log_success "Current database backed up to $PRE_RESTORE_BACKUP"
    fi

    # Backup current .env
    cp "$APP_DIR/.env" "$PRE_RESTORE_BACKUP/.env" 2>/dev/null || true

    echo "$PRE_RESTORE_BACKUP" > /tmp/syndicat-pre-restore-backup.txt
}

# ============================================
# Stop Services
# ============================================

stop_services() {
    log "Stopping services..."

    # Stop Docker containers if running
    if docker ps --format '{{.Names}}' | grep -q "syndicat-app"; then
        docker-compose -f docker-compose.prod.yml down
        log_success "Docker containers stopped"
    fi

    # Stop PM2 if running
    if command -v pm2 &> /dev/null && pm2 describe syndicat-tox &> /dev/null; then
        sudo -u syndicat pm2 stop syndicat-tox
        log_success "PM2 process stopped"
    fi

    # Stop systemd service if running
    if systemctl is-active --quiet syndicat-tox; then
        systemctl stop syndicat-tox
        log_success "Systemd service stopped"
    fi
}

# ============================================
# Restore Database
# ============================================

restore_database() {
    log "Restoring database..."

    # Find database backup file
    DB_BACKUP_FILE=""
    if [ -f "$BACKUP_DIR/database.sql.gz" ]; then
        DB_BACKUP_FILE="$BACKUP_DIR/database.sql.gz"
        log "Found compressed database backup"
    elif [ -f "$BACKUP_DIR/database.sql" ]; then
        DB_BACKUP_FILE="$BACKUP_DIR/database.sql"
        log "Found database backup"
    else
        log_error "Database backup not found in $BACKUP_DIR"
        return 1
    fi

    # Drop and recreate database
    log "Dropping and recreating database..."
    mysql -u "$DB_USER" -p"$DB_PASSWORD" -e "DROP DATABASE IF EXISTS $DB_NAME;"
    mysql -u "$DB_USER" -p"$DB_PASSWORD" -e "CREATE DATABASE $DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"

    # Restore database
    if [[ "$DB_BACKUP_FILE" == *.gz ]]; then
        gunzip -c "$DB_BACKUP_FILE" | mysql -u "$DB_USER" -p"$DB_PASSWORD"
    else
        mysql -u "$DB_USER" -p"$DB_PASSWORD" < "$DB_BACKUP_FILE"
    fi

    log_success "Database restored successfully"

    # Verify restoration
    TABLE_COUNT=$(mysql -u "$DB_USER" -p"$DB_PASSWORD" -N -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE table_schema='$DB_NAME';")
    log "Restored $TABLE_COUNT tables"
}

# ============================================
# Restore Redis
# ============================================

restore_redis() {
    log "Restoring Redis data..."

    # Find Redis backup
    REDIS_BACKUP_FILE=""
    if [ -f "$BACKUP_DIR/redis/dump.rdb.gz" ]; then
        REDIS_BACKUP_FILE="$BACKUP_DIR/redis/dump.rdb.gz"
    elif [ -f "$BACKUP_DIR/redis/dump.rdb" ]; then
        REDIS_BACKUP_FILE="$BACKUP_DIR/redis/dump.rdb"
    else
        log_warning "Redis backup not found, skipping..."
        return 0
    fi

    # Stop Redis
    systemctl stop redis-server || true

    # Get Redis data directory
    REDIS_DATA_DIR=$(redis-cli CONFIG GET dir 2>/dev/null | tail -n1 || echo "/var/lib/redis")

    # Restore Redis dump
    if [[ "$REDIS_BACKUP_FILE" == *.gz ]]; then
        gunzip -c "$REDIS_BACKUP_FILE" > "$REDIS_DATA_DIR/dump.rdb"
    else
        cp "$REDIS_BACKUP_FILE" "$REDIS_DATA_DIR/dump.rdb"
    fi

    chown redis:redis "$REDIS_DATA_DIR/dump.rdb"

    # Start Redis
    systemctl start redis-server

    log_success "Redis data restored"
}

# ============================================
# Restore Configuration
# ============================================

restore_configuration() {
    log "Restoring configuration files..."

    CONFIG_BACKUP_DIR="$BACKUP_DIR/config"

    if [ ! -d "$CONFIG_BACKUP_DIR" ]; then
        log_warning "Configuration backup not found, skipping..."
        return 0
    fi

    # Ask before overwriting .env
    if [ -f "$CONFIG_BACKUP_DIR/.env" ]; then
        confirm "Restore .env file? This will overwrite your current environment configuration."
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "$CONFIG_BACKUP_DIR/.env" "$APP_DIR/.env"
            chmod 600 "$APP_DIR/.env"
            chown syndicat:syndicat "$APP_DIR/.env"
            log_success "Restored .env file"
        fi
    fi

    # Restore app config
    if [ -f "$CONFIG_BACKUP_DIR/app.config.js" ]; then
        cp "$CONFIG_BACKUP_DIR/app.config.js" "$APP_DIR/config/app.config.js"
        log_success "Restored app.config.js"
    fi

    # Restore Nginx config
    if [ -f "$CONFIG_BACKUP_DIR/nginx.conf" ]; then
        confirm "Restore Nginx configuration?"
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            cp "$CONFIG_BACKUP_DIR/nginx.conf" "/etc/nginx/sites-available/syndicat-tox.conf"
            nginx -t && systemctl reload nginx
            log_success "Restored Nginx config"
        fi
    fi
}

# ============================================
# Restore Application Files
# ============================================

restore_application() {
    log "Restoring application files..."

    APP_BACKUP_DIR="$BACKUP_DIR/application"

    if [ ! -d "$APP_BACKUP_DIR" ]; then
        log_warning "Application backup not found, skipping..."
        return 0
    fi

    # Restore uploads if any
    if [ -d "$APP_BACKUP_DIR/uploads" ]; then
        cp -r "$APP_BACKUP_DIR/uploads" "$APP_DIR/"
        chown -R syndicat:syndicat "$APP_DIR/uploads"
        log_success "Restored user uploads"
    fi

    # Show git info if available
    if [ -f "$APP_BACKUP_DIR/git-info.txt" ]; then
        log "Backup was created from:"
        cat "$APP_BACKUP_DIR/git-info.txt"
    fi
}

# ============================================
# Start Services
# ============================================

start_services() {
    log "Starting services..."

    # Start with Docker if docker-compose file exists
    if [ -f "docker-compose.prod.yml" ]; then
        docker-compose -f docker-compose.prod.yml up -d
        log_success "Docker containers started"
    # Start with PM2 if configured
    elif command -v pm2 &> /dev/null && [ -f "$APP_DIR/ecosystem.config.js" ]; then
        cd "$APP_DIR"
        sudo -u syndicat pm2 restart syndicat-tox || sudo -u syndicat pm2 start ecosystem.config.js --env production
        log_success "PM2 process started"
    # Start with systemd
    elif systemctl list-unit-files | grep -q syndicat-tox.service; then
        systemctl start syndicat-tox
        log_success "Systemd service started"
    else
        log_warning "No process manager found, please start the application manually"
    fi

    # Wait for application to start
    log "Waiting for application to start..."
    sleep 10
}

# ============================================
# Verify Restoration
# ============================================

verify_restoration() {
    log "Verifying restoration..."

    # Test database connection
    if mysql -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1 FROM users LIMIT 1;" "$DB_NAME" &> /dev/null; then
        log_success "Database is accessible"
    else
        log_error "Database verification failed"
        return 1
    fi

    # Test Redis connection
    if redis-cli -a "$REDIS_PASSWORD" ping &> /dev/null; then
        log_success "Redis is accessible"
    else
        log_warning "Redis verification failed"
    fi

    # Test application health endpoint
    if curl -f -s http://localhost:3000/health > /dev/null; then
        log_success "Application is responding"
    else
        log_error "Application health check failed"
        return 1
    fi

    log_success "Restoration verified successfully"
}

# ============================================
# Main Restore Flow
# ============================================

main() {
    log "============================================"
    log "Le Syndicat des Tox - Restore Starting"
    log "============================================"
    log "Backup directory: $BACKUP_DIR"
    log ""

    # Execute restore steps
    pre_restore_checks
    create_pre_restore_backup
    stop_services
    restore_database
    restore_redis
    restore_configuration
    restore_application
    start_services

    # Verify restoration
    if ! verify_restoration; then
        log_error "Restoration verification failed!"
        log_error "You can rollback using the pre-restore backup at:"
        cat /tmp/syndicat-pre-restore-backup.txt 2>/dev/null || echo "N/A"
        exit 1
    fi

    log "============================================"
    log_success "Restoration completed successfully!"
    log "============================================"
    log ""
    log "Backup restored from: $BACKUP_DIR"
    log "Pre-restore backup saved at: $(cat /tmp/syndicat-pre-restore-backup.txt 2>/dev/null || echo 'N/A')"
    log ""
    log "Next steps:"
    log "1. Verify application: curl http://localhost:3000/health"
    log "2. Check logs: tail -f $APP_DIR/logs/app.log"
    log "3. Test functionality thoroughly"
    log ""
}

# ============================================
# Execute Main
# ============================================

main
