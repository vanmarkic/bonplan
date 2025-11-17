#!/bin/bash
# ============================================
# Le Syndicat des Tox - Deployment Script
# ============================================
# Zero-downtime deployment with rollback capability
# Run as: bash scripts/deploy.sh [--skip-tests]
#
# Features:
# - Pre-deployment health checks
# - Automated testing
# - Database migrations
# - Zero-downtime deployment
# - Post-deployment verification
# - Automatic rollback on failure

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

# Deployment settings
DEPLOY_USER="syndicat"
APP_DIR="/var/www/syndicat-tox"
BACKUP_DIR="/var/backups/syndicat-tox"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"
DEPLOYMENT_LOG="/var/log/syndicat-tox-deploy.log"
SKIP_TESTS=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --skip-tests)
            SKIP_TESTS=true
            shift
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            exit 1
            ;;
    esac
done

# ============================================
# Utility Functions
# ============================================

log() {
    echo -e "${BLUE}[$(date '+%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$DEPLOYMENT_LOG"
}

log_error() {
    echo -e "${RED}[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$DEPLOYMENT_LOG"
}

log_success() {
    echo -e "${GREEN}[$(date '+%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}" | tee -a "$DEPLOYMENT_LOG"
}

log_warning() {
    echo -e "${YELLOW}[$(date '+%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$DEPLOYMENT_LOG"
}

confirm() {
    read -p "$1 (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log "Deployment cancelled by user"
        exit 1
    fi
}

# ============================================
# Pre-Deployment Checks
# ============================================

pre_deployment_checks() {
    log "Starting pre-deployment checks..."

    # Check if running as root or sudo
    if [ "$EUID" -ne 0 ]; then
        log_error "This script must be run as root (use sudo)"
        exit 1
    fi

    # Check if git repository is clean
    if [ -d ".git" ]; then
        if [ -n "$(git status --porcelain)" ]; then
            log_warning "Git repository has uncommitted changes"
            confirm "Continue with uncommitted changes?"
        fi

        # Get current commit hash for rollback
        CURRENT_COMMIT=$(git rev-parse HEAD)
        echo "$CURRENT_COMMIT" > /tmp/syndicat-deploy-commit.txt
        log "Current commit: $CURRENT_COMMIT"
    fi

    # Check if .env file exists
    if [ ! -f "$APP_DIR/.env" ]; then
        log_error ".env file not found at $APP_DIR/.env"
        exit 1
    fi

    # Check if required services are running
    if command -v docker &> /dev/null; then
        if ! docker info &> /dev/null; then
            log_error "Docker is not running"
            exit 1
        fi
    fi

    # Check disk space (require at least 1GB free)
    DISK_FREE=$(df -BG "$APP_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')
    if [ "$DISK_FREE" -lt 1 ]; then
        log_error "Insufficient disk space. At least 1GB required, found ${DISK_FREE}GB"
        exit 1
    fi

    log_success "Pre-deployment checks passed"
}

# ============================================
# Run Tests
# ============================================

run_tests() {
    if [ "$SKIP_TESTS" = true ]; then
        log_warning "Skipping tests (--skip-tests flag provided)"
        return 0
    fi

    log "Running test suite..."

    # Run linting
    log "Running linter..."
    if ! npm run lint; then
        log_error "Linting failed"
        exit 1
    fi

    # Run unit tests
    log "Running unit tests..."
    if ! npm run test:unit; then
        log_error "Unit tests failed"
        exit 1
    fi

    # Run integration tests
    log "Running integration tests..."
    if ! npm run test:integration; then
        log_error "Integration tests failed"
        exit 1
    fi

    # Run security tests
    log "Running security tests..."
    if ! npm run test:security; then
        log_error "Security tests failed"
        exit 1
    fi

    log_success "All tests passed"
}

# ============================================
# Create Backup
# ============================================

create_backup() {
    log "Creating pre-deployment backup..."

    # Create backup directory with timestamp
    BACKUP_TIMESTAMP=$(date +%Y%m%d_%H%M%S)
    BACKUP_PATH="$BACKUP_DIR/pre-deploy-$BACKUP_TIMESTAMP"
    mkdir -p "$BACKUP_PATH"

    # Run backup script
    if [ -f "scripts/backup.sh" ]; then
        bash scripts/backup.sh "$BACKUP_PATH"
    else
        log_warning "Backup script not found, creating manual backup..."

        # Backup database
        if [ -f "$APP_DIR/.env" ]; then
            source "$APP_DIR/.env"
            mysqldump -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" > "$BACKUP_PATH/database.sql"
        fi

        # Backup .env file
        cp "$APP_DIR/.env" "$BACKUP_PATH/.env.backup"
    fi

    # Save backup path for potential rollback
    echo "$BACKUP_PATH" > /tmp/syndicat-deploy-backup.txt

    log_success "Backup created at $BACKUP_PATH"
}

# ============================================
# Build Docker Images
# ============================================

build_images() {
    log "Building Docker images..."

    # Build production image
    docker build -t syndicat-tox:latest -t "syndicat-tox:$(date +%Y%m%d_%H%M%S)" .

    log_success "Docker images built successfully"
}

# ============================================
# Database Migrations
# ============================================

run_migrations() {
    log "Running database migrations..."

    # Check if migrations exist
    if [ -d "migrations" ] || [ -f "scripts/migrate.js" ]; then
        cd "$APP_DIR"

        # Run migrations as app user
        if sudo -u "$DEPLOY_USER" npm run db:migrate; then
            log_success "Database migrations completed"
        else
            log_error "Database migration failed"
            return 1
        fi
    else
        log_warning "No migrations found, skipping..."
    fi
}

# ============================================
# Deploy Application
# ============================================

deploy_application() {
    log "Deploying application..."

    if [ -f "$DOCKER_COMPOSE_FILE" ]; then
        # Docker Compose deployment
        deploy_with_docker
    else
        # PM2/systemd deployment
        deploy_with_pm2
    fi
}

deploy_with_docker() {
    log "Using Docker Compose for deployment..."

    # Pull/build images
    docker-compose -f "$DOCKER_COMPOSE_FILE" build

    # Start new containers (zero-downtime with rolling update)
    log "Starting new containers..."
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d --no-deps --scale app=2 app

    # Wait for health check
    sleep 10

    # Scale down old containers
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d --no-deps --scale app=1 app

    # Update other services
    docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

    log_success "Docker deployment completed"
}

deploy_with_pm2() {
    log "Using PM2 for deployment..."

    cd "$APP_DIR"

    # Install/update dependencies
    log "Installing dependencies..."
    sudo -u "$DEPLOY_USER" npm ci --only=production

    # Build assets
    log "Building assets..."
    sudo -u "$DEPLOY_USER" npm run build

    # Reload PM2 (zero-downtime)
    if sudo -u "$DEPLOY_USER" pm2 describe syndicat-tox &> /dev/null; then
        log "Reloading PM2 process..."
        sudo -u "$DEPLOY_USER" pm2 reload syndicat-tox --update-env
    else
        log "Starting PM2 process..."
        sudo -u "$DEPLOY_USER" pm2 start ecosystem.config.js --env production
        sudo -u "$DEPLOY_USER" pm2 save
    fi

    log_success "PM2 deployment completed"
}

# ============================================
# Post-Deployment Verification
# ============================================

verify_deployment() {
    log "Verifying deployment..."

    # Wait for application to start
    sleep 5

    # Run health check script
    if [ -f "scripts/health-check.sh" ]; then
        if bash scripts/health-check.sh; then
            log_success "Health checks passed"
            return 0
        else
            log_error "Health checks failed"
            return 1
        fi
    else
        # Basic HTTP check
        if curl -f -s http://localhost:3000/health > /dev/null; then
            log_success "Application is responding"
            return 0
        else
            log_error "Application health check failed"
            return 1
        fi
    fi
}

# ============================================
# Rollback
# ============================================

rollback() {
    log_error "Deployment failed, initiating rollback..."

    # Get backup path
    if [ -f /tmp/syndicat-deploy-backup.txt ]; then
        BACKUP_PATH=$(cat /tmp/syndicat-deploy-backup.txt)

        # Restore database
        if [ -f "$BACKUP_PATH/database.sql" ]; then
            log "Restoring database..."
            source "$APP_DIR/.env"
            mysql -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" < "$BACKUP_PATH/database.sql"
        fi

        # Restore .env
        if [ -f "$BACKUP_PATH/.env.backup" ]; then
            cp "$BACKUP_PATH/.env.backup" "$APP_DIR/.env"
        fi
    fi

    # Rollback git if commit was saved
    if [ -f /tmp/syndicat-deploy-commit.txt ] && [ -d ".git" ]; then
        ROLLBACK_COMMIT=$(cat /tmp/syndicat-deploy-commit.txt)
        log "Rolling back to commit $ROLLBACK_COMMIT"
        git reset --hard "$ROLLBACK_COMMIT"
    fi

    # Restart services
    if [ -f "$DOCKER_COMPOSE_FILE" ]; then
        docker-compose -f "$DOCKER_COMPOSE_FILE" up -d --force-recreate
    else
        sudo -u "$DEPLOY_USER" pm2 restart syndicat-tox
    fi

    log_error "Rollback completed"
    exit 1
}

# ============================================
# Cleanup
# ============================================

cleanup() {
    log "Cleaning up..."

    # Remove old Docker images (keep last 5)
    if command -v docker &> /dev/null; then
        log "Removing old Docker images..."
        docker images syndicat-tox --format "{{.Tag}}" | grep -E '^[0-9]{8}_[0-9]{6}$' | sort -r | tail -n +6 | xargs -I {} docker rmi syndicat-tox:{} || true
    fi

    # Remove old backups (keep last 30 days)
    find "$BACKUP_DIR" -name "pre-deploy-*" -type d -mtime +30 -exec rm -rf {} + || true

    # Clean npm cache
    sudo -u "$DEPLOY_USER" npm cache clean --force || true

    # Remove temporary files
    rm -f /tmp/syndicat-deploy-*.txt || true

    log_success "Cleanup completed"
}

# ============================================
# Main Deployment Flow
# ============================================

main() {
    log "============================================"
    log "Le Syndicat des Tox - Deployment Starting"
    log "============================================"

    # Show deployment info
    log "Deployment user: $DEPLOY_USER"
    log "Application directory: $APP_DIR"
    log "Skip tests: $SKIP_TESTS"

    # Confirm deployment
    confirm "Proceed with deployment?"

    # Execute deployment steps
    pre_deployment_checks
    run_tests
    create_backup
    build_images

    # Run migrations (rollback on failure)
    if ! run_migrations; then
        rollback
    fi

    # Deploy application
    deploy_application

    # Verify deployment (rollback on failure)
    if ! verify_deployment; then
        rollback
    fi

    # Cleanup
    cleanup

    log "============================================"
    log_success "Deployment completed successfully!"
    log "============================================"
    log ""
    log "Next steps:"
    log "1. Monitor logs: tail -f $APP_DIR/logs/app.log"
    log "2. Check metrics: scripts/health-check.sh"
    log "3. Test the application"
    log ""
    log "Backup location: $(cat /tmp/syndicat-deploy-backup.txt 2>/dev/null || echo 'N/A')"
}

# ============================================
# Execute Main
# ============================================

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$DEPLOYMENT_LOG")"

# Run main deployment
main
