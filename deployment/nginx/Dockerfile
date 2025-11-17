# ============================================
# Le Syndicat des Tox - Custom Nginx
# ============================================
# Nginx with Lua support for MD5 hashing
# Used for IP anonymization via X-Anonymous-ID header

FROM nginx:alpine

# Install Lua module for Nginx and required dependencies
# nginx-mod-http-lua provides Lua support in nginx
# lua-resty-string provides string.to_hex() function
# lua-resty-core provides core functionality for resty modules
RUN apk add --no-cache \
    nginx-mod-http-lua \
    lua-resty-string \
    lua-resty-core

# Load the Lua module in nginx
RUN echo "load_module modules/ngx_http_lua_module.so;" > /etc/nginx/modules/lua.conf

# Create directory for Lua scripts
RUN mkdir -p /etc/nginx/lua

# Copy Lua script for MD5 hashing
COPY md5.lua /etc/nginx/lua/md5.lua

# Remove default config
RUN rm -f /etc/nginx/conf.d/default.conf

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost/nginx-health || exit 1

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
