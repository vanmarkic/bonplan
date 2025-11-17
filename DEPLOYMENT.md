# Le Syndicat des Tox - Deployment Guide

## Overview

This guide covers production deployment automation for Le Syndicat des Tox. All deployment scripts are located in the `scripts/` directory.

## Quick Start

### Initial Production Deployment

```bash
# 1. Make scripts executable
chmod +x scripts/*.sh

# 2. Run production installation
sudo bash scripts/install.sh

# 3. Verify installation
bash scripts/health-check.sh
```

### Deploying Updates

```bash
# Deploy new version (with tests)
sudo bash scripts/deploy.sh

# Deploy without running tests (faster, use with caution)
sudo bash scripts/deploy.sh --skip-tests
```

## Deployment Scripts

### 1. install.sh - Initial Production Setup

**Purpose:** Complete production installation with security hardening.

**Features:**
- System package installation (Node.js, MariaDB, Redis, Nginx)
- Application user creation
- Environment configuration with auto-generated secrets
- Database and Redis setup
- Nginx reverse proxy configuration
- SSL certificate setup with Let's Encrypt
- Firewall configuration with rate limiting
- Security hardening (SSH, fail2ban, kernel parameters)
- Automatic security updates
- Log rotation
- Automated monitoring and backup setup

**Usage:**
```bash
sudo bash scripts/install.sh
```

**Requirements:**
- Debian/Ubuntu system
- Root/sudo access
- Internet connection
- Domain name (for SSL)

**Post-Installation:**
- Review `.env` file and save credentials securely
- Test application: `curl https://your-domain.com/health`
- Run health check: `bash scripts/health-check.sh`

---

### 2. deploy.sh - Zero-Downtime Deployment

**Purpose:** Deploy application updates with automatic rollback on failure.

**Features:**
- Pre-deployment checks (git status, disk space)
- Automated testing (lint, unit, integration, security)
- Pre-deployment backup
- Docker image building
- Database migrations
- Zero-downtime deployment (PM2 reload or Docker rolling update)
- Post-deployment verification
- Automatic rollback on failure
- Cleanup of old images and backups

**Usage:**
```bash
# Full deployment with all tests
sudo bash scripts/deploy.sh

# Skip tests (faster, for hotfixes)
sudo bash scripts/deploy.sh --skip-tests
```

**Deployment Flow:**
1. Pre-deployment checks
2. Run test suite
3. Create backup
4. Build Docker images
5. Run database migrations
6. Deploy application (zero-downtime)
7. Verify deployment
8. Cleanup old resources
9. On failure: automatic rollback

**Rollback:**
- Automatic rollback on verification failure
- Restores database from pre-deployment backup
- Reverts to previous git commit
- Restarts services with previous version

---

### 3. backup.sh - Automated Backup

**Purpose:** Comprehensive backup of all application data.

**Features:**
- Database backup (mysqldump with compression)
- Redis backup (RDB snapshot)
- Configuration backup (.env, nginx, PM2/systemd)
- Application files backup
- Log backup (last 7 days)
- Backup manifest with checksums (SHA256)
- Optional GPG encryption
- Automated rotation (30-day retention)
- Backup verification

**Usage:**
```bash
# Create backup in default location
sudo bash scripts/backup.sh

# Create backup in custom location
sudo bash scripts/backup.sh /path/to/backup/directory
```

**Backup Contents:**
- `database.sql.gz` - Complete database dump
- `redis/dump.rdb.gz` - Redis data snapshot
- `config/.env` - Environment configuration
- `config/nginx.conf` - Nginx configuration
- `config/ecosystem.config.js` - PM2 configuration
- `application/package.json` - Dependency versions
- `application/git-info.txt` - Git commit info
- `logs.tar.gz` - Recent application logs
- `MANIFEST.txt` - Backup inventory with checksums

**Automated Backups:**
- Scheduled daily at 2 AM via cron
- 30-day retention (older backups automatically deleted)
- Located in `/var/backups/syndicat-tox/`

**Encryption:**
To enable GPG encryption, edit `scripts/backup.sh`:
```bash
ENCRYPT=true
```

---

### 4. restore.sh - Backup Restoration

**Purpose:** Restore application from backup.

**Features:**
- Pre-restore backup of current state
- Service shutdown during restore
- Database restoration
- Redis data restoration
- Configuration restoration (with confirmation)
- Service restart
- Post-restore verification
- Rollback option if verification fails

**Usage:**
```bash
# Restore from backup
sudo bash scripts/restore.sh /path/to/backup-directory

# Example
sudo bash scripts/restore.sh /var/backups/syndicat-tox/backup-20250117_020000
```

**Restore Process:**
1. Verify backup directory exists
2. Create pre-restore backup (safety net)
3. Stop all services
4. Restore database (drop + recreate)
5. Restore Redis data
6. Restore configuration files (with prompts)
7. Restore application files
8. Start services
9. Verify restoration
10. On failure: instructions to rollback

**Safety Features:**
- Confirmation prompts before destructive operations
- Pre-restore backup for rollback
- Verification checks after restoration
- Clear rollback instructions on failure

---

### 5. health-check.sh - System Monitoring

**Purpose:** Comprehensive health monitoring for production.

**Features:**
- Service checks (Nginx, App, Database, Redis)
- Resource monitoring (CPU, memory, disk)
- SSL certificate expiration check
- Application response time measurement
- Log error detection
- Health status logging
- Alert system (optional)

**Usage:**
```bash
# Interactive health check (full output)
bash scripts/health-check.sh

# Quiet mode (for cron, only errors)
bash scripts/health-check.sh --quiet

# With alerts (sends to syslog)
bash scripts/health-check.sh --quiet --alert
```

**Checks Performed:**

**Services:**
- Nginx: running, config valid, ports 80/443 listening
- Application: running, health endpoint responding, response time
- Database: running, connection working, query performance
- Redis: running, connection working, memory usage

**Resources:**
- Disk space: warns at 80%, critical at 90%
- Memory: warns at 80%, critical at 90%
- CPU: warns at 80%
- Load average vs CPU cores
- Top memory consumers

**Security:**
- SSL certificate expiration (warns at 30 days, critical at 7 days)
- Recent errors in logs

**Automated Monitoring:**
- Runs every 5 minutes via cron
- Logs to `/var/log/syndicat-tox-health.log`
- Alerts sent to syslog on failures
- Can integrate with email/Slack notifications

**Exit Codes:**
- `0` - All checks passed
- `1` - One or more checks failed

---

## Docker Compose Production

### docker-compose.prod.yml

Production-optimized Docker Compose configuration.

**Features:**
- Production-specific settings
- Resource limits and reservations
- Health checks for all services
- Rolling updates with rollback
- Security hardening (cap_drop, no-new-privileges)
- Structured logging (JSON, rotation)
- Localhost-only port binding
- Read-only containers where possible

**Service Resources:**

| Service  | CPU Limit | Memory Limit | Restart Policy |
|----------|-----------|--------------|----------------|
| Database | 2.0       | 1GB          | always         |
| Redis    | 1.0       | 768MB        | always         |
| App      | 1.0       | 512MB        | always         |
| Nginx    | 0.5       | 256MB        | always         |

**Usage:**
```bash
# Start production stack
docker-compose -f docker-compose.prod.yml up -d

# View logs
docker-compose -f docker-compose.prod.yml logs -f

# Scale application (multiple instances)
docker-compose -f docker-compose.prod.yml up -d --scale app=3

# Stop stack
docker-compose -f docker-compose.prod.yml down

# Update services (rolling update)
docker-compose -f docker-compose.prod.yml up -d --no-deps --build app
```

**Security Features:**
- Containers drop all capabilities by default
- Only required capabilities added
- Read-only root filesystem for app
- No new privileges allowed
- Services bind only to localhost (127.0.0.1)
- Isolated network with custom subnet

**Monitoring (Optional):**
Uncomment Prometheus service in `docker-compose.prod.yml`:
```yaml
prometheus:
  # ... configuration
```

---

## Deployment Workflows

### Standard Update Deployment

```bash
# 1. Pull latest code
git pull origin main

# 2. Run tests locally (optional)
npm test

# 3. Deploy with automated testing
sudo bash scripts/deploy.sh

# 4. Verify deployment
bash scripts/health-check.sh

# 5. Monitor logs
tail -f /var/www/syndicat-tox/logs/app.log
```

### Emergency Hotfix Deployment

```bash
# 1. Apply critical fix
git pull origin hotfix

# 2. Quick deployment (skip tests)
sudo bash scripts/deploy.sh --skip-tests

# 3. Immediate verification
curl https://your-domain.com/health

# 4. Run full health check
bash scripts/health-check.sh
```

### Disaster Recovery

```bash
# 1. Identify latest good backup
ls -lah /var/backups/syndicat-tox/

# 2. Restore from backup
sudo bash scripts/restore.sh /var/backups/syndicat-tox/backup-YYYYMMDD_HHMMSS

# 3. Verify restoration
bash scripts/health-check.sh

# 4. Test application functionality
curl https://your-domain.com/health
```

### Database Migration

```bash
# 1. Create pre-migration backup
sudo bash scripts/backup.sh

# 2. Deploy with migration
sudo bash scripts/deploy.sh

# 3. Verify migration
mysql -u $DB_USER -p$DB_PASSWORD -e "SHOW TABLES;" $DB_NAME

# 4. Test application
bash scripts/health-check.sh
```

---

## Automated Tasks

### Cron Jobs

Automatically configured by `install.sh`:

```bash
# Health checks every 5 minutes
*/5 * * * * root /var/www/syndicat-tox/scripts/health-check.sh --quiet --alert

# Daily backups at 2 AM
0 2 * * * root /var/www/syndicat-tox/scripts/backup.sh
```

**View cron configuration:**
```bash
cat /etc/cron.d/syndicat-tox-health
cat /etc/cron.d/syndicat-tox-backup
```

**Modify schedule:**
```bash
# Edit health check frequency
sudo nano /etc/cron.d/syndicat-tox-health

# Edit backup schedule
sudo nano /etc/cron.d/syndicat-tox-backup
```

---

## Monitoring and Logging

### Log Locations

- **Application logs:** `/var/www/syndicat-tox/logs/`
  - `app.log` - General application logs
  - `error.log` - Error logs
  - `audit.log` - Security audit logs

- **Health check logs:** `/var/log/syndicat-tox-health.log`

- **Deployment logs:** `/var/log/syndicat-tox-deploy.log`

- **Nginx logs:** `/var/log/nginx/`
  - `access.log` - Access logs (anonymized)
  - `error.log` - Nginx errors

- **Database logs:** `/var/log/mysql/`
  - `error.log` - Database errors
  - `slow.log` - Slow queries

### Log Rotation

Configured automatically for 30-day retention:
```bash
/etc/logrotate.d/syndicat-tox
```

### Monitoring Commands

```bash
# View real-time logs
tail -f /var/www/syndicat-tox/logs/app.log

# View errors only
grep -i error /var/www/syndicat-tox/logs/error.log

# Check recent health status
tail -50 /var/log/syndicat-tox-health.log

# Monitor all services
watch -n 5 'bash scripts/health-check.sh'

# Database performance
mysql -u $DB_USER -p$DB_PASSWORD -e "SHOW PROCESSLIST;"

# Redis stats
redis-cli -a $REDIS_PASSWORD INFO stats
```

---

## Security Hardening

### Automated Security Measures

Applied by `install.sh`:

1. **SSH Hardening:**
   - Root login disabled
   - Password authentication disabled
   - Key-based authentication only

2. **Firewall (UFW):**
   - Default deny incoming
   - Rate limiting on SSH, HTTP, HTTPS
   - Only essential ports open (22, 80, 443)

3. **Fail2ban:**
   - Nginx HTTP auth protection
   - Nginx request limit protection
   - Automatic IP blocking on abuse

4. **Database Security:**
   - Bind to localhost only
   - Anonymous users removed
   - Test database removed
   - Root remote access disabled

5. **Redis Security:**
   - Bind to localhost only
   - Password authentication required
   - Memory limit enforced
   - LRU eviction policy

6. **Kernel Hardening:**
   - IP spoofing protection
   - SYN cookie protection
   - ICMP broadcast protection
   - Kernel pointer restriction

7. **Automatic Updates:**
   - Security updates install automatically
   - No automatic reboots (manual control)

### Manual Security Checks

```bash
# Verify firewall status
sudo ufw status verbose

# Check fail2ban jails
sudo fail2ban-client status

# Review security logs
sudo grep -i "fail" /var/log/auth.log

# Check for rootkits
sudo rkhunter --check

# Audit system security
sudo lynis audit system
```

---

## Troubleshooting

### Deployment Failures

**Problem:** Deploy script fails
```bash
# View deployment log
tail -100 /var/log/syndicat-tox-deploy.log

# Check for errors
grep ERROR /var/log/syndicat-tox-deploy.log

# Manual rollback if automatic failed
git reset --hard <previous-commit>
sudo bash scripts/restore.sh /var/backups/syndicat-tox/pre-deploy-*
```

**Problem:** Database migration fails
```bash
# Check database status
mysql -u $DB_USER -p$DB_PASSWORD -e "SHOW TABLES;" $DB_NAME

# Restore from backup
sudo bash scripts/restore.sh /path/to/backup

# Re-run migrations manually
npm run db:migrate
```

### Service Issues

**Problem:** Application not responding
```bash
# Check health
bash scripts/health-check.sh

# View application logs
tail -100 /var/www/syndicat-tox/logs/error.log

# Restart services
sudo systemctl restart syndicat-tox  # systemd
# OR
sudo -u syndicat pm2 restart syndicat-tox  # PM2
# OR
docker-compose -f docker-compose.prod.yml restart app  # Docker
```

**Problem:** High memory usage
```bash
# Check memory
free -h

# Check top processes
top

# Restart services to clear memory
sudo systemctl restart syndicat-tox
```

### Backup/Restore Issues

**Problem:** Backup fails
```bash
# Check disk space
df -h

# Run backup manually with verbose output
sudo bash -x scripts/backup.sh

# Clean old backups
find /var/backups/syndicat-tox -mtime +30 -delete
```

**Problem:** Restore verification fails
```bash
# Check database connection
mysql -u $DB_USER -p$DB_PASSWORD -e "SELECT 1;"

# Check application health
curl http://localhost:3000/health

# View restore errors
journalctl -u syndicat-tox -n 100
```

---

## Performance Optimization

### Database Tuning

Edit `/etc/mysql/mariadb.conf.d/99-syndicat-security.cnf`:
```ini
[mysqld]
innodb_buffer_pool_size = 1G  # 70% of available RAM
max_connections = 200
query_cache_size = 64M
```

### Redis Tuning

Edit Redis configuration:
```bash
redis-cli CONFIG SET maxmemory 1gb
redis-cli CONFIG SET maxmemory-policy allkeys-lru
```

### Application Scaling

**Horizontal Scaling (Docker):**
```bash
docker-compose -f docker-compose.prod.yml up -d --scale app=4
```

**PM2 Cluster Mode:**
```bash
pm2 start ecosystem.config.js -i 4  # 4 instances
```

---

## Maintenance

### Regular Maintenance Tasks

**Weekly:**
```bash
# Review health logs
tail -500 /var/log/syndicat-tox-health.log

# Check disk usage
df -h

# Review error logs
grep -i error /var/www/syndicat-tox/logs/error.log | tail -100
```

**Monthly:**
```bash
# Update system packages
sudo apt update && sudo apt upgrade -y

# Clean old Docker images
docker system prune -a

# Review and archive old logs
cd /var/www/syndicat-tox/logs && tar -czf archive-$(date +%Y%m).tar.gz *.log
```

**Quarterly:**
```bash
# Security audit
sudo lynis audit system

# Performance review
mysql -u $DB_USER -p$DB_PASSWORD -e "SHOW GLOBAL STATUS;"

# Capacity planning
df -h && free -h
```

---

## Emergency Procedures

### Service Outage

```bash
# 1. Check all services
bash scripts/health-check.sh

# 2. Restart all services
sudo systemctl restart nginx mariadb redis-server syndicat-tox

# 3. Check logs
tail -f /var/www/syndicat-tox/logs/error.log

# 4. If persistent, restore from backup
sudo bash scripts/restore.sh /var/backups/syndicat-tox/backup-*
```

### Database Corruption

```bash
# 1. Stop application
sudo systemctl stop syndicat-tox

# 2. Restore database from backup
sudo bash scripts/restore.sh /var/backups/syndicat-tox/backup-*

# 3. Verify integrity
mysql -u $DB_USER -p$DB_PASSWORD -e "CHECK TABLE users;" $DB_NAME

# 4. Restart application
sudo systemctl start syndicat-tox
```

### Security Breach

```bash
# 1. Immediately isolate server
sudo ufw deny out
sudo systemctl stop syndicat-tox nginx

# 2. Analyze logs
grep -i "fail\|attack" /var/log/auth.log /var/log/nginx/error.log

# 3. Restore from clean backup
sudo bash scripts/restore.sh /var/backups/syndicat-tox/backup-CLEAN-DATE

# 4. Rotate secrets
# Edit .env and regenerate SESSION_SECRET, DB_PASSWORD, REDIS_PASSWORD

# 5. Re-harden system
sudo bash scripts/install.sh  # Re-run security hardening steps
```

---

## Contact and Support

For issues or questions about deployment:
1. Check this documentation
2. Review logs in `/var/log/`
3. Run health check: `bash scripts/health-check.sh`
4. Check project issues on GitHub

**Critical Security Issues:**
Report immediately via encrypted channels (see SECURITY.md)
