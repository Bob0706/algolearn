"use client";
// app/ledger/[id]/page.tsx — verify a single record

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, ShieldAlert, ShieldCheck, Clock, Upload } from "lucide-react";
import { ApiError, downloadProof, fetchRecord, LedgerRecordView, verifyContent, verifyRecord, VerifyResult } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

function Verdict({ v }: { v: VerifyResult }) {
  const ok = v.verdict === "VERIFIED";
  const bad = v.verdict === "TAMPERED";
  return (
    <div className={`verdict ${ok ? "verdict-ok" : bad ? "verdict-bad" : "verdict-wait"}`}>
      {ok ? <ShieldCheck size={28} /> : bad ? <ShieldAlert size={28} /> : <Clock size={28} />}
      <div>
        <div style={{ fontSize: "1.1rem" }}>{v.verdict.replace("_", " ")}</div>
        <div className="small" style={{ fontWeight: 500, color: "var(--text-secondary)" }}>{v.explanation}</div>
      </div>
    </div>
  );
}

export default function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const [record, setRecord] = useState<LedgerRecordView | null>(null);
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [own, setOwn] = useState<VerifyResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setError("");
    verifyRecord(id).then(setResult).catch(e => setError(e instanceof ApiError ? e.message : "Verification failed."));
    fetchRecord(id).then(setRecord).catch(() => setRecord(null));
  }, [id, user?.uid]);

  const upload = async (file: File) => {
    setOwn(null); setError("");
    try {
      const bundle = JSON.parse(await file.text());
      if (bundle.id && bundle.id !== id) throw new Error("This proof bundle is for a different record.");
      setOwn(await verifyContent(id, bundle.content ?? bundle));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that file.");
    }
  };

  const oc = result?.onChain;

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem", maxWidth: 960 }}>
        <Link href="/ledger" className="small"><ArrowLeft size={13} style={{ display: "inline", verticalAlign: "-2px" }} /> Ledger explorer</Link>
        <h1 className="page-title" style={{ margin: "0.5rem 0 0.3rem" }}>Record verification</h1>
        <p className="hash muted" style={{ marginBottom: "1.25rem" }}>{id}</p>

        {error && <div className="alert alert-danger small" style={{ marginBottom: "1rem" }}>{error}</div>}
        {!result && !error && <span className="spinner spinner-lg" />}

        {result && (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <Verdict v={result} />

            <div className="card">
              <h2 className="card-title" style={{ marginBottom: "0.8rem" }}>Fingerprints</h2>
              <dl className="kv">
                <dt>Type</dt><dd>{result.kind ?? record?.kind ?? "—"}</dd>
                <dt>Recomputed hash</dt><dd className="hash">{result.recomputedContentHash ?? "—"}</dd>
                <dt>Hash on ledger</dt><dd className="hash">{oc?.contentHash ?? "not on ledger"}</dd>
                <dt>Ledger</dt><dd>{result.mode === "besu" ? "Hyperledger Besu (QBFT)" : result.mode === "local" ? "Local hash chain (development)" : result.mode}</dd>
                {oc?.blockNumber !== undefined && <><dt>{result.mode === "besu" ? "Block" : "Entry"}</dt><dd>{oc.blockNumber}</dd></>}
                {oc?.timestamp && <><dt>Recorded at</dt><dd>{new Date(oc.timestamp).toLocaleString("en-IN")}</dd></>}
                {oc?.txHash && <><dt>{result.mode === "besu" ? "Transaction" : "Entry hash"}</dt><dd className="hash">{oc.txHash}</dd></>}
                {oc?.writer && <><dt>Written by</dt><dd className="hash">{oc.writer}</dd></>}
                {oc?.contract && <><dt>Contract</dt><dd className="hash">{oc.contract}</dd></>}
                {oc?.parent && !/^0x0+$/.test(oc.parent) && <><dt>Parent record</dt><dd><Link href={`/ledger/${oc.parent}`} className="hash">{oc.parent}</Link></dd></>}
                {oc?.subject && <><dt>Author</dt><dd>{/^0x0+$/.test(oc.subject) ? "anonymous" : <span className="hash">trader-{oc.subject.slice(2, 8)} (pseudonymous)</span>}</dd></>}
              </dl>
            </div>

            {record && (
              <div className="card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.8rem" }}>
                  <h2 className="card-title">Recorded content</h2>
                  <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                    {record.proofAvailable && (
                      <button className="btn btn-secondary btn-sm" onClick={() => downloadProof(id).catch(e => setError(e.message))}>
                        <Download size={14} /> Download proof bundle
                      </button>
                    )}
                    <label className="btn btn-secondary btn-sm" style={{ cursor: "pointer" }}>
                      <Upload size={14} /> Check my copy
                      <input type="file" accept="application/json,.json" hidden onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
                    </label>
                  </div>
                </div>
                {own && <div style={{ marginBottom: "0.8rem" }}><Verdict v={own} /></div>}
                <pre className="mono" style={{ fontSize: "0.72rem", background: "var(--bg-tertiary)", padding: "0.8rem", borderRadius: 8, overflow: "auto", maxHeight: 460 }}>
                  {JSON.stringify(record.content, null, 2)}
                </pre>
              </div>
            )}

            <div className="card small" style={{ color: "var(--text-secondary)" }}>
              <strong style={{ color: "var(--text-primary)" }}>Verify independently.</strong> The fingerprint is SHA-256 of the content as canonical JSON (keys sorted, no spaces).
              With access to the Besu node, call <code>AlgoLedger.verify(id, sha256)</code> on the contract above; it returns <code>true</code> only if this exact content was recorded.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
