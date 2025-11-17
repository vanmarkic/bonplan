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

# Disable root login (optional)
# sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config

# Configure fail2ban
systemctl enable fail2ban
systemctl start fail2ban

# Set proper file permissions
chmod 750 $APP_DIR
chmod 600 $APP_DIR/.env
chown -R syndicat:syndicat $APP_DIR

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
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Review .env file: $APP_DIR/.env"
echo "2. Review Nginx config: /etc/nginx/sites-available/syndicat-tox.conf"
echo "3. Test the application: curl https://${DOMAIN}/health"
echo "4. Monitor logs: tail -f $APP_DIR/logs/app.log"
echo "5. Check status: systemctl status syndicat-tox (or pm2 status)"
echo ""
echo -e "${RED}SECURITY REMINDERS:${NC}"
echo "- Backup your database regularly"
echo "- Keep all software updated"
echo "- Monitor logs for suspicious activity"
echo "- Never expose Redis or MariaDB to the internet"
echo "- Verify IP anonymization is working"
echo ""
