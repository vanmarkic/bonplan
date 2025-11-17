# Production Deployment Checklist

## Pre-Deployment Checklist

### Server Preparation

- [ ] Server meets minimum requirements:
  - [ ] Debian/Ubuntu operating system
  - [ ] At least 2GB RAM
  - [ ] At least 20GB disk space
  - [ ] Root/sudo access
  - [ ] Internet connection

- [ ] Domain name configured:
  - [ ] DNS A record points to server IP
  - [ ] DNS propagation complete
  - [ ] Domain name noted: _______________

- [ ] Hosting provider verified:
  - [ ] Server located in Belgium
  - [ ] Provider confirmed GDPR compliant
  - [ ] Backup policy understood

### Code Preparation

- [ ] Repository ready:
  - [ ] All code committed to git
  - [ ] Tests passing locally (`npm test`)
  - [ ] Linting passing (`npm run lint`)
  - [ ] No uncommitted changes
  - [ ] On correct branch (main/master)

- [ ] Dependencies updated:
  - [ ] `npm audit` shows no critical vulnerabilities
  - [ ] Package versions reviewed
  - [ ] Security patches applied

### Documentation Review

- [ ] Read and understood:
  - [ ] `/Users/dragan/Documents/bonplan/DEPLOYMENT.md`
  - [ ] `/Users/dragan/Documents/bonplan/scripts/README.md`
  - [ ] `/Users/dragan/Documents/bonplan/docs/SECURITY_IMPLEMENTATION.md`

## Installation Checklist

### Step 1: Initial Setup

- [ ] SSH access configured:
  - [ ] SSH key-based authentication set up
  - [ ] Can connect: `ssh user@server`
  - [ ] User has sudo privileges

- [ ] Repository cloned:
  ```bash
  git clone <repo-url>
  cd bonplan
  ```

- [ ] Scripts made executable:
  ```bash
  chmod +x scripts/*.sh
  ```

### Step 2: Run Installation Script

- [ ] Installation script executed:
  ```bash
  sudo bash scripts/install.sh
  ```

- [ ] Installation completed without errors

- [ ] Credentials saved securely:
  - [ ] Database password: _______________
  - [ ] Redis password: _______________
  - [ ] Session secret: _______________
  - [ ] Stored in password manager: [ ]

### Step 3: SSL/TLS Configuration

- [ ] SSL certificate obtained:
  - [ ] Let's Encrypt certificate installed
  - [ ] Certificate valid: `curl https://domain.com`
  - [ ] Auto-renewal configured

- [ ] SSL configuration verified:
  - [ ] A+ rating on SSL Labs (optional)
  - [ ] HTTPS enforced
  - [ ] HTTP redirects to HTTPS

### Step 4: Security Verification

- [ ] Firewall configured:
  ```bash
  sudo ufw status
  ```
  - [ ] Only ports 22, 80, 443 open
  - [ ] Rate limiting active

- [ ] Fail2ban active:
  ```bash
  sudo fail2ban-client status
  ```

- [ ] SSH hardened:
  - [ ] Root login disabled
  - [ ] Password authentication disabled
  - [ ] Key-based auth only

- [ ] Services secured:
  - [ ] Database binds to localhost only
  - [ ] Redis binds to localhost only
  - [ ] Redis password protected

### Step 5: Application Verification

- [ ] Application running:
  ```bash
  systemctl status syndicat-tox
  # OR
  pm2 status
  ```

- [ ] Health check passing:
  ```bash
  bash scripts/health-check.sh
  ```

- [ ] Endpoints accessible:
  - [ ] `https://domain.com` loads
  - [ ] `https://domain.com/health` returns 200

### Step 6: Monitoring Setup

- [ ] Automated tasks configured:
  - [ ] Health checks running (every 5 minutes)
  - [ ] Backups scheduled (daily at 2 AM)
  - [ ] Log rotation active

- [ ] Logs accessible:
  - [ ] Application logs: `/var/www/syndicat-tox/logs/`
  - [ ] Health logs: `/var/log/syndicat-tox-health.log`
  - [ ] Nginx logs: `/var/log/nginx/`

### Step 7: Backup Verification

- [ ] Manual backup created:
  ```bash
  sudo bash scripts/backup.sh
  ```

- [ ] Backup verified:
  - [ ] Backup directory exists: `/var/backups/syndicat-tox/`
  - [ ] Database backup present
  - [ ] Configuration backup present
  - [ ] Manifest file present

- [ ] Restore tested (on test server):
  ```bash
  sudo bash scripts/restore.sh /path/to/backup
  ```

## Post-Deployment Checklist

### Functional Testing

- [ ] Registration works:
  - [ ] Can create new account (pseudo + PIN)
  - [ ] PIN hashing verified (Argon2id)
  - [ ] No email required

- [ ] Authentication works:
  - [ ] Can log in with pseudo + PIN
  - [ ] Sessions persist
  - [ ] Logout works
  - [ ] Account lockout works (5 failed attempts)

- [ ] Forum features work:
  - [ ] Can create thread
  - [ ] Can reply to thread
  - [ ] Can edit own content (within time window)
  - [ ] Can delete own content
  - [ ] Can report content

- [ ] Anonymization verified:
  - [ ] No IP addresses in logs
  - [ ] No IP addresses in database
  - [ ] X-Anonymous-ID header used for rate limiting
  - [ ] Nginx anonymization active

- [ ] Multi-language works:
  - [ ] French (fr) loads
  - [ ] Dutch (nl) loads
  - [ ] German (de) loads
  - [ ] English (en) loads
  - [ ] Language selector works

### Performance Testing

- [ ] Performance acceptable:
  - [ ] Page load < 3s on 3G
  - [ ] LCP < 2.5s
  - [ ] Initial bundle < 50KB
  - [ ] Works without JavaScript

- [ ] Resource usage normal:
  - [ ] CPU < 50% at rest
  - [ ] Memory < 70%
  - [ ] Disk usage < 50%

### Security Testing

- [ ] Security headers present:
  ```bash
  curl -I https://domain.com
  ```
  - [ ] Strict-Transport-Security
  - [ ] X-Frame-Options
  - [ ] X-Content-Type-Options
  - [ ] Content-Security-Policy

- [ ] Rate limiting works:
  - [ ] Excessive requests blocked
  - [ ] Per anonymous ID (not IP)

- [ ] CSRF protection works:
  - [ ] Invalid token rejected
  - [ ] Valid token accepted

- [ ] XSS protection works:
  - [ ] HTML sanitized in user content
  - [ ] Scripts not executed

### Compliance Verification

- [ ] GDPR compliance:
  - [ ] User data export works
  - [ ] Account deletion works
  - [ ] No unnecessary data collected
  - [ ] Data stored in Belgium only

- [ ] Accessibility:
  - [ ] Keyboard navigation works
  - [ ] Screen reader compatible
  - [ ] Color contrast acceptable
  - [ ] ARIA labels present

- [ ] Crisis resources accessible:
  - [ ] Belgian crisis hotlines visible
  - [ ] Always accessible (footer/header)
  - [ ] Links working

## Ongoing Maintenance Checklist

### Daily

- [ ] Check health logs:
  ```bash
  tail -50 /var/log/syndicat-tox-health.log
  ```

- [ ] Review error logs:
  ```bash
  grep -i error /var/www/syndicat-tox/logs/error.log | tail -20
  ```

- [ ] Verify backups ran:
  ```bash
  ls -lah /var/backups/syndicat-tox/ | head -10
  ```

### Weekly

- [ ] Run full health check:
  ```bash
  bash scripts/health-check.sh
  ```

- [ ] Review system resources:
  ```bash
  df -h
  free -h
  top
  ```

- [ ] Check for security alerts:
  ```bash
  grep -i fail /var/log/auth.log | tail -20
  sudo fail2ban-client status
  ```

- [ ] Review application logs for anomalies

### Monthly

- [ ] Update system packages:
  ```bash
  sudo apt update && sudo apt upgrade -y
  ```

- [ ] Review and archive old logs:
  ```bash
  cd /var/www/syndicat-tox/logs
  tar -czf archive-$(date +%Y%m).tar.gz *.log.{1,2,3}
  ```

- [ ] Clean old backups (> 30 days):
  ```bash
  # Automated, but verify
  ls -lah /var/backups/syndicat-tox/
  ```

- [ ] Test restore procedure (on test server)

### Quarterly

- [ ] Security audit:
  ```bash
  npm audit
  sudo lynis audit system
  ```

- [ ] Performance review:
  - [ ] Analyze slow query log
  - [ ] Review application metrics
  - [ ] Optimize if needed

- [ ] Capacity planning:
  - [ ] Review growth trends
  - [ ] Plan for scaling if needed

- [ ] Disaster recovery test:
  - [ ] Full restore on test server
  - [ ] Document any issues

## Update Deployment Checklist

### Pre-Update

- [ ] Code changes tested locally:
  ```bash
  npm test
  npm run lint
  ```

- [ ] All tests passing (530+ tests)

- [ ] Git repository clean:
  ```bash
  git status
  ```

- [ ] Changes committed and pushed

### Deployment

- [ ] Deployment script executed:
  ```bash
  sudo bash scripts/deploy.sh
  ```

- [ ] Deployment completed without errors

- [ ] Rollback not triggered

### Post-Update Verification

- [ ] Health check passing:
  ```bash
  bash scripts/health-check.sh
  ```

- [ ] Application accessible:
  ```bash
  curl https://domain.com/health
  ```

- [ ] New features working as expected

- [ ] No new errors in logs:
  ```bash
  tail -50 /var/www/syndicat-tox/logs/error.log
  ```

- [ ] Performance not degraded

## Emergency Procedures Checklist

### Service Outage

- [ ] Identify affected services:
  ```bash
  bash scripts/health-check.sh
  ```

- [ ] Attempt restart:
  ```bash
  sudo systemctl restart syndicat-tox nginx mariadb redis-server
  ```

- [ ] If persistent, restore from backup:
  ```bash
  sudo bash scripts/restore.sh /var/backups/syndicat-tox/backup-*
  ```

- [ ] Document incident

### Security Incident

- [ ] Isolate server:
  ```bash
  sudo systemctl stop syndicat-tox nginx
  ```

- [ ] Analyze logs for breach:
  ```bash
  grep -i "attack\|fail\|unauthorized" /var/log/auth.log /var/log/nginx/error.log
  ```

- [ ] Restore from clean backup

- [ ] Rotate all secrets (DB password, Redis password, Session secret)

- [ ] Re-harden security

- [ ] Document incident and response

### Database Corruption

- [ ] Stop application:
  ```bash
  sudo systemctl stop syndicat-tox
  ```

- [ ] Restore database:
  ```bash
  sudo bash scripts/restore.sh /var/backups/syndicat-tox/backup-*
  ```

- [ ] Verify integrity:
  ```bash
  mysql -u $DB_USER -p$DB_PASSWORD -e "CHECK TABLE users;" $DB_NAME
  ```

- [ ] Restart application:
  ```bash
  sudo systemctl start syndicat-tox
  ```

## Sign-Off

### Installation Sign-Off

Completed by: _______________
Date: _______________
Server IP: _______________
Domain: _______________

- [ ] All installation steps completed
- [ ] All verification steps passed
- [ ] Credentials securely stored
- [ ] Documentation reviewed
- [ ] Team notified of deployment

### Update Sign-Off

Update version: _______________
Deployed by: _______________
Date: _______________

- [ ] All pre-update checks completed
- [ ] Deployment successful
- [ ] Post-update verification passed
- [ ] No incidents reported
- [ ] Team notified of update

## Notes

Use this space to record any issues, deviations, or important information:

```
_________________________________________________________________________
_________________________________________________________________________
_________________________________________________________________________
_________________________________________________________________________
_________________________________________________________________________
```

---

**For detailed procedures, see:** `/Users/dragan/Documents/bonplan/DEPLOYMENT.md`
