// Compiles AlgoLedger.sol with solc-js and writes the ABI + bytecode used by the app.
// Usage: npm run ledger:compile
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import solc from "solc";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const source = fs.readFileSync(path.join(root, "blockchain/contracts/AlgoLedger.sol"), "utf8");

const input = {
  language: "Solidity",
  sources: { "AlgoLedger.sol": { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "paris", // widely supported by Besu genesis configs (no PUSH0 needed)
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const out = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (out.errors || []).filter(e => e.severity === "error");
for (const e of out.errors || []) console.error(e.formattedMessage);
if (errors.length) process.exit(1);

const c = out.contracts["AlgoLedger.sol"].AlgoLedger;
const artifact = { contractName: "AlgoLedger", compiler: solc.version(), abi: c.abi, bytecode: "0x" + c.evm.bytecode.object };
const dest = path.join(root, "lib/ledger/AlgoLedger.json");
fs.writeFileSync(dest, JSON.stringify(artifact, null, 2) + "\n");
console.log(`Wrote ${path.relative(root, dest)} (${c.evm.bytecode.object.length / 2} bytes)`);
