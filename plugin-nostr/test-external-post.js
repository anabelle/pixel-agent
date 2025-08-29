const { NostrService } = require('./lib/service');
const { emitter } = require('./lib/bridge');

function mockRuntime() {
  return {
    getSetting: () => '',
    character: { name: 'Pixel' },
    logger: console,
  };
}

async function main() {
  const runtime = mockRuntime();
  const svc = new NostrService(runtime);
  let called = false;
  svc.postOnce = async (text) => { called = true; console.log('[TEST]', 'postOnce called with:', text); return true; };

  emitter.emit('external.post', { text: 'hello from test' });
  setTimeout(() => {
    if (!called) {
      console.error('[TEST] FAILED: postOnce was not called');
      process.exit(1);
    } else {
      console.log('[TEST] SUCCESS');
      process.exit(0);
    }
  }, 200);
}

main().catch((e) => { console.error('Error', e); process.exit(1); });
