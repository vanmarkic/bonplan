#!/bin/bash

# ============================================
# Nginx Docker Build Test Script
# ============================================
# Tests that the custom Nginx image can be built
# and that all required files are present

set -e

echo "=========================================="
echo "Nginx Docker Build Test"
echo "=========================================="
echo ""

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "ERROR: Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

# Check required files exist
echo "Checking required files..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$SCRIPT_DIR/Dockerfile" ]; then
    echo "ERROR: Dockerfile not found"
    exit 1
fi
echo "  ✓ Dockerfile found"

if [ ! -f "$SCRIPT_DIR/md5.lua" ]; then
    echo "ERROR: md5.lua not found"
    exit 1
fi
echo "  ✓ md5.lua found"

if [ ! -f "$SCRIPT_DIR/dev.conf" ]; then
    echo "ERROR: dev.conf not found"
    exit 1
fi
echo "  ✓ dev.conf found"

echo ""
echo "Building custom Nginx image..."
docker build -t syndicat-nginx:test "$SCRIPT_DIR"

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "BUILD SUCCESSFUL"
    echo "=========================================="
    echo ""
    echo "Image: syndicat-nginx:test"
    echo ""
    echo "To test the image:"
    echo "  docker run -d --name test-nginx -p 8080:80 syndicat-nginx:test"
    echo ""
    echo "To clean up:"
    echo "  docker stop test-nginx"
    echo "  docker rm test-nginx"
    echo "  docker rmi syndicat-nginx:test"
    echo ""
else
    echo ""
    echo "=========================================="
    echo "BUILD FAILED"
    echo "=========================================="
    exit 1
fi
