import { sleep } from './time.js';

export async function waitReceipt(txPromise, { label = '' } = {}) {
  const tx = await txPromise;
  const rc = await tx.wait();
  console.log(`[tx] ${label} hash=${tx.hash} status=${rc.status}`);
  return rc;
}

export async function withDelay(fn, delayMs) {
  const r = await fn();
  if (delayMs) await sleep(delayMs);
  return r;
}
