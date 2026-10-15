// Child process used by tests/besu-serverless.test.ts: acts as one serverless instance
// recording several records concurrently on the shared Besu signer.
import { recordOnLedger } from "../../lib/ledger";

const tag = process.argv[2];
const n = Number(process.argv[3] || 5);
Promise.all(Array.from({ length: n }, (_, i) => recordOnLedger("BACKTEST", { instance: tag, i, at: Date.now() })))
  .then(rs => {
    process.stdout.write(JSON.stringify(rs.map(r => ({ status: r?.status, error: r?.error }))));
  });
