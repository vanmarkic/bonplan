#!/bin/bash

# ============================================================================
# Run Playwright E2E Test - Workaround for macOS Permission Issues
# ============================================================================

echo "🎭 Playwright E2E Test Runner"
echo "=============================="
echo ""

# Fix macOS temp directory permissions
echo "📂 Fixing macOS temp directory permissions..."
TMP_CACHE_DIR="/var/folders/zz/zyxvpxvq6csfxvn_n0000000000000/T/playwright-transform-cache-501"

if [ -d "$TMP_CACHE_DIR" ]; then
    echo "   Temp cache directory exists, attempting to fix permissions..."
    sudo chmod -R 777 "$TMP_CACHE_DIR" 2>/dev/null || {
        echo "   ⚠️  Could not fix permissions (sudo required)"
        echo "   Creating local cache instead..."
        rm -rf ".playwright-cache"
        mkdir -p ".playwright-cache"
    }
else
    echo "   Creating temp cache directory..."
    sudo mkdir -p "$TMP_CACHE_DIR" && sudo chmod -R 777 "$TMP_CACHE_DIR" 2>/dev/null || {
        echo "   ⚠️  Could not create temp directory (sudo required)"
        echo "   Using local cache instead..."
        mkdir -p ".playwright-cache"
    }
fi

echo ""
echo "🚀 Starting Playwright test..."
echo ""

# Run the test
if [ "$1" == "--headed" ]; then
    echo "   Running in HEADED mode (browser visible)..."
    npx playwright test tests/e2e/happy-path.spec.js --headed --reporter=list
else
    echo "   Running in HEADLESS mode..."
    npx playwright test tests/e2e/happy-path.spec.js --reporter=list
fi

EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo "✅ Test passed successfully!"
    echo ""
    echo "📸 Screenshots saved to: playwright-report/"
    echo "📊 View HTML report: npx playwright show-report"
else
    echo "❌ Test failed with exit code: $EXIT_CODE"
    echo ""
    echo "🔍 Check the error output above for details"
    echo "💡 Try running with --headed to see the browser: ./scripts/run-e2e-test.sh --headed"
fi

echo ""
exit $EXIT_CODE
