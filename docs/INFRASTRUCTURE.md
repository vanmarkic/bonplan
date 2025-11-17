# Infrastructure Documentation

Complete infrastructure setup and deployment guide for Le Syndicat des Tox.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Development Setup](#development-setup)
3. [Production Deployment](#production-deployment)
4. [Component Configuration](#component-configuration)
5. [Security Hardening](#security-hardening)
6. [Monitoring & Maintenance](#monitoring--maintenance)
7. [Backup & Recovery](#backup--recovery)
8. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### System Architecture

```
┌─────────────┐
│  Internet   │
└──────┬──────┘
       │
┌──────▼──────────┐
│   Cloudflare    │ (Optional DDoS protection)
│   DNS + CDN     │
└──────┬──────────┘
       │
┌──────▼──────────┐
│     Nginx       │ ← CRITICAL: IP Anonymization happens here
│  Reverse Proxy  │   - Strips all IP headers
└──────┬──────────┘   - Generates anonymous ID (one-way hash)
       │               - Rate limiting
       │
┌──────▼──────────┐
│   Node.js App   │ ← Express.js application
│   (Port 3000)   │   - Session management
└─────┬──┬────────┘   - Business logic
      │  │
      │  └──────────┐
      │             │
┌─────▼──────┐ ┌───▼──────┐
│  MariaDB   │ │  Redis   │
│  Database  │ │  Cache   │
└────────────┘ └──────────┘
```

### Data Flow

1. **Request arrives** → Nginx
2. **IP anonymization** → Nginx removes all IP headers, generates anonymous hash
3. **Rate limiting** → Based on anonymous ID
4. **Security headers** → CSP, HSTS, X-Frame-Options, etc.
5. **Proxy to Node.js** → Only anonymous ID passed
6. **Session check** → Redis session store
7. **Database query** → MariaDB with parameterized queries
8. **Response** → Through reverse proxy chain

---

## Development Setup

### Quick Start with Docker

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/bonplan.git
cd bonplan

# 2. Copy environment file
cp .env.example .env

# 3. Update .env with development values
# (Docker will generate defaults, but you can customize)

# 4. Start all services
docker-compose up -d

# 5. Check logs
docker-compose logs -f

# 6. Access application
# http://localhost:3000 (Node.js direct)
# http://localhost (via Nginx)
```

### Manual Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Setup environment
cp .env.example .env
# Edit .env with your values

# 3. Setup database
sudo bash scripts/setup-database.sh

# 4. Start Redis
sudo systemctl start redis-server

# 5. Run in development mode
npm run dev

# 6. Run tests
npm test
```

### Development Tools

```bash
# Watch mode for development
npm run dev

# Run specific tests
npm run test:unit -- tests/unit/models/User.test.js

# Lint code
npm run lint
npm run lint:fix

# Build assets
npm run build
```

---

## Production Deployment

### Prerequisites

- **Server**: Debian 11+ or Ubuntu 20.04+ (Belgian hosting required)
- **RAM**: Minimum 2GB, recommended 4GB
- **CPU**: Minimum 2 cores
- **Storage**: 20GB SSD minimum
- **Domain**: Registered domain with DNS access

### Automated Installation

```bash
# 1. Clone repository
git clone https://github.com/yourusername/bonplan.git
cd bonplan

# 2. Run installation script
sudo bash scripts/install.sh

# 3. Follow prompts for:
#    - Domain name
#    - SSL certificate setup
#    - Process manager choice (systemd vs PM2)
```

### Manual Production Setup

#### 1. System Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install MariaDB 10.11+
sudo apt install -y mariadb-server mariadb-client

# Install Redis
sudo apt install -y redis-server

# Install Nginx
sudo apt install -y nginx

# Install certbot for SSL
sudo apt install -y certbot python3-certbot-nginx

# Install PM2 (optional, alternative to systemd)
sudo npm install -g pm2
```

#### 2. Create Application User

```bash
sudo useradd -r -m -d /var/www/syndicat-tox -s /bin/bash syndicat
```

#### 3. Deploy Application

```bash
# Create directory
sudo mkdir -p /var/www/syndicat-tox
sudo chown syndicat:syndicat /var/www/syndicat-tox

# Clone or copy application
sudo -u syndicat git clone https://github.com/yourusername/bonplan.git /var/www/syndicat-tox

# Install dependencies
cd /var/www/syndicat-tox
sudo -u syndicat npm ci --only=production

# Build assets
sudo -u syndicat npm run build

# Setup environment
sudo -u syndicat cp .env.example .env
sudo -u syndicat nano .env  # Edit with secure values
sudo chmod 600 .env
```

#### 4. Configure Database

```bash
# Run database setup script
sudo bash scripts/setup-database.sh

# Or manually:
sudo mysql -u root -p < docs/DATABASE_SCHEMA.sql
```

#### 5. Configure Redis

```bash
# Copy configuration
sudo cp deployment/redis/redis.conf /etc/redis/redis-syndicat.conf

# Generate password
REDIS_PASSWORD=$(openssl rand -base64 24)
sudo sed -i "s/CHANGE_THIS_REDIS_PASSWORD/${REDIS_PASSWORD}/" /etc/redis/redis-syndicat.conf

# Create data directory
sudo mkdir -p /var/lib/redis/syndicat-tox
sudo chown redis:redis /var/lib/redis/syndicat-tox

# Update .env with password
echo "REDIS_PASSWORD=${REDIS_PASSWORD}" | sudo tee -a /var/www/syndicat-tox/.env

# Restart Redis
sudo systemctl restart redis-server
```

#### 6. Configure Nginx

```bash
# Copy configuration
sudo cp deployment/nginx/syndicat-tox.conf /etc/nginx/sites-available/

# Update domain name
sudo sed -i 's/syndicat-tox.be/your-domain.be/g' /etc/nginx/sites-available/syndicat-tox.conf

# Generate anonymous ID salt
NGINX_SALT=$(openssl rand -base64 32)
sudo sed -i "s/CHANGE_THIS_SALT_TO_RANDOM_STRING/${NGINX_SALT}/" /etc/nginx/sites-available/syndicat-tox.conf

# Enable site
sudo ln -s /etc/nginx/sites-available/syndicat-tox.conf /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# Get SSL certificate
sudo certbot --nginx -d your-domain.be

# Reload Nginx
sudo systemctl reload nginx
```

#### 7. Start Application

**Option A: Using systemd**

```bash
# Copy service file
sudo cp deployment/systemd/syndicat-tox.service /etc/systemd/system/

# Reload systemd
sudo systemctl daemon-reload

# Enable and start service
sudo systemctl enable syndicat-tox
sudo systemctl start syndicat-tox

# Check status
sudo systemctl status syndicat-tox

# View logs
sudo journalctl -u syndicat-tox -f
```

**Option B: Using PM2**

```bash
# Start application
cd /var/www/syndicat-tox
sudo -u syndicat pm2 start ecosystem.config.js --env production

# Save PM2 process list
sudo -u syndicat pm2 save

# Setup PM2 startup script
sudo pm2 startup systemd -u syndicat --hp /var/www/syndicat-tox

# Monitor
sudo -u syndicat pm2 monit
```

#### 8. Configure Firewall

```bash
# Allow SSH, HTTP, HTTPS
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# Enable firewall
sudo ufw --force enable

# Check status
sudo ufw status
```

---

## Component Configuration

### Environment Variables

All configuration is done through environment variables in `.env`:

```bash
# Generate secure secrets
openssl rand -base64 32  # SESSION_SECRET
openssl rand -base64 24  # DB_PASSWORD
openssl rand -base64 24  # REDIS_PASSWORD
```

Required variables:
- `SESSION_SECRET` - Cryptographic secret for sessions
- `DB_PASSWORD` - Database password
- `REDIS_PASSWORD` - Redis password
- `NODE_ENV` - Set to `production`

### MariaDB Configuration

**Security hardening:**

```bash
# Run security script
sudo mysql_secure_installation

# Recommended settings:
# - Set root password: YES
# - Remove anonymous users: YES
# - Disallow root login remotely: YES
# - Remove test database: YES
# - Reload privileges: YES
```

**Performance tuning** (`/etc/mysql/mariadb.conf.d/50-server.cnf`):

```ini
[mysqld]
# Connection settings
max_connections = 100
connect_timeout = 10

# Buffer pool (set to 70% of available RAM)
innodb_buffer_pool_size = 1G

# Character set
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci

# Security
local-infile = 0
skip-name-resolve = 1
```

### Redis Configuration

See `deployment/redis/redis.conf` for full configuration.

**Key security settings:**
- Bind to localhost only
- Require password authentication
- Disable dangerous commands
- Enable persistence (RDB + AOF)

### Nginx Configuration

**CRITICAL: IP Anonymization**

The Nginx configuration includes these critical security features:

1. **Anonymous ID Generation**
   ```nginx
   set $anonymous_id_source "${remote_addr}_RANDOM_SALT";
   set_md5 $anonymous_id "${anonymous_id_source}";
   ```

2. **IP Header Stripping**
   ```nginx
   proxy_set_header X-Real-IP "";
   proxy_set_header X-Forwarded-For "";
   # ... all IP headers removed
   proxy_set_header X-Anonymous-ID $anonymous_id;  # Only this
   ```

3. **Anonymous Logging**
   ```nginx
   log_format anonymous '$time_local "$request" '
                       '$status $body_bytes_sent '
                       '"$http_user_agent" '
                       'anonid=$anonymous_id';
   ```

**NEVER log IP addresses in Nginx or application logs!**

---

## Security Hardening

### SSL/TLS Configuration

```bash
# Obtain certificate
sudo certbot --nginx -d your-domain.be

# Auto-renewal (crontab)
0 0 * * * /usr/bin/certbot renew --quiet
```

### Fail2Ban

```bash
# Install
sudo apt install fail2ban

# Configure for Nginx
sudo cat > /etc/fail2ban/jail.local << EOF
[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
findtime = 600
bantime = 3600
EOF

# Restart
sudo systemctl restart fail2ban
```

### System Hardening

```bash
# Disable root SSH login
sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sudo systemctl restart sshd

# Enable automatic security updates
sudo apt install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades

# Configure sysctl for security
sudo cat >> /etc/sysctl.conf << EOF
# IP Spoofing protection
net.ipv4.conf.all.rp_filter = 1
net.ipv4.conf.default.rp_filter = 1

# Ignore ICMP redirects
net.ipv4.conf.all.accept_redirects = 0

# Disable source packet routing
net.ipv4.conf.all.accept_source_route = 0

# Log suspicious packets
net.ipv4.conf.all.log_martians = 1
EOF

sudo sysctl -p
```

---

## Monitoring & Maintenance

### Application Monitoring

```bash
# Check application status
sudo systemctl status syndicat-tox  # systemd
sudo -u syndicat pm2 status         # PM2

# View real-time logs
sudo journalctl -u syndicat-tox -f  # systemd
sudo -u syndicat pm2 logs           # PM2

# Check disk usage
df -h

# Check memory
free -h

# Check CPU
top
```

### Database Monitoring

```bash
# Connect to database
sudo mysql -u root -p

# Check connections
SHOW PROCESSLIST;

# Check database size
SELECT
  table_schema AS 'Database',
  ROUND(SUM(data_length + index_length) / 1024 / 1024, 2) AS 'Size (MB)'
FROM information_schema.TABLES
GROUP BY table_schema;

# Optimize tables (monthly)
OPTIMIZE TABLE users, threads, replies;
```

### Redis Monitoring

```bash
# Connect to Redis
redis-cli -a YOUR_REDIS_PASSWORD

# Check info
INFO

# Check memory usage
INFO memory

# Monitor commands in real-time
MONITOR

# Check slow log
SLOWLOG GET 10
```

### Log Rotation

Configured in `/etc/logrotate.d/syndicat-tox`:

```
/var/www/syndicat-tox/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 syndicat syndicat
    sharedscripts
}
```

### Health Checks

```bash
# Application health
curl https://your-domain.be/health

# Expected response:
# {"status":"ok","timestamp":"...","uptime":...}

# Database health
sudo mysql -u syndicat_app -p syndicat_tox -e "SELECT 1;"

# Redis health
redis-cli -a YOUR_PASSWORD ping
```

---

## Backup & Recovery

### Automated Backup Script

Create `/usr/local/bin/backup-syndicat.sh`:

```bash
#!/bin/bash
BACKUP_DIR="/var/backups/syndicat-tox"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR

# Backup database
mysqldump -u root -p syndicat_tox | gzip > $BACKUP_DIR/db-$DATE.sql.gz

# Backup Redis
redis-cli -a YOUR_PASSWORD SAVE
cp /var/lib/redis/syndicat-tox/syndicat-tox-dump.rdb $BACKUP_DIR/redis-$DATE.rdb

# Backup application files
tar -czf $BACKUP_DIR/app-$DATE.tar.gz /var/www/syndicat-tox/.env

# Keep only last 30 days
find $BACKUP_DIR -type f -mtime +30 -delete
```

Schedule with cron:
```bash
0 2 * * * /usr/local/bin/backup-syndicat.sh
```

### Restore Procedures

**Restore Database:**
```bash
gunzip < backup.sql.gz | mysql -u root -p syndicat_tox
```

**Restore Redis:**
```bash
sudo systemctl stop redis-server
sudo cp backup.rdb /var/lib/redis/syndicat-tox/syndicat-tox-dump.rdb
sudo chown redis:redis /var/lib/redis/syndicat-tox/syndicat-tox-dump.rdb
sudo systemctl start redis-server
```

---

## Troubleshooting

### Application Won't Start

```bash
# Check logs
sudo journalctl -u syndicat-tox -n 100

# Check if ports are in use
sudo netstat -tulpn | grep 3000

# Check environment variables
sudo -u syndicat cat /var/www/syndicat-tox/.env

# Test database connection
sudo -u syndicat mysql -u syndicat_app -p -h localhost syndicat_tox -e "SELECT 1;"

# Test Redis connection
redis-cli -a YOUR_PASSWORD ping
```

### High Memory Usage

```bash
# Check Node.js memory
sudo -u syndicat pm2 monit

# Restart application
sudo systemctl restart syndicat-tox
```

### Database Connection Issues

```bash
# Check MariaDB status
sudo systemctl status mariadb

# Check connections
sudo mysql -u root -p -e "SHOW PROCESSLIST;"

# Restart MariaDB
sudo systemctl restart mariadb
```

### IP Anonymization Not Working

```bash
# Check Nginx config
sudo nginx -t

# View Nginx logs
sudo tail -f /var/log/nginx/syndicat-tox-access.log

# Should see "anonid=..." not IP addresses

# Check Node.js logs for IP leakage
sudo grep -r "remote_addr\|x-forwarded\|x-real-ip" /var/www/syndicat-tox/logs/
# Should return no results!
```

### SSL Certificate Issues

```bash
# Test SSL
sudo certbot certificates

# Renew manually
sudo certbot renew --dry-run
sudo certbot renew

# Check certificate expiry
echo | openssl s_client -servername your-domain.be -connect your-domain.be:443 2>/dev/null | openssl x509 -noout -dates
```

---

## Emergency Procedures

### Enable Maintenance Mode

```bash
# Stop application
sudo systemctl stop syndicat-tox

# Create maintenance page
sudo cat > /var/www/syndicat-tox/public/maintenance.html << EOF
<!DOCTYPE html>
<html>
<head><title>Maintenance</title></head>
<body>
  <h1>Le Syndicat des Tox</h1>
  <p>Le site est en maintenance. Nous revenons bientôt.</p>
</body>
</html>
EOF

# Configure Nginx to serve maintenance page
# (Edit /etc/nginx/sites-available/syndicat-tox.conf)
```

### Security Incident Response

1. **Immediately flush all sessions**
   ```bash
   redis-cli -a YOUR_PASSWORD FLUSHDB
   ```

2. **Review logs for suspicious activity**
   ```bash
   sudo grep -E "failed|error|unauthorized" /var/www/syndicat-tox/logs/app.log
   ```

3. **Check for IP leakage**
   ```bash
   sudo grep -rE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" /var/www/syndicat-tox/logs/
   ```

4. **Rotate secrets**
   ```bash
   # Generate new SESSION_SECRET
   openssl rand -base64 32
   # Update .env and restart
   ```

---

## Support & Resources

- **Documentation**: `/docs` directory
- **Community**: (Belgian hosting provider support)
- **Emergency Contacts**: See .env EMERGENCY_CONTACT variables

**Remember**: This platform serves vulnerable individuals. Handle with care.
