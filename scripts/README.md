# Deployment Scripts - Quick Reference

## Overview

This directory contains all production deployment and maintenance scripts for Le Syndicat des Tox.

## Scripts

### install.sh (507 lines)
**Purpose:** Initial production installation with full security hardening

**Usage:**
```bash
sudo bash scripts/install.sh
```

**What it does:**
- Installs all dependencies (Node.js, MariaDB, Redis, Nginx)
- Creates application user and directory structure
- Generates secure credentials (.env)
- Configures database and Redis
- Sets up Nginx reverse proxy with SSL
- Hardens security (SSH, firewall, fail2ban, kernel)
- Configures automatic updates
- Sets up monitoring and backup cron jobs

**Time:** ~15-20 minutes

---

### deploy.sh (464 lines)
**Purpose:** Zero-downtime deployment with automatic rollback

**Usage:**
```bash
# Full deployment
sudo bash scripts/deploy.sh

# Skip tests (hotfixes)
sudo bash scripts/deploy.sh --skip-tests
```

**What it does:**
1. Pre-deployment checks (git, disk space, services)
2. Run test suite (lint, unit, integration, security)
3. Create backup
4. Build Docker images
5. Run database migrations
6. Deploy application (zero-downtime)
7. Verify deployment
8. Cleanup old resources
9. Automatic rollback on failure

**Time:** ~5-10 minutes

---

### backup.sh (486 lines)
**Purpose:** Comprehensive automated backup

**Usage:**
```bash
# Default location
sudo bash scripts/backup.sh

# Custom location
sudo bash scripts/backup.sh /path/to/backup
```

**What it does:**
- Database backup (mysqldump + compression)
- Redis data backup (RDB snapshot)
- Configuration backup (.env, nginx, PM2)
- Application files backup
- Log backup (last 7 days)
- Create manifest with checksums
- Optional GPG encryption
- Rotate old backups (30-day retention)

**Automated:** Daily at 2 AM via cron

**Time:** ~2-5 minutes

---

### restore.sh (425 lines)
**Purpose:** Restore from backup with safety checks

**Usage:**
```bash
sudo bash scripts/restore.sh /path/to/backup-directory
```

**What it does:**
1. Verify backup exists
2. Create pre-restore backup (safety)
3. Stop services
4. Restore database (drop + recreate)
5. Restore Redis data
6. Restore configurations (with prompts)
7. Restore application files
8. Start services
9. Verify restoration

**Time:** ~5-10 minutes

---

### health-check.sh (526 lines)
**Purpose:** Comprehensive system health monitoring

**Usage:**
```bash
# Interactive (full output)
bash scripts/health-check.sh

# Quiet mode (for cron)
bash scripts/health-check.sh --quiet

# With alerts
bash scripts/health-check.sh --quiet --alert
```

**What it does:**
- Check services (Nginx, App, Database, Redis)
- Monitor resources (CPU, memory, disk, load)
- Verify SSL certificates
- Check application response time
- Scan logs for errors
- Send alerts on failures

**Automated:** Every 5 minutes via cron

**Time:** ~10-30 seconds

---

### setup-database.sh (165 lines)
**Purpose:** Initialize database schema

**Usage:**
```bash
bash scripts/setup-database.sh
```

**What it does:**
- Create database if not exists
- Apply schema from docs/DATABASE_SCHEMA.sql
- Verify tables created

**Time:** ~30 seconds

---

## Quick Start Guide

### First-Time Production Setup

```bash
# 1. Clone repository
git clone <repo-url>
cd bonplan

# 2. Make scripts executable
chmod +x scripts/*.sh

# 3. Run installation
sudo bash scripts/install.sh

# 4. Verify installation
bash scripts/health-check.sh
```

### Daily Operations

```bash
# Check system health
bash scripts/health-check.sh

# Create manual backup
sudo bash scripts/backup.sh

# View logs
tail -f /var/www/syndicat-tox/logs/app.log
```

### Deploying Updates

```bash
# 1. Pull latest code
git pull origin main

# 2. Deploy
sudo bash scripts/deploy.sh

# 3. Verify
bash scripts/health-check.sh
```

### Emergency Recovery

```bash
# 1. List backups
ls -lah /var/backups/syndicat-tox/

# 2. Restore
sudo bash scripts/restore.sh /var/backups/syndicat-tox/backup-YYYYMMDD_HHMMSS

# 3. Verify
bash scripts/health-check.sh
```

## Automated Tasks

### Cron Jobs

Configured automatically by `install.sh`:

```bash
# Health checks (every 5 minutes)
/etc/cron.d/syndicat-tox-health

# Backups (daily at 2 AM)
/etc/cron.d/syndicat-tox-backup
```

### View Cron Status

```bash
# Check if cron jobs are configured
ls -l /etc/cron.d/syndicat-tox-*

# View cron logs
grep CRON /var/log/syslog
```

## Log Locations

| Log Type | Location |
|----------|----------|
| Application | `/var/www/syndicat-tox/logs/app.log` |
| Errors | `/var/www/syndicat-tox/logs/error.log` |
| Health Checks | `/var/log/syndicat-tox-health.log` |
| Deployments | `/var/log/syndicat-tox-deploy.log` |
| Nginx Access | `/var/log/nginx/access.log` |
| Nginx Errors | `/var/log/nginx/error.log` |
| Database | `/var/log/mysql/error.log` |

## Common Issues

### Script Permission Denied

```bash
chmod +x scripts/*.sh
```

### Backup Directory Full

```bash
# Clean old backups manually
sudo find /var/backups/syndicat-tox -mtime +30 -delete

# Or run backup with cleanup
sudo bash scripts/backup.sh
```

### Deployment Fails

```bash
# Check logs
tail -100 /var/log/syndicat-tox-deploy.log

# Manual rollback
git reset --hard <previous-commit>
sudo bash scripts/restore.sh /var/backups/syndicat-tox/pre-deploy-*
```

### Health Check Fails

```bash
# Check specific service
systemctl status syndicat-tox
systemctl status nginx
systemctl status mariadb
systemctl status redis-server

# Restart services
sudo systemctl restart syndicat-tox nginx
```

## Best Practices

1. **Always test locally first**
   ```bash
   npm test
   ```

2. **Create backup before major changes**
   ```bash
   sudo bash scripts/backup.sh
   ```

3. **Monitor health regularly**
   ```bash
   bash scripts/health-check.sh
   ```

4. **Review logs after deployment**
   ```bash
   tail -f /var/www/syndicat-tox/logs/app.log
   ```

5. **Test restore procedure periodically**
   ```bash
   # On test server
   sudo bash scripts/restore.sh /path/to/backup
   ```

## Security Notes

- All scripts require `sudo` for production operations
- Scripts validate environment before executing
- Automatic backups before destructive operations
- Rollback capability on failures
- Comprehensive logging for audit trail
- Secrets never logged or displayed

## Getting Help

1. Check this README
2. Read full documentation: `DEPLOYMENT.md`
3. View script source code (well-commented)
4. Check logs for errors
5. Run health check for diagnostics

## Script Statistics

| Script | Lines | Size | Avg Runtime |
|--------|-------|------|-------------|
| install.sh | 507 | 15KB | 15-20 min |
| deploy.sh | 464 | 12KB | 5-10 min |
| backup.sh | 486 | 14KB | 2-5 min |
| restore.sh | 425 | 12KB | 5-10 min |
| health-check.sh | 526 | 17KB | 10-30 sec |
| setup-database.sh | 165 | 5KB | 30 sec |
| **Total** | **2,573** | **75KB** | - |

---

**For detailed information, see:** `/Users/dragan/Documents/bonplan/DEPLOYMENT.md`
