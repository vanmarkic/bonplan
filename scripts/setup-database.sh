#!/bin/bash
# ============================================
# Le Syndicat des Tox - Database Setup Script
# ============================================
# This script creates the database, users, and applies schema
# Run as: sudo bash scripts/setup-database.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "============================================"
echo "Le Syndicat des Tox - Database Setup"
echo "============================================"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: This script must be run as root (use sudo)${NC}"
    exit 1
fi

# Check if MariaDB/MySQL is installed
if ! command -v mysql &> /dev/null; then
    echo -e "${RED}Error: MariaDB/MySQL is not installed${NC}"
    echo "Install with: apt install mariadb-server"
    exit 1
fi

# Load environment variables
if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
else
    echo -e "${YELLOW}Warning: .env file not found, using defaults${NC}"
fi

# Database configuration
DB_NAME="${DB_NAME:-syndicat_tox}"
DB_USER="${DB_USER:-syndicat_app}"
DB_PASSWORD="${DB_PASSWORD:-}"
DB_HOST="${DB_HOST:-localhost}"

# Generate secure password if not provided
if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(openssl rand -base64 24)
    echo -e "${YELLOW}Generated database password: ${DB_PASSWORD}${NC}"
    echo -e "${YELLOW}Save this to your .env file!${NC}"
fi

# Test database connection
echo -e "${GREEN}Testing database connection...${NC}"
if ! mysql -u root -p -e "SELECT 1;" &> /dev/null; then
    echo -e "${RED}Error: Cannot connect to database as root${NC}"
    echo "Make sure MariaDB is running: systemctl status mariadb"
    exit 1
fi

# Prompt for MySQL root password
echo ""
read -sp "Enter MySQL root password: " MYSQL_ROOT_PASSWORD
echo ""

# Create database
echo -e "${GREEN}Creating database '${DB_NAME}'...${NC}"
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" << EOF
CREATE DATABASE IF NOT EXISTS ${DB_NAME}
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
EOF

# Create application user
echo -e "${GREEN}Creating database user '${DB_USER}'...${NC}"
mysql -u root -p"${MYSQL_ROOT_PASSWORD}" << EOF
-- Drop user if exists (for clean reinstall)
DROP USER IF EXISTS '${DB_USER}'@'${DB_HOST}';

-- Create user with strong password
CREATE USER '${DB_USER}'@'${DB_HOST}' IDENTIFIED BY '${DB_PASSWORD}';

-- Grant minimal privileges (only what's needed)
GRANT SELECT, INSERT, UPDATE, DELETE ON ${DB_NAME}.* TO '${DB_USER}'@'${DB_HOST}';

-- Flush privileges
FLUSH PRIVILEGES;
EOF

# Apply database schema
echo -e "${GREEN}Applying database schema...${NC}"
if [ -f "docs/DATABASE_SCHEMA.sql" ]; then
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" ${DB_NAME} < docs/DATABASE_SCHEMA.sql
else
    echo -e "${RED}Error: docs/DATABASE_SCHEMA.sql not found${NC}"
    exit 1
fi

# Create test database and user (if in development)
if [ "${NODE_ENV}" != "production" ]; then
    echo -e "${GREEN}Creating test database...${NC}"

    TEST_DB_NAME="${TEST_DB_NAME:-syndicat_tox_test}"
    TEST_DB_USER="${TEST_DB_USER:-test_user}"
    TEST_DB_PASSWORD="${TEST_DB_PASSWORD:-test_password}"

    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" << EOF
-- Create test database
CREATE DATABASE IF NOT EXISTS ${TEST_DB_NAME}
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;

-- Create test user
DROP USER IF EXISTS '${TEST_DB_USER}'@'localhost';
CREATE USER '${TEST_DB_USER}'@'localhost' IDENTIFIED BY '${TEST_DB_PASSWORD}';

-- Grant all privileges for testing
GRANT ALL PRIVILEGES ON ${TEST_DB_NAME}.* TO '${TEST_DB_USER}'@'localhost';

FLUSH PRIVILEGES;
EOF

    # Apply schema to test database
    mysql -u root -p"${MYSQL_ROOT_PASSWORD}" ${TEST_DB_NAME} < docs/DATABASE_SCHEMA.sql
fi

# Verify setup
echo -e "${GREEN}Verifying database setup...${NC}"
mysql -u ${DB_USER} -p"${DB_PASSWORD}" -h ${DB_HOST} ${DB_NAME} -e "SHOW TABLES;"

# Update .env file if it doesn't exist
if [ ! -f .env ]; then
    echo -e "${GREEN}Creating .env file...${NC}"
    cp .env.example .env

    # Update database credentials
    sed -i "s/DB_PASSWORD=.*/DB_PASSWORD=${DB_PASSWORD}/" .env
    sed -i "s/DB_NAME=.*/DB_NAME=${DB_NAME}/" .env
    sed -i "s/DB_USER=.*/DB_USER=${DB_USER}/" .env

    echo -e "${YELLOW}Remember to update SESSION_SECRET and REDIS_PASSWORD in .env${NC}"
fi

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}Database setup completed successfully!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""
echo -e "Database Name: ${DB_NAME}"
echo -e "Database User: ${DB_USER}"
echo -e "Database Password: ${DB_PASSWORD}"
echo ""
echo -e "${YELLOW}IMPORTANT: Save these credentials securely!${NC}"
echo -e "${YELLOW}Update your .env file with the generated password.${NC}"
echo ""

# Security recommendations
echo -e "${YELLOW}Security Recommendations:${NC}"
echo "1. Run mysql_secure_installation if not already done"
echo "2. Disable remote root access"
echo "3. Remove test databases"
echo "4. Set strong root password"
echo "5. Enable MariaDB firewall if available"
echo ""
