// Downloads (or imports) the full NSE + BSE company lists into MARKET_DATA_DIR/universe.json.
//
//   npm run symbols:sync                                   # download from NSE/BSE
//   npm run symbols:sync -- --nse EQUITY_L.csv --sme SME_EQUITY_L.csv --bse bse.json
//                                                          # import files you downloaded yourself
// With KV_REST_API_URL / KV_REST_API_TOKEN set, the list is also stored in Redis for a deployed app.
import fs from "node:fs";
import { buildUniverse, downloadUniverse, parseBseList, parseNseList, saveUniverse } from "../lib/server/universe";
import { redis, redisEnabled } from "../lib/server/redis";

const args = process.argv.slice(2);
const arg = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

async function main() {
  const [nseFile, smeFile, bseFile] = [arg("nse"), arg("sme"), arg("bse")];
  const u = nseFile || bseFile
    ? buildUniverse(
        nseFile ? parseNseList(fs.readFileSync(nseFile, "utf8")) : [],
        smeFile ? parseNseList(fs.readFileSync(smeFile, "utf8"), true) : [],
        bseFile ? parseBseList(JSON.parse(fs.readFileSync(bseFile, "utf8"))) : [],
      )
    : await downloadUniverse();
  for (const e of u.errors) console.error("  ✗", e);
  const listed = u.counts.nse + u.counts.nseSme + u.counts.bse;
  if (!listed) {
    console.error("No company lists could be loaded; nothing saved.");
    process.exit(1);
  }
  saveUniverse(u);
  if (redisEnabled()) {
    // seeds a deployed (e.g. Vercel) app whose own servers cannot reach NSE/BSE
    await redis(["SET", "universe:v1", JSON.stringify(u), "EX", 3 * 24 * 3600]);
    console.log("Also stored in Redis for the deployed app.");
  }
  console.log(`Saved ${listed.toLocaleString()} listings: NSE ${u.counts.nse}, NSE SME ${u.counts.nseSme}, BSE ${u.counts.bse}${u.complete ? "" : " (incomplete)"}`);
}

main();
