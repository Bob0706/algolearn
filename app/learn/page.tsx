"use client";
// app/learn/page.tsx — Learning Hub

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle, Circle, Clock } from "lucide-react";
import { LESSONS } from "@/lib/lessons";
import { useAuth } from "@/contexts/AuthContext";
import { completeLesson, fetchProgress } from "@/lib/api";

export default function LearnPage() {
  const { user, loading } = useAuth();
  const uid = user?.id;
  const [active, setActive] = useState(LESSONS[0].id);
  const [done, setDone] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!uid) { setDone([]); return; }
    fetchProgress().then(d => setDone(d.lessonsCompleted)).catch(() => {});
  }, [uid]);

  const lesson = LESSONS.find(l => l.id === active)!;
  const idx = LESSONS.indexOf(lesson);

  const complete = async () => {
    setError("");
    if (user) {
      try { setDone((await completeLesson(lesson.id)).lessonsCompleted); } catch (e) { setError(e instanceof Error ? e.message : "Could not save progress."); return; }
    }
    setDone(d => (d.includes(lesson.id) ? d : [...d, lesson.id]));
    if (idx < LESSONS.length - 1) { setActive(LESSONS[idx + 1].id); window.scrollTo({ top: 0, behavior: "smooth" }); }
  };

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: "2rem", paddingBottom: "3rem" }}>
        <div className="page-header-inner" style={{ marginBottom: "1.5rem" }}>
          <div>
            <h1 className="page-title">Learning Hub</h1>
            <p className="page-subtitle">{LESSONS.length} short lessons from candlesticks to verifiable track records. {done.length}/{LESSONS.length} completed.</p>
          </div>
        </div>
        <div className="sidebar-layout">
          <div className="card" style={{ padding: "0.6rem" }}>
            {LESSONS.map((l, i) => (
              <button key={l.id} onClick={() => setActive(l.id)} className="btn btn-ghost w-full"
                style={{ justifyContent: "flex-start", whiteSpace: "normal", textAlign: "left", background: l.id === active ? "var(--accent-light)" : undefined, color: l.id === active ? "var(--text-primary)" : undefined }}>
                {done.includes(l.id) ? <CheckCircle size={16} style={{ color: "var(--success)", flexShrink: 0 }} /> : <Circle size={16} style={{ flexShrink: 0 }} />}
                <span><span className="small muted">{i + 1}.</span> {l.title}</span>
              </button>
            ))}
            {!user && <p className="small muted" style={{ padding: "0.5rem" }}><Link href="/login?next=/learn">Log in</Link> to save your progress.</p>}
          </div>

          <article className="card lesson-body">
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.6rem" }}>
              <span className="badge badge-accent">{lesson.level}</span>
              <span className="badge badge-muted"><Clock size={11} /> {lesson.minutes} min</span>
            </div>
            <h2 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.4rem" }}>{lesson.title}</h2>
            <p style={{ fontSize: "1.02rem" }}>{lesson.summary}</p>
            {lesson.sections.map(s => (
              <section key={s.heading} style={{ marginTop: "1.25rem" }}>
                <h3 style={{ fontWeight: 700, marginBottom: "0.5rem" }}>{s.heading}</h3>
                {s.paragraphs?.map(p => <p key={p}>{p}</p>)}
                {s.bullets && <ul>{s.bullets.map(b => <li key={b}>{b}</li>)}</ul>}
              </section>
            ))}
            {error && <div className="alert alert-danger small">{error}</div>}
            <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", marginTop: "1.5rem" }}>
              <button className="btn btn-primary" onClick={complete} disabled={loading}>
                <CheckCircle size={16} /> {done.includes(lesson.id) ? "Completed" : "Mark complete"}{idx < LESSONS.length - 1 ? " & next" : ""}
              </button>
              {lesson.tryIt && <Link href={lesson.tryIt.href} className="btn btn-secondary">{lesson.tryIt.label} <ArrowRight size={15} /></Link>}
            </div>
          </article>
        </div>
      </div>
    </div>
  );
}
