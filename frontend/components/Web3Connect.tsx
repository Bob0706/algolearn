"use client";

import { useState } from "react";
import { ethers } from "ethers";
import { ShieldCheck, Link as LinkIcon } from "lucide-react";

export default function Web3Connect({ finalPnL, winRate }: { finalPnL: number, winRate: number }) {
  const [account, setAccount] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<"idle" | "logging" | "success" | "error">("idle");
  const [txHash, setTxHash] = useState("");

  const connectWallet = async () => {
    if (typeof window.ethereum !== "undefined") {
      try {
        setLoading(true);
        // Request account access
        const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        setAccount(accounts[0]);
      } catch (error) {
        console.error("User denied account access");
      } finally {
        setLoading(false);
      }
    } else {
      alert("Please install MetaMask to use this feature.");
    }
  };

  const logOnChain = async () => {
    if (!account) return;
    setStatus("logging");
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();

      // Mock contract logic - in a real app, this would be your deployed contract's address and ABI
      // For demonstration, we'll just send a 0-value transaction with data to self to represent logging
      // Data: "AlgoLearn Result: PnL=..., WinRate=..."
      const dataStr = `AlgoLearn Result: PnL=${finalPnL.toFixed(2)}, WinRate=${winRate.toFixed(1)}%`;
      const dataHex = ethers.hexlify(ethers.toUtf8Bytes(dataStr));

      const tx = await signer.sendTransaction({
        to: account, // Sending to self just to log data on-chain
        value: 0,
        data: dataHex,
      });

      setTxHash(tx.hash);
      setStatus("success");
    } catch (e) {
      console.error(e);
      setStatus("error");
    }
  };

  if (status === "success") {
    return (
      <div className="badge badge-success" style={{ padding: "0.5rem 0.75rem", display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <ShieldCheck size={16} /> Logged on-chain!
        <a href={`https://sepolia.etherscan.io/tx/${txHash}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline", marginLeft: "0.25rem" }}>
          View Tx
        </a>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
      {!account ? (
        <button className="btn btn-secondary btn-sm" onClick={connectWallet} disabled={loading}>
          {loading ? "Connecting..." : <><LinkIcon size={14} /> Connect Wallet</>}
        </button>
      ) : (
        <button className="btn btn-primary btn-sm" onClick={logOnChain} disabled={status === "logging"}>
          {status === "logging" ? "Logging..." : <><ShieldCheck size={14} /> Log Results On-Chain</>}
        </button>
      )}
    </div>
  );
}
