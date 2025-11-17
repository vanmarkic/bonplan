#!/bin/bash
# ============================================
# Le Syndicat des Tox - Health Check Script
# ============================================
# Comprehensive system health monitoring
# Run as: bash scripts/health-check.sh [--quiet] [--alert]
#
# Features:
# - Check all services (nginx, app, database, redis)
# - Monitor disk space and memory usage
# - Verify application endpoints
# - Log health status
# - Alert on failures (optional)
# - Suitable for cron monitoring

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

# Settings
APP_DIR="/var/www/syndicat-tox"
HEALTH_LOG="/var/log/syndicat-tox-health.log"
QUIET=false
ALERT=false
EXIT_CODE=0

# Thresholds
DISK_WARNING_THRESHOLD=80  # Warn at 80% disk usage
DISK_CRITICAL_THRESHOLD=90 # Critical at 90% disk usage
MEMORY_WARNING_THRESHOLD=80
MEMORY_CRITICAL_THRESHOLD=90
CPU_WARNING_THRESHOLD=80

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quiet|-q)
            QUIET=true
            shift
            ;;
        --alert|-a)
            ALERT=true
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--quiet] [--alert]"
            exit 1
            ;;
    esac
done

# ============================================
# Utility Functions
# ============================================

log() {
    if [ "$QUIET" = false ]; then
        echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1"
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$HEALTH_LOG"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" >&2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1" >> "$HEALTH_LOG"
    EXIT_CODE=1
}

log_success() {
    if [ "$QUIET" = false ]; then
        echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1${NC}"
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] OK: $1" >> "$HEALTH_LOG"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" >&2
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1" >> "$HEALTH_LOG"
}

send_alert() {
    if [ "$ALERT" = true ]; then
        # Send alert via system logger
        logger -t syndicat-tox-health -p user.err "HEALTH CHECK FAILED: $1"

        # You can add email alerts here if configured
        # echo "$1" | mail -s "Syndicat Tox Health Alert" admin@example.com
    fi
}

# ============================================
# Check Nginx
# ============================================

check_nginx() {
    log "Checking Nginx..."

    if systemctl is-active --quiet nginx; then
        log_success "Nginx is running"

        # Test Nginx configuration
        if nginx -t &> /dev/null; then
            log_success "Nginx configuration is valid"
        else
            log_error "Nginx configuration has errors"
            send_alert "Nginx configuration is invalid"
        fi

        # Check if Nginx is listening on port 80/443
        if netstat -tuln | grep -q ":80 "; then
            log_success "Nginx listening on port 80"
        else
            log_warning "Nginx not listening on port 80"
        fi

        if netstat -tuln | grep -q ":443 "; then
            log_success "Nginx listening on port 443"
        else
            log_warning "Nginx not listening on port 443 (SSL may not be configured)"
        fi
    else
        log_error "Nginx is not running"
        send_alert "Nginx service is down"
    fi
}

# ============================================
# Check Application
# ============================================

check_application() {
    log "Checking application..."

    # Check if running with Docker Compose
    if docker ps --format '{{.Names}}' | grep -q "syndicat-app"; then
        log_success "Application container is running"

        # Check container health
        CONTAINER_HEALTH=$(docker inspect --format='{{.State.Health.Status}}' syndicat-app 2>/dev/null || echo "unknown")
        if [ "$CONTAINER_HEALTH" = "healthy" ]; then
            log_success "Application container is healthy"
        elif [ "$CONTAINER_HEALTH" = "starting" ]; then
            log_warning "Application container is starting"
        else
            log_error "Application container is unhealthy (status: $CONTAINER_HEALTH)"
            send_alert "Application container is unhealthy"
        fi
    # Check if running with PM2
    elif command -v pm2 &> /dev/null; then
        if pm2 describe syndicat-tox &> /dev/null; then
            PM2_STATUS=$(pm2 jlist | jq -r '.[] | select(.name=="syndicat-tox") | .pm2_env.status' 2>/dev/null || echo "unknown")

            if [ "$PM2_STATUS" = "online" ]; then
                log_success "Application (PM2) is running"
            else
                log_error "Application (PM2) status: $PM2_STATUS"
                send_alert "Application PM2 process is not online"
            fi
        else
            log_error "Application not found in PM2"
            send_alert "Application PM2 process not found"
        fi
    # Check if running with systemd
    elif systemctl is-active --quiet syndicat-tox; then
        log_success "Application (systemd) is running"
    else
        log_error "Application is not running"
        send_alert "Application service is down"
    fi

    # Test HTTP endpoint
    if curl -f -s -o /dev/null -w "%{http_code}" http://localhost:3000/health | grep -q "200"; then
        log_success "Application health endpoint responding"
    else
        log_error "Application health endpoint not responding"
        send_alert "Application health endpoint is not responding"
    fi

    # Check application response time
    RESPONSE_TIME=$(curl -o /dev/null -s -w '%{time_total}' http://localhost:3000/health 2>/dev/null || echo "999")
    RESPONSE_TIME_MS=$(echo "$RESPONSE_TIME * 1000" | bc | cut -d'.' -f1)

    if [ "$RESPONSE_TIME_MS" -lt 1000 ]; then
        log_success "Application response time: ${RESPONSE_TIME_MS}ms"
    elif [ "$RESPONSE_TIME_MS" -lt 3000 ]; then
        log_warning "Application response time slow: ${RESPONSE_TIME_MS}ms"
    else
        log_error "Application response time very slow: ${RESPONSE_TIME_MS}ms"
    fi
}

# ============================================
# Check Database
# ============================================

check_database() {
    log "Checking database..."

    # Load environment variables
    if [ -f "$APP_DIR/.env" ]; then
        set -a
        source "$APP_DIR/.env"
        set +a
    else
        log_error ".env file not found"
        return 1
    fi

    # Check MariaDB service
    if systemctl is-active --quiet mariadb || systemctl is-active --quiet mysql; then
        log_success "MariaDB service is running"
    elif docker ps --format '{{.Names}}' | grep -q "syndicat-db"; then
        log_success "MariaDB container is running"
    else
        log_error "MariaDB is not running"
        send_alert "MariaDB service is down"
        return 1
    fi

    # Test database connection
    DB_HOST="${DB_HOST:-localhost}"
    DB_PORT="${DB_PORT:-3306}"

    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -e "SELECT 1" &> /dev/null; then
        log_success "Database connection successful"
    else
        log_error "Database connection failed"
        send_alert "Cannot connect to database"
        return 1
    fi

    # Check database size
    DB_SIZE=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -N -e \
        "SELECT ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) FROM information_schema.TABLES WHERE table_schema='$DB_NAME';" 2>/dev/null || echo "0")
    log_success "Database size: ${DB_SIZE}MB"

    # Check for long-running queries
    LONG_QUERIES=$(mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" -N -e \
        "SELECT COUNT(*) FROM information_schema.PROCESSLIST WHERE command != 'Sleep' AND time > 10;" 2>/dev/null || echo "0")

    if [ "$LONG_QUERIES" -gt 0 ]; then
        log_warning "Found $LONG_QUERIES long-running queries (>10s)"
    fi
}

# ============================================
# Check Redis
# ============================================

check_redis() {
    log "Checking Redis..."

    # Load environment variables
    if [ -f "$APP_DIR/.env" ]; then
        set -a
        source "$APP_DIR/.env"
        set +a
    fi

    # Check Redis service
    if systemctl is-active --quiet redis-server || systemctl is-active --quiet redis; then
        log_success "Redis service is running"
    elif docker ps --format '{{.Names}}' | grep -q "syndicat-redis"; then
        log_success "Redis container is running"
    else
        log_error "Redis is not running"
        send_alert "Redis service is down"
        return 1
    fi

    # Test Redis connection
    REDIS_HOST="${REDIS_HOST:-localhost}"
    REDIS_PORT="${REDIS_PORT:-6379}"

    if [ -n "$REDIS_PASSWORD" ]; then
        REDIS_PING=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" ping 2>/dev/null || echo "FAIL")
    else
        REDIS_PING=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" ping 2>/dev/null || echo "FAIL")
    fi

    if [ "$REDIS_PING" = "PONG" ]; then
        log_success "Redis connection successful"
    else
        log_error "Redis connection failed"
        send_alert "Cannot connect to Redis"
        return 1
    fi

    # Check Redis memory usage
    if [ -n "$REDIS_PASSWORD" ]; then
        REDIS_MEMORY=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO memory 2>/dev/null | grep "used_memory_human" | cut -d':' -f2 | tr -d '\r' || echo "N/A")
    else
        REDIS_MEMORY=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO memory 2>/dev/null | grep "used_memory_human" | cut -d':' -f2 | tr -d '\r' || echo "N/A")
    fi
    log_success "Redis memory usage: $REDIS_MEMORY"

    # Check connected clients
    if [ -n "$REDIS_PASSWORD" ]; then
        REDIS_CLIENTS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "$REDIS_PASSWORD" INFO clients 2>/dev/null | grep "connected_clients" | cut -d':' -f2 | tr -d '\r' || echo "N/A")
    else
        REDIS_CLIENTS=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" INFO clients 2>/dev/null | grep "connected_clients" | cut -d':' -f2 | tr -d '\r' || echo "N/A")
    fi
    log_success "Redis connected clients: $REDIS_CLIENTS"
}

# ============================================
# Check Disk Space
# ============================================

check_disk_space() {
    log "Checking disk space..."

    # Check root partition
    DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

    if [ "$DISK_USAGE" -ge "$DISK_CRITICAL_THRESHOLD" ]; then
        log_error "Disk usage critical: ${DISK_USAGE}%"
        send_alert "Disk space critical: ${DISK_USAGE}%"
    elif [ "$DISK_USAGE" -ge "$DISK_WARNING_THRESHOLD" ]; then
        log_warning "Disk usage high: ${DISK_USAGE}%"
    else
        log_success "Disk usage OK: ${DISK_USAGE}%"
    fi

    # Check if running out of inodes
    INODE_USAGE=$(df -i / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [ "$INODE_USAGE" -ge "$DISK_WARNING_THRESHOLD" ]; then
        log_warning "Inode usage high: ${INODE_USAGE}%"
    fi

    # Check specific directories
    if [ -d "$APP_DIR/logs" ]; then
        LOGS_SIZE=$(du -sh "$APP_DIR/logs" | cut -f1)
        log "Logs directory size: $LOGS_SIZE"
    fi

    if [ -d "/var/backups/syndicat-tox" ]; then
        BACKUP_SIZE=$(du -sh "/var/backups/syndicat-tox" | cut -f1)
        log "Backup directory size: $BACKUP_SIZE"
    fi
}

# ============================================
# Check Memory Usage
# ============================================

check_memory() {
    log "Checking memory usage..."

    # Get memory usage percentage
    MEMORY_USAGE=$(free | grep Mem | awk '{printf "%.0f", $3/$2 * 100}')

    if [ "$MEMORY_USAGE" -ge "$MEMORY_CRITICAL_THRESHOLD" ]; then
        log_error "Memory usage critical: ${MEMORY_USAGE}%"
        send_alert "Memory usage critical: ${MEMORY_USAGE}%"
    elif [ "$MEMORY_USAGE" -ge "$MEMORY_WARNING_THRESHOLD" ]; then
        log_warning "Memory usage high: ${MEMORY_USAGE}%"
    else
        log_success "Memory usage OK: ${MEMORY_USAGE}%"
    fi

    # Check swap usage
    SWAP_USAGE=$(free | grep Swap | awk '{if ($2 > 0) printf "%.0f", $3/$2 * 100; else print "0"}')
    if [ "$SWAP_USAGE" -gt 50 ]; then
        log_warning "Swap usage high: ${SWAP_USAGE}%"
    fi

    # Show top memory consumers
    TOP_MEMORY=$(ps aux --sort=-%mem | head -6 | tail -5 | awk '{printf "  %-20s %5s\n", $11, $4"%"}')
    if [ "$QUIET" = false ]; then
        echo -e "${BLUE}Top memory consumers:${NC}"
        echo "$TOP_MEMORY"
    fi
}

# ============================================
# Check CPU Usage
# ============================================

check_cpu() {
    log "Checking CPU usage..."

    # Get CPU usage (1 minute average)
    CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}' | cut -d'.' -f1)

    if [ "$CPU_USAGE" -ge "$CPU_WARNING_THRESHOLD" ]; then
        log_warning "CPU usage high: ${CPU_USAGE}%"
    else
        log_success "CPU usage OK: ${CPU_USAGE}%"
    fi

    # Check load average
    LOAD_AVG=$(uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//')
    LOAD_AVG_INT=$(echo "$LOAD_AVG" | cut -d'.' -f1)
    CPU_CORES=$(nproc)

    if [ "$LOAD_AVG_INT" -ge "$((CPU_CORES * 2))" ]; then
        log_warning "Load average high: $LOAD_AVG (CPU cores: $CPU_CORES)"
    else
        log_success "Load average OK: $LOAD_AVG (CPU cores: $CPU_CORES)"
    fi
}

# ============================================
# Check SSL Certificate
# ============================================

check_ssl_certificate() {
    log "Checking SSL certificate..."

    # Load domain from .env
    if [ -f "$APP_DIR/.env" ]; then
        set -a
        source "$APP_DIR/.env"
        set +a
    fi

    DOMAIN="${APP_DOMAIN:-localhost}"

    # Skip if localhost
    if [ "$DOMAIN" = "localhost" ]; then
        log "Skipping SSL check (localhost)"
        return 0
    fi

    # Check certificate expiration
    CERT_FILE="/etc/letsencrypt/live/$DOMAIN/cert.pem"

    if [ -f "$CERT_FILE" ]; then
        EXPIRY_DATE=$(openssl x509 -enddate -noout -in "$CERT_FILE" | cut -d= -f2)
        EXPIRY_EPOCH=$(date -d "$EXPIRY_DATE" +%s)
        NOW_EPOCH=$(date +%s)
        DAYS_UNTIL_EXPIRY=$(( ($EXPIRY_EPOCH - $NOW_EPOCH) / 86400 ))

        if [ "$DAYS_UNTIL_EXPIRY" -lt 7 ]; then
            log_error "SSL certificate expires in $DAYS_UNTIL_EXPIRY days!"
            send_alert "SSL certificate expires in $DAYS_UNTIL_EXPIRY days"
        elif [ "$DAYS_UNTIL_EXPIRY" -lt 30 ]; then
            log_warning "SSL certificate expires in $DAYS_UNTIL_EXPIRY days"
        else
            log_success "SSL certificate valid for $DAYS_UNTIL_EXPIRY days"
        fi
    else
        log_warning "SSL certificate not found at $CERT_FILE"
    fi
}

# ============================================
# Check Log Files
# ============================================

check_logs() {
    log "Checking log files..."

    # Check for errors in application logs (last 100 lines)
    if [ -f "$APP_DIR/logs/error.log" ]; then
        ERROR_COUNT=$(tail -100 "$APP_DIR/logs/error.log" 2>/dev/null | grep -i "error\|exception\|critical" | wc -l)
        if [ "$ERROR_COUNT" -gt 10 ]; then
            log_warning "Found $ERROR_COUNT errors in last 100 log lines"
        fi
    fi

    # Check Nginx error log
    if [ -f "/var/log/nginx/error.log" ]; then
        NGINX_ERRORS=$(tail -100 /var/log/nginx/error.log 2>/dev/null | grep -i "error" | wc -l)
        if [ "$NGINX_ERRORS" -gt 10 ]; then
            log_warning "Found $NGINX_ERRORS errors in Nginx log"
        fi
    fi
}

# ============================================
# Main Health Check
# ============================================

main() {
    if [ "$QUIET" = false ]; then
        echo "============================================"
        echo "Le Syndicat des Tox - Health Check"
        echo "============================================"
        echo ""
    fi

    # Create log directory if it doesn't exist
    mkdir -p "$(dirname "$HEALTH_LOG")"

    # Run all checks
    check_nginx
    check_application
    check_database
    check_redis
    check_disk_space
    check_memory
    check_cpu
    check_ssl_certificate
    check_logs

    if [ "$QUIET" = false ]; then
        echo ""
        echo "============================================"
        if [ $EXIT_CODE -eq 0 ]; then
            echo -e "${GREEN}Health Check: PASSED${NC}"
        else
            echo -e "${RED}Health Check: FAILED${NC}"
        fi
        echo "============================================"
    fi

    exit $EXIT_CODE
}

# ============================================
# Execute Main
# ============================================

main
