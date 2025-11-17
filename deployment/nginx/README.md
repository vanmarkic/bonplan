# Nginx Configuration with IP Anonymization

This directory contains Nginx configurations with Lua-based IP anonymization for Le Syndicat des Tox.

## Overview

The Nginx setup uses a custom Docker image with Lua support to generate MD5 hashes of IP addresses. This ensures complete anonymity while still allowing rate limiting and abuse prevention.

## Files

- **Dockerfile**: Custom Nginx Alpine image with Lua modules
- **md5.lua**: Lua script for MD5 hashing IP addresses
- **dev.conf**: Development configuration for Docker Compose
- **syndicat-tox.conf**: Production configuration with SSL/TLS

## How It Works

### IP Anonymization Flow

1. Nginx receives a request with the client's IP address
2. The IP is combined with a secret salt: `${remote_addr}_secret_salt`
3. Lua script generates MD5 hash of this combination
4. The hash becomes the `X-Anonymous-ID` header
5. All original IP headers are stripped before proxying to the app
6. The app NEVER sees the real IP address

### Why Lua?

Standard Nginx doesn't include MD5 hashing directives like `set_md5`. We use the `nginx-mod-http-lua` module which provides:

- `resty.md5`: MD5 hashing library
- `resty.string`: String utilities (hex encoding)
- Full Lua scripting in Nginx configuration

## Docker Setup (Development)

### Building the Image

```bash
# Build nginx with Lua support
docker compose build nginx

# Or build directly
cd deployment/nginx
docker build -t syndicat-nginx:dev .
```

### Running

```bash
# Start all services including nginx
docker compose up -d

# Check nginx logs
docker compose logs -f nginx

# Test anonymous ID generation
curl -I http://localhost
```

### Verifying Anonymization

Check the nginx logs to ensure they show `anonid=` instead of IP addresses:

```bash
docker compose exec nginx tail -f /var/log/nginx/access.log
```

You should see:
```
17/Nov/2025:15:30:00 +0000 "GET / HTTP/1.1" 200 1234 "Mozilla/5.0..." anonid=abc123def456...
```

## Production Setup

### Prerequisites

Install Nginx with Lua support on your server:

**Debian/Ubuntu:**
```bash
sudo apt-get update
sudo apt-get install -y nginx nginx-extras lua-resty-string lua-resty-core
```

**Alpine Linux:**
```bash
sudo apk add nginx nginx-mod-http-lua lua-resty-string lua-resty-core
```

### Installation Steps

1. **Copy Lua script:**
```bash
sudo mkdir -p /etc/nginx/lua
sudo cp md5.lua /etc/nginx/lua/
sudo chmod 644 /etc/nginx/lua/md5.lua
```

2. **Load Lua module in main nginx.conf:**
```bash
# Add to /etc/nginx/nginx.conf (top level, before http block)
load_module modules/ngx_http_lua_module.so;
```

3. **Copy production config:**
```bash
sudo cp syndicat-tox.conf /etc/nginx/sites-available/
sudo ln -s /etc/nginx/sites-available/syndicat-tox.conf /etc/nginx/sites-enabled/
```

4. **Update configuration:**
```bash
# Edit the config
sudo nano /etc/nginx/sites-available/syndicat-tox.conf

# Change:
# - Domain name (syndicat-tox.be → your domain)
# - Salt value: set $anonymous_id_source "${remote_addr}_YOUR_RANDOM_SALT";
# - SSL certificate paths
```

Generate a random salt:
```bash
openssl rand -base64 32
```

5. **Test and reload:**
```bash
sudo nginx -t
sudo systemctl reload nginx
```

### SSL/TLS Setup

Install Let's Encrypt certificate:

```bash
sudo apt-get install -y certbot python3-certbot-nginx
sudo certbot --nginx -d syndicat-tox.be -d www.syndicat-tox.be
```

Certbot will automatically update the nginx config with certificate paths.

## Configuration Details

### Rate Limiting Zones

The configuration defines three rate limit zones:

- **auth**: 10 requests/hour for login/register (strict)
- **general**: 100 requests/minute for general browsing
- **api**: 30 requests/minute for API endpoints

All rate limits use `$anonymous_id` instead of IP addresses.

### Security Headers

All responses include:

- **HSTS**: Force HTTPS for 1 year
- **X-Frame-Options**: Prevent clickjacking
- **X-Content-Type-Options**: Prevent MIME sniffing
- **CSP**: Strict Content Security Policy (no external resources)
- **Referrer-Policy**: No referrer (privacy)
- **Permissions-Policy**: Disable geolocation, camera, microphone

### Anonymous Logging

Custom log format that includes anonymous ID but NO IP addresses:

```nginx
log_format anonymous '$time_local "$request" '
                    '$status $body_bytes_sent '
                    '"$http_user_agent" '
                    'anonid=$anonymous_id';
```

## Troubleshooting

### Lua Module Not Loading

**Error:** `unknown directive "access_by_lua_file"`

**Solution:**
1. Verify Lua module is installed:
   ```bash
   nginx -V 2>&1 | grep lua
   ```

2. Load the module in nginx.conf:
   ```bash
   echo "load_module modules/ngx_http_lua_module.so;" | sudo tee /etc/nginx/modules-enabled/50-mod-http-lua.conf
   ```

3. Restart nginx:
   ```bash
   sudo systemctl restart nginx
   ```

### MD5 Hash Not Generated

**Error:** Anonymous ID is empty or shows "error"

**Check nginx error log:**
```bash
sudo tail -f /var/log/nginx/error.log
```

**Common causes:**
- Missing `lua-resty-string` package
- Missing `lua-resty-core` package
- Incorrect path to md5.lua script
- Syntax error in Lua script

**Solution:**
```bash
# Install missing packages
sudo apt-get install -y lua-resty-string lua-resty-core

# Verify Lua script exists
ls -l /etc/nginx/lua/md5.lua

# Test Lua syntax
lua /etc/nginx/lua/md5.lua
```

### Health Check Failing

The nginx health check uses the `/nginx-health` endpoint.

**Test manually:**
```bash
curl http://localhost/nginx-health
```

Should return: `healthy`

If failing, check:
- Nginx is running: `systemctl status nginx`
- Port 80 is accessible
- No firewall blocking localhost

## Security Verification

After deployment, verify NO IP addresses are logged:

```bash
# Check nginx access log (should show anonid= not IPs)
sudo tail -f /var/log/nginx/syndicat-tox-access.log

# Search for IP patterns (should find NOTHING)
sudo grep -rE "\b([0-9]{1,3}\.){3}[0-9]{1,3}\b" /var/log/nginx/

# Check that X-Anonymous-ID is being set
curl -I http://localhost 2>&1 | grep -i anonymous
```

## Performance Notes

- Lua MD5 hashing adds ~0.1-0.2ms per request (negligible)
- Use HTTP/2 for better performance over TLS
- Enable gzip compression (already configured)
- Static files are cached for 7 days
- Keepalive connections enabled (32 connections)

## Additional Resources

- [Nginx Lua Module Documentation](https://github.com/openresty/lua-nginx-module)
- [lua-resty-string Documentation](https://github.com/openresty/lua-resty-string)
- [Security Implementation Details](../../docs/SECURITY_IMPLEMENTATION.md)
- [Full Infrastructure Guide](../../docs/INFRASTRUCTURE.md)

## Support

For issues specific to Nginx configuration:
1. Check nginx error logs: `sudo tail -f /var/log/nginx/error.log`
2. Verify configuration: `sudo nginx -t`
3. Review Lua script output in error log
4. Ensure all required packages are installed

**Remember:** The IP anonymization is CRITICAL for user safety. Never deploy without verifying it works correctly.
