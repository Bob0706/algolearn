#!/bin/bash
# AlgoLearn ledger node: single-validator Hyperledger Besu (QBFT) behind HTTPS (Caddy + sslip.io).
# Runs on a fresh Ubuntu VM: Google Cloud free-tier e2-micro (as a startup script, which re-runs on
# every boot) or Oracle Cloud Always Free (as cloud-init). Safe to re-run: the chain is created once.
#
#   SIGNER_ADDRESS   0x… address of the web app's ledger signer (the only account allowed to transact)
#   HOST_OVERRIDE    optional hostname instead of <public-ip>.sslip.io
#   TLS_INTERNAL=1   test only: self-signed certificate instead of Let's Encrypt
set -euxo pipefail

SIGNER_ADDRESS="${SIGNER_ADDRESS:?set SIGNER_ADDRESS}"
BESU_IMAGE=hyperledger/besu:25.10.0
CADDY_IMAGE=caddy:2.10.2
DIR=/opt/algolearn
mkdir -p "$DIR" && cd "$DIR"

# 1. swap on small machines (Besu is a JVM app)
if [ "$(awk '/MemTotal/{print $2}' /proc/meminfo)" -lt 3000000 ] && [ ! -f /swapfile ]; then
  (fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab) || true
fi

# 2. Docker
if ! command -v docker >/dev/null; then
  apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y docker.io
fi
systemctl enable --now docker || true

# 3. host firewall: Oracle's Ubuntu images reject everything but SSH; open 80 (certificate) and 443
if command -v iptables >/dev/null; then
  for p in 80 443; do
    if ! iptables -C INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT 2>/dev/null; then
      pos=$(iptables -L INPUT --line-numbers -n | awk '/REJECT/{print $1; exit}')
      if [ -n "$pos" ]; then iptables -I INPUT "$pos" -p tcp -m state --state NEW --dport "$p" -j ACCEPT
      else iptables -A INPUT -p tcp -m state --state NEW --dport "$p" -j ACCEPT; fi
    fi
  done
  (command -v netfilter-persistent >/dev/null && netfilter-persistent save) || true
fi

# 4. the chain: genesis + validator key are generated once, on this machine
if [ ! -f config/genesis.json ]; then
  mkdir -p config gen
  cat > gen/qbft.json <<'JSON'
{
  "genesis": {
    "config": {
      "chainId": 4243, "berlinBlock": 0, "londonBlock": 0, "zeroBaseFee": true,
      "qbft": { "blockperiodseconds": 2, "xemptyblockperiodseconds": 300, "epochlength": 30000, "requesttimeoutseconds": 4 }
    },
    "nonce": "0x0", "timestamp": "0x58ee40ba", "gasLimit": "0x1fffffffffffff", "difficulty": "0x1",
    "mixHash": "0x63746963616c2062797a616e74696e65206661756c7420746f6c6572616e6365",
    "coinbase": "0x0000000000000000000000000000000000000000", "alloc": {}
  },
  "blockchain": { "nodes": { "generate": true, "count": 1 } }
}
JSON
  rm -rf "$DIR/gen/net"
  # Besu's generator can exit non-zero ("Output directory already exists") after writing its files,
  # so judge success by the files themselves.
  docker run --rm --user root -v "$DIR/gen":/work "$BESU_IMAGE" operator generate-blockchain-config \
    --config-file=/work/qbft.json --to=/work/net --private-key-file-name=key || true
  [ -f gen/net/genesis.json ] && ls gen/net/keys/*/key >/dev/null
  cp gen/net/genesis.json config/genesis.json
  cp gen/net/keys/*/key config/node.key
  rm -rf "$DIR/gen/net"
fi
mkdir -p data permissions
[ -f permissions/permissions_config.toml ] || echo "accounts-allowlist=[\"$SIGNER_ADDRESS\"]" > permissions/permissions_config.toml
chown -R 1000:1000 config data permissions
chmod 600 config/node.key

# 5. Besu (JSON-RPC stays on the private Docker network; only Caddy is public)
MEM_MB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo)
# heap by machine size: 1 GB free-tier VMs (GCP e2-micro, OCI E2.1.Micro) get a small, serial-GC heap
if [ "$MEM_MB" -gt 4000 ]; then BESU_OPTS="-Xmx2048m"
elif [ "$MEM_MB" -gt 1500 ]; then BESU_OPTS="-Xmx640m"
else BESU_OPTS="-Xmx320m -XX:MaxMetaspaceSize=128m -XX:+UseSerialGC"; fi
docker network create algolearn 2>/dev/null || true
docker rm -f besu 2>/dev/null || true
docker run -d --name besu --restart unless-stopped --network algolearn \
  -e BESU_OPTS="$BESU_OPTS" \
  -v "$DIR/config":/config:ro -v "$DIR/data":/data -v "$DIR/permissions":/permissions \
  "$BESU_IMAGE" \
  --genesis-file=/config/genesis.json --node-private-key-file=/config/node.key --data-path=/data \
  --rpc-http-enabled --rpc-http-host=0.0.0.0 --rpc-http-port=8545 --rpc-http-api=ETH,NET,WEB3 \
  --host-allowlist='*' --rpc-http-cors-origins=none --min-gas-price=0 \
  --permissions-accounts-config-file-enabled --permissions-accounts-config-file=/permissions/permissions_config.toml \
  --discovery-enabled=false --profile=ENTERPRISE

# 6. HTTPS in front of the RPC (Let's Encrypt via <ip>.sslip.io); only JSON-RPC POSTs and /liveness pass
if [ -n "${HOST_OVERRIDE:-}" ]; then HOST="$HOST_OVERRIDE"; else
  IP=$(curl -fsS --max-time 10 https://api.ipify.org || curl -fsS --max-time 10 https://ifconfig.me)
  HOST="${IP//./-}.sslip.io"
fi
TLS_LINE=""; [ "${TLS_INTERNAL:-}" = "1" ] && TLS_LINE="tls internal"
cat > Caddyfile <<CADDY
$HOST {
	$TLS_LINE
	@rpc {
		method POST
		path /
	}
	handle @rpc {
		request_body {
			max_size 64KB
		}
		reverse_proxy besu:8545
	}
	handle /liveness {
		reverse_proxy besu:8545
	}
	respond "AlgoLearn ledger node" 404
}
CADDY
docker rm -f caddy 2>/dev/null || true
docker run -d --name caddy --restart unless-stopped --network algolearn -p 80:80 -p 443:443 \
  -v "$DIR/Caddyfile":/etc/caddy/Caddyfile:ro -v algolearn-caddy:/data "$CADDY_IMAGE"

echo "$HOST" > "$DIR/HOSTNAME"
echo "AlgoLearn ledger node ready at https://$HOST"
