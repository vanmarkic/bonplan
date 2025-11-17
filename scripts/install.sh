#!/bin/bash
# ============================================
# Le Syndicat des Tox - Installation Script
# ============================================
# Complete setup for production deployment on Debian/Ubuntu
# Run as: sudo bash scripts/install.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo "============================================"
echo "Le Syndicat des Tox - Production Installation"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Detect OS
if [ -f /etc/debian_version ]; then
    OS="debian"
    echo -e "${GREEN}Detected Debian/Ubuntu system${NC}"
else
    echo -e "${RED}Error: This script only supports Debian/Ubuntu${NC}"
    exit 1
fi

# ============================================
# Step 1: Update System
# ============================================
echo ""
echo -e "${BLUE}Step 1: Updating system packages...${NC}"
apt update && apt upgrade -y

# ============================================
# Step 2: Install Dependencies
# ============================================
echo ""
echo -e "${BLUE}Step 2: Installing dependencies...${NC}"

# Install Node.js 20 LTS
if ! command -v node &> /dev/null; then
    echo "Installing Node.js 20 LTS..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi

# Install MariaDB
if ! command -v mysql &> /dev/null; then
    echo "Installing MariaDB..."
    apt install -y mariadb-server mariadb-client
    systemctl enable mariadb
    systemctl start mariadb
fi

# Install Redis
if ! command -v redis-server &> /dev/null; then
    echo "Installing Redis..."
    apt install -y redis-server
    systemctl enable redis-server
    systemctl start redis-server
fi

# Install Nginx
if ! command -v nginx &> /dev/null; then
    echo "Installing Nginx..."
    apt install -y nginx
    systemctl enable nginx
fi

# Install other tools
apt install -y git curl wget ufw fail2ban certbot python3-certbot-nginx

# Install PM2 globally
if ! command -v pm2 &> /dev/null; then
    echo "Installing PM2..."
    npm install -g pm2
fi

# ============================================
# Step 3: Create Application User
# ============================================
echo ""
echo -e "${BLUE}Step 3: Creating application user...${NC}"

if ! id -u syndicat &> /dev/null; then
    useradd -r -m -d /var/www/syndicat-tox -s /bin/bash syndicat
    echo -e "${GREEN}Created user 'syndicat'${NC}"
else
    echo -e "${YELLOW}User 'syndicat' already exists${NC}"
fi

# ============================================
# Step 4: Setup Application Directory
# ============================================
echo ""
echo -e "${BLUE}Step 4: Setting up application directory...${NC}"

APP_DIR="/var/www/syndicat-tox"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs

# Copy application files
if [ -d "./src" ]; then
    echo "Copying application files..."
    cp -r ./src $APP_DIR/
    cp -r ./views $APP_DIR/
    cp -r ./public $APP_DIR/
    cp -r ./config $APP_DIR/
    cp package*.json $APP_DIR/
    cp ecosystem.config.js $APP_DIR/
fi

# Set ownership
chown -R syndicat:syndicat $APP_DIR

# ============================================
# Step 5: Install Node.js Dependencies
# ============================================
echo ""
echo -e "${BLUE}Step 5: Installing Node.js dependencies...${NC}"

cd $APP_DIR
sudo -u syndicat npm ci --only=production

# Build assets
sudo -u syndicat npm run build

# ============================================
# Step 6: Configure Environment
# ============================================
echo ""
echo -e "${BLUE}Step 6: Configuring environment...${NC}"

if [ ! -f $APP_DIR/.env ]; then
    cp .env.example $APP_DIR/.env

    # Generate secrets
    SESSION_SECRET=$(openssl rand -base64 32)
    DB_PASSWORD=$(openssl rand -base64 24)
    REDIS_PASSWORD=$(openssl rand -base64 24)

    # Update .env
    sed -i "s/SESSION_SECRET=.*/SESSION_SECRET=${SESSION_SECRET}/" $APP_DIR/.env
    sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" $APP_DIR/.env
    sed -i "s/REDIS_PASSWORD=.*/REDIS_PASSWORD=${REDIS_PASSWORD}/" $APP_DIR/.env

    chown syndicat:syndicat $APP_DIR/.env
    chmod 600 $APP_DIR/.env

    echo -e "${GREEN}Generated environment configuration${NC}"
    echo -e "${YELLOW}DB Password: ${DB_PASSWORD}${NC}"
    echo -e "${YELLOW}Redis Password: ${REDIS_PASSWORD}${NC}"
    echo -e "${YELLOW}Session Secret: ${SESSION_SECRET}${NC}"
    echo ""
    echo -e "${RED}IMPORTANT: Save these credentials securely!${NC}"
fi

# ============================================
# Step 7: Configure MariaDB
# ============================================
echo ""
echo -e "${BLUE}Step 7: Configuring database...${NC}"

# Run mysql_secure_installation
echo "Run 'mysql_secure_installation' manually to secure MariaDB"

# Setup database
bash scripts/setup-database.sh

# ============================================
# Step 8: Configure Redis
# ============================================
echo ""
echo -e "${BLUE}Step 8: Configuring Redis...${NC}"

# Copy Redis config
cp deployment/redis/redis.conf /etc/redis/redis-syndicat.conf

# Update Redis password
REDIS_PASSWORD=$(grep REDIS_PASSWORD $APP_DIR/.env | cut -d '=' -f2)
sed -i "s/requirepass.*/requirepass ${REDIS_PASSWORD}/" /etc/redis/redis-syndicat.conf

# Create Redis data directory
mkdir -p /var/lib/redis/syndicat-tox
chown redis:redis /var/lib/redis/syndicat-tox

# Restart Redis
systemctl restart redis-server

# ============================================
# Step 9: Configure Nginx
# ============================================
echo ""
echo -e "${BLUE}Step 9: Configuring Nginx...${NC}"

# Copy Nginx config
cp deployment/nginx/syndicat-tox.conf /etc/nginx/sites-available/syndicat-tox.conf

# Update server name
read -p "Enter your domain name (e.g., syndicat-tox.be): " DOMAIN
sed -i "s/syndicat-tox.be/${DOMAIN}/g" /etc/nginx/sites-available/syndicat-tox.conf

# Generate random salt for anonymous ID
NGINX_SALT=$(openssl rand -base64 32)
sed -i "s/CHANGE_THIS_SALT_TO_RANDOM_STRING/${NGINX_SALT}/" /etc/nginx/sites-available/syndicat-tox.conf

# Enable site
ln -sf /etc/nginx/sites-available/syndicat-tox.conf /etc/nginx/sites-enabled/

# Test Nginx config
nginx -t

# ============================================
# Step 10: Setup SSL with Let's Encrypt
# ============================================
echo ""
echo -e "${BLUE}Step 10: Setting up SSL certificate...${NC}"

read -p "Do you want to setup SSL with Let's Encrypt? (y/n): " SETUP_SSL

if [ "$SETUP_SSL" = "y" ]; then
    certbot --nginx -d $DOMAIN
fi

# ============================================
# Step 11: Configure Firewall
# ============================================
echo ""
echo -e "${BLUE}Step 11: Configuring firewall...${NC}"

ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw --force enable

# ============================================
# Step 12: Setup Systemd Service or PM2
# ============================================
echo ""
echo -e "${BLUE}Step 12: Setting up process manager...${NC}"

read -p "Use systemd (1) or PM2 (2)? [1/2]: " PM_CHOICE

if [ "$PM_CHOICE" = "1" ]; then
    # Setup systemd
    cp deployment/systemd/syndicat-tox.service /etc/systemd/system/
    systemctl daemon-reload
    systemctl enable syndicat-tox
    systemctl start syndicat-tox
    echo -e "${GREEN}Started with systemd${NC}"
else
    # Setup PM2
    cd $APP_DIR
    sudo -u syndicat pm2 start ecosystem.config.js --env production
    sudo -u syndicat pm2 save
    pm2 startup systemd -u syndicat --hp /var/www/syndicat-tox
    echo -e "${GREEN}Started with PM2${NC}"
fi

# ============================================
# Step 13: Configure Log Rotation
# ============================================
echo ""
echo -e "${BLUE}Step 13: Configuring log rotation...${NC}"

cat > /etc/logrotate.d/syndicat-tox << EOF
/var/www/syndicat-tox/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    notifempty
    create 0640 syndicat syndicat
    sharedscripts
    postrotate
        systemctl reload syndicat-tox > /dev/null 2>&1 || pm2 reload syndicat-tox > /dev/null 2>&1 || true
    endscript
}
EOF

# ============================================
# Step 14: Final Security Hardening
# ============================================
echo ""
echo -e "${BLUE}Step 14: Security hardening...${NC}"

# Configure SSH security
echo "Hardening SSH configuration..."
sed -i 's/#PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh

# Configure fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Create fail2ban jail for Nginx
cat > /etc/fail2ban/jail.d/nginx.conf << 'EOF'
[nginx-http-auth]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log

[nginx-limit-req]
enabled = true
port = http,https
logpath = /var/log/nginx/error.log
maxretry = 10
EOF

systemctl reload fail2ban

# Configure firewall with rate limiting
echo "Configuring firewall with rate limiting..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing

# Allow SSH with rate limiting
ufw limit 22/tcp comment 'SSH with rate limiting'

# Allow HTTP/HTTPS with rate limiting
ufw limit 80/tcp comment 'HTTP'
ufw limit 443/tcp comment 'HTTPS'

# Enable firewall
ufw --force enable

# Set proper file permissions
chmod 750 $APP_DIR
chmod 600 $APP_DIR/.env
chmod 700 $APP_DIR/logs
chown -R syndicat:syndicat $APP_DIR

# Secure MySQL installation
echo "Securing MariaDB..."
mysql -e "DELETE FROM mysql.user WHERE User='';"
mysql -e "DELETE FROM mysql.user WHERE User='root' AND Host NOT IN ('localhost', '127.0.0.1', '::1');"
mysql -e "DROP DATABASE IF EXISTS test;"
mysql -e "DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';"
mysql -e "FLUSH PRIVILEGES;"

# Set strict MySQL configuration
cat >> /etc/mysql/mariadb.conf.d/99-syndicat-security.cnf << EOF
[mysqld]
# Security hardening
local-infile=0
skip-symbolic-links=1
bind-address=127.0.0.1

# Performance tuning
max_connections=100
max_connect_errors=100
connect_timeout=10
wait_timeout=600
max_allowed_packet=16M

# Logging
log_error=/var/log/mysql/error.log
slow_query_log=1
slow_query_log_file=/var/log/mysql/slow.log
long_query_time=2
EOF

systemctl restart mariadb

# Configure Redis security
echo "Securing Redis..."
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf
sed -i 's/# maxmemory-policy.*/maxmemory-policy allkeys-lru/' /etc/redis/redis.conf
sed -i 's/# maxmemory .*/maxmemory 256mb/' /etc/redis/redis.conf

systemctl restart redis-server

# Disable unnecessary services
echo "Disabling unnecessary services..."
systemctl disable avahi-daemon 2>/dev/null || true
systemctl stop avahi-daemon 2>/dev/null || true

# Set kernel security parameters
echo "Configuring kernel security parameters..."
cat >> /etc/sysctl.conf << EOF

# Syndicat Tox Security Settings
# Network security
net.ipv4.conf.all.rp_filter=1
net.ipv4.conf.default.rp_filter=1
net.ipv4.tcp_syncookies=1
net.ipv4.conf.all.accept_source_route=0
net.ipv4.conf.default.accept_source_route=0
net.ipv4.conf.all.accept_redirects=0
net.ipv4.conf.default.accept_redirects=0
net.ipv4.conf.all.secure_redirects=0
net.ipv4.conf.default.secure_redirects=0
net.ipv4.icmp_echo_ignore_broadcasts=1
net.ipv4.icmp_ignore_bogus_error_responses=1
net.ipv4.conf.all.log_martians=1
net.ipv4.conf.default.log_martians=1
net.ipv6.conf.all.disable_ipv6=0
net.ipv6.conf.default.disable_ipv6=0

# Kernel hardening
kernel.dmesg_restrict=1
kernel.kptr_restrict=2
kernel.yama.ptrace_scope=1
EOF

sysctl -p

# Setup automatic security updates
echo "Configuring automatic security updates..."
apt install -y unattended-upgrades apt-listchanges

cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::AutoFixInterruptedDpkg "true";
Unattended-Upgrade::MinimalSteps "true";
Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
EOF

systemctl enable unattended-upgrades
systemctl start unattended-upgrades

# ============================================
# Step 15: Setup Monitoring and Backups
# ============================================
echo ""
echo -e "${BLUE}Step 15: Setting up monitoring and backups...${NC}"

# Setup cron job for health checks
echo "Setting up health check cron job..."
cat > /etc/cron.d/syndicat-tox-health << EOF
# Health check every 5 minutes
*/5 * * * * root /var/www/syndicat-tox/scripts/health-check.sh --quiet --alert
EOF

# Setup cron job for daily backups
echo "Setting up daily backup cron job..."
cat > /etc/cron.d/syndicat-tox-backup << EOF
# Daily backup at 2 AM
0 2 * * * root /var/www/syndicat-tox/scripts/backup.sh
EOF

# Create backup directory
mkdir -p /var/backups/syndicat-tox
chmod 700 /var/backups/syndicat-tox

# Make scripts executable
chmod +x $APP_DIR/scripts/*.sh 2>/dev/null || true

# ============================================
# Installation Complete!
# ============================================
echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Installation completed successfully!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "Application: https://${DOMAIN}"
echo -e "Logs: $APP_DIR/logs/"
echo -e "Health checks: /var/log/syndicat-tox-health.log"
echo -e "Backups: /var/backups/syndicat-tox/"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review .env file: $APP_DIR/.env"
echo "2. Review Nginx config: /etc/nginx/sites-available/syndicat-tox.conf"
echo "3. Test the application: curl https://${DOMAIN}/health"
echo "4. Monitor logs: tail -f $APP_DIR/logs/app.log"
echo "5. Check status: systemctl status syndicat-tox (or pm2 status)"
echo "6. Run health check: bash $APP_DIR/scripts/health-check.sh"
echo "7. Test backup: sudo bash $APP_DIR/scripts/backup.sh"
echo ""
echo -e "${YELLOW}Automation configured:${NC}"
echo "- Health checks run every 5 minutes"
echo "- Backups run daily at 2 AM"
echo "- Security updates install automatically"
echo "- Log rotation configured for 30 days"
echo ""
echo -e "${RED}SECURITY REMINDERS:${NC}"
echo "- Backup your database regularly (automated)"
echo "- Keep all software updated (automated)"
echo "- Monitor logs for suspicious activity"
echo "- Never expose Redis or MariaDB to the internet"
echo "- Verify IP anonymization is working"
echo "- Store backup encryption key securely"
echo "- Test disaster recovery procedures"
echo ""
echo -e "${GREEN}Deployment automation ready!${NC}"
echo "To deploy updates: sudo bash $APP_DIR/scripts/deploy.sh"
echo ""
