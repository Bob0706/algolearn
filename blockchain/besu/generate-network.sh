#!/usr/bin/env bash
# Regenerates the QBFT genesis and validator key(s) with Besu's own tooling.
# For production set "count" in qbftConfigFile.json to 4+ validators (QBFT
# tolerates f faulty nodes with 3f+1 validators) and give each its own key.
set -euo pipefail
cd "$(dirname "$0")"
IMAGE="${BESU_IMAGE:-hyperledger/besu:25.10.0}"
rm -rf networkFiles
docker run --rm --user root -v "$PWD":/work "$IMAGE" operator generate-blockchain-config \
  --config-file=/work/qbftConfigFile.json --to=/work/networkFiles --private-key-file-name=key
mkdir -p config
cp networkFiles/genesis.json config/genesis.json
key_dir=$(ls -d networkFiles/keys/*/ | head -1)
cp "$key_dir/key" config/node.key
cp "$key_dir/key.pub" config/node.key.pub
rm -rf networkFiles
echo "New genesis + validator key written to config/. Delete the old chain data volume before restarting."
