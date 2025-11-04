#!/bin/bash

# Verification script for lnpixels-listener.js test coverage
# Run this after installing dependencies

set -e

echo "🧪 Running lnpixels-listener.js test suite..."
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "❌ node_modules not found. Installing dependencies..."
    npm install
fi

# Run tests with coverage for lnpixels-listener.js only
echo "📊 Generating coverage report..."
npm run test:coverage -- test/lnpixels-listener.test.js --reporter=verbose

echo ""
echo "✅ Test suite complete!"
echo ""
echo "📈 Coverage Summary:"
echo "-------------------"

# Extract coverage info (if available)
if [ -f "coverage/coverage-summary.json" ]; then
    node -e "
    const coverage = require('./coverage/coverage-summary.json');
    const file = coverage['lib/lnpixels-listener.js'];
    if (file) {
        console.log('Statements: ' + file.statements.pct + '%');
        console.log('Branches:   ' + file.branches.pct + '%');
        console.log('Functions:  ' + file.functions.pct + '%');
        console.log('Lines:      ' + file.lines.pct + '%');
        console.log('');
        const target = 100;
        const allGood = 
            file.statements.pct >= target &&
            file.branches.pct >= target &&
            file.functions.pct >= target &&
            file.lines.pct >= target;
        if (allGood) {
            console.log('🎉 100% coverage achieved!');
        } else {
            console.log('⚠️  Coverage target (100%) not yet met.');
            console.log('   Review coverage/lcov-report/index.html for details');
        }
    }
    "
else
    echo "⚠️  Coverage summary not found. Check coverage/lcov-report/index.html"
fi

echo ""
echo "📁 Full coverage report: coverage/lcov-report/index.html"
