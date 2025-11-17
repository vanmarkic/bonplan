# Deployment Configuration Files

This directory contains production-ready configuration files for deploying Le Syndicat des Tox.

## Directory Structure

```
deployment/
├── nginx/
│   ├── Dockerfile             # Custom Nginx with Lua support
│   ├── md5.lua                # Lua script for MD5 hashing (anonymization)
│   ├── dev.conf               # Development configuration (Docker)
│   └── syndicat-tox.conf      # Production configuration
├── redis/
│   └── redis.conf             # Redis configuration for sessions
├── systemd/
│   └── syndicat-tox.service   # Systemd service file
└── README.md                  # This file
```

## Quick Deployment

### Automated Installation

The easiest way to deploy is using the installation script:

```bash
sudo bash scripts/install.sh
```

This will:
- Install all dependencies (Node.js, MariaDB, Redis, Nginx)
- Configure all services
- Set up SSL certificate
- Start the application

### Manual Installation

If you prefer manual setup, follow the [INFRASTRUCTURE.md](../docs/INFRASTRUCTURE.md) guide.

## Configuration Files

### Nginx (nginx/)

**Custom Nginx with Lua Support:**

The project uses a custom Nginx Docker image with Lua support for MD5 hashing. This is required for IP anonymization.

**Critical Features:**
- **IP Anonymization**: All IP addresses are stripped and replaced with a one-way hash
- **Lua-based MD5**: Uses nginx-mod-http-lua for MD5 hashing
- **Rate Limiting**: Prevents abuse while preserving anonymity
- **Security Headers**: HSTS, CSP, X-Frame-Options, etc.
- **SSL/TLS**: Modern cipher suites (TLSv1.2+)
- **Anonymous Logging**: Logs contain no IP addresses

**Docker Setup (Development):**
```bash
# Build and start with Docker Compose
docker compose up -d nginx

# View logs
docker compose logs -f nginx
```

**Production Installation:**

First, install Nginx with Lua support:
```bash
# On Alpine/Debian/Ubuntu systems
sudo apt-get install -y nginx nginx-extras lua-resty-string lua-resty-core

# Copy Lua script
sudo mkdir -p /etc/nginx/lua
sudo cp deployment/nginx/md5.lua /etc/nginx/lua/

# Copy and enable configuration
sudo cp deployment/nginx/syndicat-tox.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/syndicat-tox.conf /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

**Important**: Update the following before deploying:
- Replace `syndicat-tox.be` with your domain
- Replace `CHANGE_THIS_SALT_TO_RANDOM_STRING` with: `openssl rand -base64 32`
- Update SSL certificate paths after running certbot
- Ensure Lua module is loaded in nginx.conf: `load_module modules/ngx_http_lua_module.so;`

### Redis (redis/redis.conf)

**Features:**
- Localhost-only binding (no external access)
- Password authentication
- Dangerous commands disabled
- Persistence enabled (RDB + AOF)
- Memory limits and eviction policy

**Installation:**
```bash
sudo cp deployment/redis/redis.conf /etc/redis/redis-syndicat.conf
# Update requirepass with: openssl rand -base64 24
sudo mkdir -p /var/lib/redis/syndicat-tox
sudo chown redis:redis /var/lib/redis/syndicat-tox
sudo systemctl restart redis-server
```

### Systemd (systemd/syndicat-tox.service)

**Features:**
- Automatic restart on failure
- Security hardening (NoNewPrivileges, PrivateTmp, etc.)
- Proper process management
- Systemd journal integration

**Installation:**
```bash
sudo cp deployment/systemd/syndicat-tox.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable syndicat-tox
sudo systemctl start syndicat-tox
```

**Management:**
```bash
sudo systemctl status syndicat-tox   # Check status
sudo systemctl restart syndicat-tox  # Restart
sudo journalctl -u syndicat-tox -f   # View logs
```

## Production Checklist

Before deploying to production:

- [ ] Update `.env` with secure, randomly generated secrets
- [ ] Configure Nginx with your domain name
- [ ] Generate and update Nginx anonymous ID salt
- [ ] Obtain SSL certificate with Let's Encrypt
- [ ] Update Redis password in config and `.env`
- [ ] Run database setup script
- [ ] Configure firewall (UFW)
- [ ] Enable automatic security updates
- [ ] Setup automated backups
- [ ] Verify IP anonymization is working
- [ ] Test application health endpoint
- [ ] Review all logs for IP leakage

## Security Notes

**CRITICAL**: This application MUST preserve user anonymity at all costs.

### IP Anonymization Verification

After deployment, verify that NO IP addresses are being logged:

```bash
# Check Nginx logs (should show anonid= not IP addresses)
sudo tail /var/log/nginx/syndicat-tox-access.log

# Check application logs (should contain NO IP addresses)
sudo grep -rE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" /var/www/syndicat-tox/logs/
# This should return NOTHING!

# Check database (should contain NO IP addresses)
sudo mysql -u root -p syndicat_tox -e "SELECT * FROM users LIMIT 1;"
# Should show pseudo, hashed PIN, but NO IP data
```

### Security Monitoring

Regularly check:
- Application logs for errors
- Nginx error logs for attacks
- Database for unusual activity
- Redis memory usage
- System resource usage

## Troubleshooting

### Application won't start
```bash
sudo journalctl -u syndicat-tox -n 50
```

### Database connection issues
```bash
sudo systemctl status mariadb
sudo mysql -u syndicat_app -p -h localhost syndicat_tox
```

### Redis connection issues
```bash
sudo systemctl status redis-server
redis-cli -a YOUR_PASSWORD ping
```

### Nginx configuration errors
```bash
sudo nginx -t
sudo tail -f /var/log/nginx/error.log
```

## Additional Resources

- **Full Infrastructure Guide**: [docs/INFRASTRUCTURE.md](../docs/INFRASTRUCTURE.md)
- **Security Implementation**: [docs/SECURITY_IMPLEMENTATION.md](../docs/SECURITY_IMPLEMENTATION.md)
- **Database Schema**: [docs/DATABASE_SCHEMA.sql](../docs/DATABASE_SCHEMA.sql)
- **API Documentation**: [docs/API_ENDPOINTS.md](../docs/API_ENDPOINTS.md)

## Support

For deployment issues or questions, refer to the comprehensive documentation in the `docs/` directory.

**Remember**: Every configuration choice affects real people in vulnerable situations. Deploy with care and compassion.
