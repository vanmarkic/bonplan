# Le Syndicat des Tox - Infrastructure Requirements

## Phase 1: Development Environment Setup

### Required Infrastructure Components

#### 1. Development Machine Requirements

**Minimum Specifications:**
```
CPU: 2 cores (4 recommended)
RAM: 4GB (8GB recommended)
Storage: 10GB free space
OS: Linux (Ubuntu 22.04 LTS), macOS 12+, or Windows 11 with WSL2
```

#### 2. Core Services (Local Development)

##### A. Node.js Environment
```bash
Version: 20.x LTS (current: 20.11+)
Package Manager: npm 10+ or pnpm 8+

Installation (Ubuntu/Debian):
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

Verify:
node --version  # Should show v20.x.x
npm --version   # Should show 10.x.x
```

##### B. MariaDB Database
```bash
Version: 10.11+ (LTS)
Storage Engine: InnoDB
Charset: utf8mb4

Installation (Ubuntu/Debian):
sudo apt-get install mariadb-server mariadb-client
sudo mysql_secure_installation

Configuration:
sudo nano /etc/mysql/mariadb.conf.d/50-server.cnf
# Add/modify:
character-set-server = utf8mb4
collation-server = utf8mb4_unicode_ci
max_connections = 100
innodb_buffer_pool_size = 256M  # Adjust based on available RAM

Create Application Database:
sudo mysql -u root -p
CREATE DATABASE syndicat_tox CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'syndicat_app'@'localhost' IDENTIFIED BY 'SECURE_PASSWORD_HERE';
GRANT SELECT, INSERT, UPDATE, DELETE ON syndicat_tox.* TO 'syndicat_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

##### C. Redis Cache/Session Store
```bash
Version: 7.x (latest stable)

Installation (Ubuntu/Debian):
sudo apt-get install redis-server

Configuration:
sudo nano /etc/redis/redis.conf
# Modify these settings:
bind 127.0.0.1 ::1
protected-mode yes
requirepass YOUR_STRONG_REDIS_PASSWORD_HERE
maxmemory 256mb
maxmemory-policy allkeys-lru

# Restart Redis:
sudo systemctl restart redis-server
sudo systemctl enable redis-server

Verify:
redis-cli ping
# Should return: PONG
```

##### D. Nginx (Development Proxy)
```bash
Version: 1.24+

Installation (Ubuntu/Debian):
sudo apt-get install nginx

Configuration for local dev:
sudo nano /etc/nginx/sites-available/syndicat-tox-dev

# Paste configuration (see below)

sudo ln -s /etc/nginx/sites-available/syndicat-tox-dev /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

**Nginx Development Configuration:**
```nginx
# /etc/nginx/sites-available/syndicat-tox-dev
server {
    listen 8080;
    server_name localhost;

    # Anonymization layer
    proxy_set_header X-Real-IP "";
    proxy_set_header X-Forwarded-For "";
    proxy_set_header CF-Connecting-IP "";

    # Anonymous identifier for rate limiting
    set $anon_id $remote_addr;
    set_md5 $anon_hash "$anon_id$server_name";
    proxy_set_header X-Anonymous-ID $anon_hash;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Connection "";
        proxy_buffering off;
    }

    # Static assets (for production testing)
    location /public {
        proxy_pass http://127.0.0.1:3000;
        proxy_cache_valid 200 7d;
    }

    # Disable logging in dev (practice for production)
    access_log off;
    error_log /var/log/nginx/syndicat-tox-error.log error;
}
```

#### 3. Development Tools

##### A. Git
```bash
sudo apt-get install git
git config --global user.name "Your Name"
git config --global user.email "your@email.com"
```

##### B. Database Management Tools
```bash
# DBeaver (GUI - optional but recommended)
wget -O dbeaver.deb https://dbeaver.io/files/dbeaver-ce_latest_amd64.deb
sudo dpkg -i dbeaver.deb

# Or use mycli (CLI)
pip install mycli
mycli -u syndicat_app -p syndicat_tox
```

##### C. Redis Management Tools
```bash
# redis-cli (included with redis-server)
redis-cli -a YOUR_REDIS_PASSWORD

# Or RedisInsight (GUI - optional)
# Download from: https://redis.com/redis-enterprise/redis-insight/
```

---

## Phase 1: Project Setup

### Step 1: Clone and Install Dependencies

```bash
cd /home/user/bonplan
npm install

# Verify no vulnerabilities
npm audit
```

### Step 2: Configure Environment

```bash
# Copy example environment file
cp .env.example .env

# Edit with your local settings
nano .env
```

**Required Environment Variables (.env):**
```bash
# Environment
NODE_ENV=development

# Server
PORT=3000
HOST=127.0.0.1

# Database
DB_HOST=localhost
DB_PORT=3306
DB_NAME=syndicat_tox
DB_USER=syndicat_app
DB_PASSWORD=your_secure_database_password_here

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here
REDIS_DB=0

# Session Secret (generate with: openssl rand -base64 32)
SESSION_SECRET=generate_a_random_32_byte_base64_string_here

# Security
CSRF_SECRET=another_random_secret_here

# Logging
LOG_LEVEL=debug
```

### Step 3: Initialize Database Schema

```bash
# Run the database schema
mysql -u syndicat_app -p syndicat_tox < docs/DATABASE_SCHEMA.sql

# Verify tables were created
mysql -u syndicat_app -p syndicat_tox -e "SHOW TABLES;"
```

### Step 4: Verify All Services

```bash
# Check MariaDB
sudo systemctl status mariadb
mysql -u syndicat_app -p syndicat_tox -e "SELECT 1;"

# Check Redis
sudo systemctl status redis-server
redis-cli -a YOUR_PASSWORD ping

# Check Nginx
sudo systemctl status nginx
curl -I http://localhost:8080
```

---

## Infrastructure for Production (Future Reference)

### Hosting Requirements

**Location:** Belgium-based hosting (GDPR compliance)

**Recommended Providers:**
- **OVH Belgium** - Belgian datacenter in Brussels
- **Combell** - Belgian hosting company
- **Nucleus** - Belgian VPS provider
- **Ikoula Belgium** - European hosting with BE datacenter

**Server Specifications (Small Scale - 100-500 users):**
```
CPU: 4 vCores
RAM: 8GB
Storage: 50GB SSD
Bandwidth: 1TB/month
OS: Ubuntu 22.04 LTS
```

**Server Specifications (Medium Scale - 500-5000 users):**
```
CPU: 8 vCores
RAM: 16GB
Storage: 100GB SSD
Bandwidth: 5TB/month
OS: Ubuntu 22.04 LTS
Load Balancer: Optional but recommended
```

### Production Services Stack

```
[Cloudflare] → [Nginx (Anonymization)] → [Node.js App] → [MariaDB]
                                                        → [Redis]

Cloudflare:
- DDoS protection
- SSL/TLS termination
- Basic caching (static assets only)
- DO NOT use analytics/tracking features

Nginx:
- Reverse proxy
- IP anonymization
- Rate limiting (backup layer)
- SSL/TLS (if not using Cloudflare)

Node.js App:
- 2+ instances for redundancy
- PM2 process manager
- Automatic restart on failure

MariaDB:
- Daily encrypted backups
- Binary logging for point-in-time recovery
- Replication (optional for larger scale)

Redis:
- Persistence enabled (AOF)
- Password protected
- Regular snapshots
```

### SSL/TLS Certificate

**For Production:**
```bash
# Using Let's Encrypt (free)
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d syndicat-tox.be

# Auto-renewal is configured by certbot
```

### Monitoring (Privacy-Preserving)

**What to Monitor:**
- Server resource usage (CPU, RAM, disk)
- Application uptime
- Database connection pool
- Redis memory usage
- Response times (aggregated, no user data)
- Error rates

**What NOT to Monitor:**
- User IP addresses
- Individual user behavior
- Request paths with user identifiers
- Session details
- Any personally identifiable information

**Recommended Tools:**
```bash
# Prometheus + Grafana (self-hosted)
# Netdata (real-time monitoring)
# Custom healthcheck endpoint at /health
```

---

## Security Infrastructure

### 1. Firewall Configuration

```bash
# UFW (Uncomplicated Firewall) for Ubuntu
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp    # SSH (restrict to your IP in production)
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable

# Verify
sudo ufw status verbose
```

### 2. Fail2Ban (Brute Force Protection at SSH Level)

```bash
sudo apt-get install fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local

# Configure SSH protection
[sshd]
enabled = true
port = 22
logpath = /var/log/auth.log
maxretry = 3
bantime = 3600

sudo systemctl restart fail2ban
```

### 3. Automatic Security Updates

```bash
sudo apt-get install unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

### 4. Database Backups

```bash
# Create backup script
sudo nano /usr/local/bin/backup-syndicat-tox.sh
```

**Backup Script:**
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/syndicat-tox"
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/syndicat_tox_$DATE.sql.gz"

mkdir -p $BACKUP_DIR

# Dump database
mysqldump -u syndicat_app -p'YOUR_PASSWORD' syndicat_tox | gzip > $BACKUP_FILE

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

# Verify backup was created
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup successful: $BACKUP_FILE"
else
    echo "Backup FAILED" >&2
    exit 1
fi
```

```bash
# Make executable
sudo chmod +x /usr/local/bin/backup-syndicat-tox.sh

# Add to crontab (daily at 3 AM)
sudo crontab -e
# Add line:
0 3 * * * /usr/local/bin/backup-syndicat-tox.sh >> /var/log/syndicat-backup.log 2>&1
```

---

## Development Workflow Infrastructure

### 1. Git Workflow

```bash
# Main branches
main              # Production-ready code
develop           # Integration branch
feature/*         # Feature branches
hotfix/*          # Emergency fixes
```

### 2. CI/CD (Future - Optional)

**GitHub Actions Example:**
```yaml
# .github/workflows/test.yml
name: Test Suite
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm ci
      - run: npm test
```

### 3. Testing Infrastructure

```bash
# Run tests locally
npm run test:unit           # Unit tests only
npm run test:integration    # Integration tests
npm run test:security       # Security tests
npm run test:a11y          # Accessibility tests
npm test                    # All tests
```

---

## Cost Estimate (Monthly)

### Development (Local)
```
Developer machines: $0 (existing hardware)
Electricity: ~$5-10/month
Total: ~$10/month
```

### Small Production Deployment (100-500 users)
```
VPS (OVH Belgium - VPS Value): €8/month
Domain (syndicat-tox.be): €15/year (~€1.25/month)
Cloudflare (Free plan): €0
Backups (OVH - 50GB): €3/month
Total: ~€12/month (~€144/year)
```

### Medium Production Deployment (500-5000 users)
```
VPS (OVH Belgium - VPS Elite): €25/month
Domain: €1.25/month
Cloudflare (Free plan): €0
Backups (100GB): €5/month
Monitoring: €0 (self-hosted)
Total: ~€31/month (~€372/year)
```

---

## Next Steps for Phase 1 Implementation

1. ✅ **Install all required services** (Node.js, MariaDB, Redis, Nginx)
2. ✅ **Configure environment** (create .env file with secrets)
3. ✅ **Initialize database** (run schema)
4. ⏳ **Implement authentication system** (next step)
5. ⏳ **Implement session management**
6. ⏳ **Add core security middleware**
7. ⏳ **Create basic routes and views**
8. ⏳ **Write tests for auth flow**

---

## Emergency Contacts & Resources

**Belgian Crisis Resources:**
- Centre de Prévention du Suicide: 0800 32 123 (24/7)
- Druglijn: 078 15 10 20
- Infor-Drogues: 02 227 52 52

**Technical Support:**
- MariaDB Documentation: https://mariadb.org/documentation/
- Redis Documentation: https://redis.io/documentation
- Node.js Documentation: https://nodejs.org/docs/
- Express.js Guide: https://expressjs.com/guide/

**Security Resources:**
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Node.js Security Best Practices: https://nodejs.org/en/docs/guides/security/
- Belgian Privacy Commission: https://www.privacycommission.be/

---

**Remember:** This infrastructure serves vulnerable people. Every component must prioritize their anonymity, safety, and privacy above all else.
