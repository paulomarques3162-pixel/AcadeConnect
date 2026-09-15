import { parentPort } from 'node:worker_threads';
import bcrypt from 'bcryptjs';

/**
 * bcrypt worker entry point.
 *
 * Hashing/verifying a password is CPU-bound and takes hundreds of milliseconds
 * at cost 12. On a single Node process this blocks the event loop, so a login
 * storm (hundreds of users at once) stalls every other request. Running bcrypt
 * inside worker threads keeps the HTTP event loop free while the SAME algorithm
 * and cost are preserved.
 *
 * Protocol: { id, op: 'hash'|'compare', args } -> { id, ok, result|error }
 */
parentPort.on('message', async (msg) => {
  const { id, op, args } = msg || {};
  try {
    let result;
    if (op === 'hash') {
      result = await bcrypt.hash(String(args?.password ?? ''), Number(args?.rounds) || 12);
    } else if (op === 'compare') {
      result = await bcrypt.compare(String(args?.password ?? ''), String(args?.hash ?? ''));
    } else {
      throw new Error(`unsupported op: ${op}`);
    }
    parentPort.postMessage({ id, ok: true, result });
  } catch (err) {
    parentPort.postMessage({ id, ok: false, error: err?.message || 'bcrypt error' });
  }
});
