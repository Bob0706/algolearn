// Deploys AlgoLedger to the Besu network and prints the env vars for the app.
// Usage: LEDGER_RPC_URL=http://127.0.0.1:8545 LEDGER_PRIVATE_KEY=0x... npm run ledger:deploy
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const artifact = JSON.parse(fs.readFileSync(path.join(root, "lib/ledger/AlgoLedger.json"), "utf8"));

const rpc = process.env.LEDGER_RPC_URL || "http://127.0.0.1:8545";
// Default = Besu's well-known DEV account. Never use it on a network you care about.
const key = process.env.LEDGER_PRIVATE_KEY || "0x8f2a55949038a9610f50fb23b5883af3b4ecb3c3bb792cbcefbd1542c692be63";

const provider = new JsonRpcProvider(rpc);
const wallet = new Wallet(key, provider);
const { chainId } = await provider.getNetwork();
console.log(`Deploying AlgoLedger to chain ${chainId} at ${rpc} from ${wallet.address} ...`);

const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
const contract = await factory.deploy({ gasPrice: 0 });
const receipt = await contract.deploymentTransaction().wait(1);
const address = await contract.getAddress();

console.log(`Deployed in block ${receipt.blockNumber}, tx ${receipt.hash}\n`);
console.log("Add to .env.local:");
console.log(`LEDGER_MODE=besu`);
console.log(`LEDGER_RPC_URL=${rpc}`);
console.log(`LEDGER_CONTRACT_ADDRESS=${address}`);
console.log(`LEDGER_PRIVATE_KEY=<the key you deployed with>`);
