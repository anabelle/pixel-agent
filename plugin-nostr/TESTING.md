# Nostr Plugin Testing Guide

## 🚀 Quick Start

### 1. Run All Tests (Recommended)
```bash
cd plugin-nostr
node test-all.js
```

### 2. Run Unit Tests Only
```bash
npm test
```

### 3. Run Integration Test Only
```bash
node test-local.js
```

## 🛡️ Safe Testing Configuration

Your plugin is configured to **never post** when:
- `NOSTR_PRIVATE_KEY` is empty or missing
- `NOSTR_POST_ENABLE` is `"false"`
- `NOSTR_LISTEN_ENABLE` is `"false"`

## 📁 Test Files Created

- `character.test.json` - Test configuration (no posting)
- `test-local.js` - Integration test script
- `test-all.js` - Complete test runner

## 🔧 Development Workflow

### Testing Changes
1. Make your code changes
2. Run: `node test-all.js`
3. If tests pass, your changes are safe

### Adding New Tests
1. Create test file in `test/` directory
2. Follow naming: `feature.test.js`
3. Run `npm test` to verify

### Real Posting (When Ready)
1. Set `NOSTR_PRIVATE_KEY` in `character.json`
2. Set `NOSTR_POST_ENABLE: "true"`
3. Test with small intervals first
4. Monitor logs carefully

## 📊 Test Coverage

✅ **56 tests passing** covering:
- Service initialization
- Quality scoring
- User tracking
- Unfollow logic
- Home feed processing
- LNPixels integration
- Event handling
- Configuration parsing

## 🐛 Debugging

### Enable Debug Logs
```bash
DEBUG=* node test-local.js
```

### Check Service Status
The test output shows:
- Configuration settings
- Service state
- Quality scores
- User tracking data

### Common Issues
- **Pino logger warning**: Safe to ignore, fallback works
- **Quality scoring returns false**: Test events may not meet strict criteria
- **No relays**: Check NOSTR_RELAYS setting

## 🎯 Next Steps

1. **Customize quality scoring** in `lib/scoring.js`
2. **Adjust interaction probabilities** in configuration
3. **Add new test cases** for edge cases
4. **Test with real Nostr data** (carefully!)
5. **Monitor performance** with large follow lists

## 🔒 Security Notes

- Never commit real `NOSTR_PRIVATE_KEY`
- Test with testnet relays first
- Use low posting frequencies initially
- Monitor rate limits and relay policies

Happy testing! 🎨⚡
