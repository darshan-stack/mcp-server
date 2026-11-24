import { useMemo, useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowUpRight, Check, ChevronDown, Clock3, FilePenLine, LoaderCircle, LogOut, Pause, Play, Plus, RefreshCw, Send, Settings2, ShieldCheck, X as XIcon } from "lucide-react";

type Status = "pending" | "publishing" | "published" | "rejected" | "failed" | "unknown";
const statusLabel: Record<Status, string> = {
  pending: "Needs your review",
  publishing: "Sending to X…",
  published: "Published",
  rejected: "Rejected",
  failed: "Not published",
  unknown: "Check X before retrying",
};

// Local bypass — no Manus OAuth required.
// Clicking the local button sets this flag and reloads the page.
const isDevMode = typeof window !== "undefined" && localStorage.getItem("pq_dev") === "1";

function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(date);
}

export default function Home() {
  const auth = useAuth();
  const utils = trpc.useUtils();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [topics, setTopics] = useState("");
  const [tone, setTone] = useState("");
  const [unlockError, setUnlockError] = useState("");
  const [unlockPending, setUnlockPending] = useState(false);
  const postsQuery = trpc.posts.list.useQuery(undefined, { enabled: auth.user?.role === "admin", refetchInterval: 20_000 });
  const settingsQuery = trpc.settings.get.useQuery(undefined, { enabled: auth.user?.role === "admin" });
  const posts = postsQuery.data ?? [];
  const pendingPosts = useMemo(() => posts.filter(post => post.status === "pending"), [posts]);
  const history = useMemo(() => posts.filter(post => post.status !== "pending"), [posts]);
  const selected = posts.find(post => post.id === selectedId) ?? pendingPosts[0] ?? posts[0];
  const refresh = async () => { await Promise.all([utils.posts.list.invalidate(), utils.settings.get.invalidate()]); };

  const generate = trpc.posts.generate.useMutation({ onSuccess: result => { toast.success(result.created ? "Draft added to your review queue." : result.reason === "review_pending" ? "You already have a draft waiting for review." : "No draft was added this time."); void refresh(); }, onError: error => toast.error(error.message) });
  const create = trpc.posts.create.useMutation({ onSuccess: post => { setSelectedId(post.id); setEditedText(""); toast.success("Draft saved. It has not been published."); void refresh(); }, onError: error => toast.error(error.message) });
  const update = trpc.posts.update.useMutation({ onSuccess: () => { setEditing(false); toast.success("Draft updated; it is still unpublished."); void refresh(); }, onError: error => toast.error(error.message) });
  const reject = trpc.posts.reject.useMutation({ onSuccess: () => { setSelectedId(null); toast.success("Draft rejected. Nothing was posted."); void refresh(); }, onError: error => toast.error(error.message) });
  const approve = trpc.posts.approveAndPublish.useMutation({ onSuccess: () => { setSelectedId(null); toast.success("Published to X."); void refresh(); }, onError: error => toast.error(error.message) });
  const saveSettings = trpc.settings.update.useMutation({ onSuccess: () => { toast.success("Writing preferences saved."); setShowSettings(false); void refresh(); }, onError: error => toast.error(error.message) });
  const pause = trpc.settings.setPaused.useMutation({ onSuccess: () => { toast.success(pause.variables?.paused ? "Generation paused." : "Generation resumed."); void refresh(); }, onError: error => toast.error(error.message) });
  const schedule = trpc.settings.enableSchedule.useMutation({ onSuccess: () => { toast.success("15-minute draft schedule enabled."); void refresh(); }, onError: error => toast.error(error.message) });

  if (auth.loading) return <div className="page-loading"><LoaderCircle className="spin" size={22} /> Loading your private queue…</div>;
  if (!auth.isAuthenticated && !isDevMode) return <main className="login-screen"><div className="login-card"><div className="brand-mark"><FilePenLine size={19} /></div><p className="eyebrow">YOUR X REVIEW INBOX</p><h1>One draft.<br /><em>Your call.</em></h1><p className="login-copy">Original developer notes and occasional dry humor, ready when you are. Nothing publishes without your approval.</p><button className="button button-primary button-wide" onClick={() => { localStorage.setItem("pq_dev", "1"); window.location.reload(); }}>Continue as Owner (Local)</button><p className="tiny-note">Local mode — no Manus OAuth. X publishing remains off until you connect it.</p></div></main>;

  if (auth.user?.role !== "admin") {
    const isProd = process.env.NODE_ENV === "production";
    return (
      <main className="login-screen">
        <div className="login-card setup-card">
          <div className="brand-mark"><ShieldCheck size={19} /></div>
          <p className="eyebrow">OWNER ACCESS</p>
          <h1>This queue is<br /><em>private.</em></h1>
          {isProd ? (
            <>
              <p className="login-copy">Enter the access password to continue.</p>
              <form onSubmit={async e => {
                e.preventDefault();
                const form = e.currentTarget as HTMLFormElement;
                const pwd = form.elements.namedItem("pwd") as HTMLInputElement;
                const val = pwd.value.trim();
                if (!val) return;
                setUnlockError("");
                setUnlockPending(true);
                localStorage.setItem("pq_pwd", val);
                try {
                  const verifiedUser = await utils.auth.me.fetch();
                  if (verifiedUser?.role !== "admin") {
                    localStorage.removeItem("pq_pwd");
                    setUnlockError("That password was not accepted. Check it and try again.");
                    return;
                  }
                  document.cookie = `pq_pwd=${encodeURIComponent(val)}; Path=/; Max-Age=${60*60*24*30}; SameSite=Lax`;
                  localStorage.removeItem("pq_dev");
                  window.location.reload();
                } catch (error) {
                  localStorage.removeItem("pq_pwd");
                  console.error("Password verification failed", error);
                  setUnlockError("Unable to verify access right now. Please try again shortly.");
                } finally {
                  setUnlockPending(false);
                }
              }}>
                <input name="pwd" type="password" className="pwd-input" placeholder="Access password" autoComplete="current-password" required />
                <button className="button button-primary button-wide" type="submit" disabled={unlockPending}>{unlockPending ? "Checking…" : "Unlock"}</button>
              </form>
              {unlockError && <p role="alert" style={{ color: "#b42318", fontSize: "0.85rem", marginTop: 10 }}>{unlockError}</p>}
              <p className="tiny-note">Set ACCESS_PASSWORD in Vercel Environment Variables to enable this.</p>
            </>
          ) : (
            <>
              <p className="login-copy">Local development — click to enter.</p>
              <button className="button button-primary button-wide" onClick={() => { localStorage.setItem("pq_dev", "1"); window.location.reload(); }}>Continue as Owner (Local)</button>
              <p className="tiny-note">Local mode — no password required.</p>
            </>
          )}
        </div>
      </main>
    );
  }

  const settings = settingsQuery.data;
  const draftText = editing ? editedText : selected?.content ?? "";
  const remaining = 280 - draftText.length;
  const busy = generate.isPending || create.isPending || update.isPending || reject.isPending || approve.isPending || schedule.isPending;

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="/"><span className="brand-mark"><FilePenLine size={17} /></span><span>postqueue<span className="brand-period">.</span></span></a><div className="topbar-right"><span className="owner-chip"><span className="owner-dot" /> Private workspace</span><button className="icon-button" title="Writing settings" onClick={() => { setTopics(settings?.topics ?? ""); setTone(settings?.tone ?? ""); setShowSettings(!showSettings); }}><Settings2 size={18} /></button><button className="icon-button" title="Sign out" onClick={() => auth.logout()}><LogOut size={17} /></button></div></header>

    <main className="main-wrap">
      <section className="intro-row"><div><p className="eyebrow">THE APPROVAL DESK</p><h1>Review queue<span className="heading-dot">.</span></h1><p className="subhead">Drafts wait here. You decide what goes out.</p></div><div className="queue-count"><span className="count-number">{pendingPosts.length.toString().padStart(2, "0")}</span><span className="count-label">awaiting review</span></div></section>

      {showSettings && <section className="settings-panel"><div className="panel-heading"><div><p className="eyebrow">VOICE & SUBJECTS</p><h2>Make it sound like you</h2></div><button className="icon-button" onClick={() => setShowSettings(false)} aria-label="Close settings"><XIcon size={18} /></button></div><label className="field-label" htmlFor="topics">Topics</label><textarea id="topics" className="settings-textarea" value={topics} onChange={event => setTopics(event.target.value)} maxLength={1200} placeholder="What should your drafts be about?"/><label className="field-label" htmlFor="tone">Voice</label><textarea id="tone" className="settings-textarea short-textarea" value={tone} onChange={event => setTone(event.target.value)} maxLength={800} placeholder="Casual, concise, first-person…"/><div className="settings-footer"><span className="muted">No trend hijacking. No invented personal claims.</span><button className="button button-primary" disabled={saveSettings.isPending} onClick={() => saveSettings.mutate({ topics, tone })}>Save preferences</button></div></section>}

      <section className="status-strip"><div className="x-status-group"><div className="status-item"><span className={`status-indicator ${settings?.xConnected ? "is-ready" : "is-waiting"}`} /><div><b>{settings?.xConnected ? "X connected" : "X not connected"}</b><span>{settings?.xConnected ? "Approval publishes through the official API" : "Open X separately; add the user access token in Vercel to publish"}</span></div></div>{!settings?.xConnected && <a className="button button-secondary status-x-button" href="https://x.com/home" target="_blank" rel="noopener noreferrer">Open X <ArrowUpRight size={14}/></a>}</div><div className="status-divider"/><div className="status-item"><Clock3 size={17} className="status-icon"/><div><b>{settings?.scheduleEnabled ? "15-minute drafts enabled" : "Draft schedule off"}</b><span>{settings?.scheduleEnabled ? "A pending draft pauses new generation" : "Turn on after the app is published"}</span></div></div></section>

      <section className="content-grid">
        <div className="queue-column"><div className="section-heading"><div><p className="eyebrow">INBOX</p><h2>{pendingPosts.length ? "Ready for your review" : "Nothing waiting"}</h2></div><button className="button button-secondary generate-button" disabled={busy} onClick={() => generate.mutate()}>{generate.isPending ? <LoaderCircle size={15} className="spin"/> : <RefreshCw size={15}/>} Generate a draft</button></div>
          {pendingPosts.length > 1 && <div className="queue-list">{pendingPosts.map((post, index) => <button key={post.id} className={`queue-row ${selected?.id === post.id ? "queue-row-active" : ""}`} onClick={() => { setSelectedId(post.id); setEditing(false); }}><span className="queue-number">{String(index + 1).padStart(2, "0")}</span><span className="queue-preview">{post.content}</span><span className="queue-date">{formatDate(post.createdAt)}</span><ChevronDown size={14} className="queue-arrow"/></button>)}</div>}
          {selected && selected.status === "pending" ? <article className="draft-card"><div className="draft-meta"><span className="draft-tag">{selected.category.replaceAll("-", " ")}</span><span className="draft-date">Drafted {formatDate(selected.createdAt)}</span><span className="draft-state"><span className="owner-dot"/> Needs your review</span></div>{editing ? <textarea className="draft-editor" value={editedText} onChange={event => setEditedText(event.target.value)} maxLength={280} autoFocus/> : <p className="draft-copy">{selected.content}</p>}<div className="draft-bottom"><span className={`character-count ${remaining < 0 ? "over-limit" : ""}`}>{draftText.length} <span>/ 280 characters</span></span><span className="approval-lock"><ShieldCheck size={14}/> Approval required</span></div><div className="draft-actions">{editing ? <><button className="button button-secondary" disabled={busy || remaining < 0} onClick={() => update.mutate({ id: selected.id, content: editedText })}>Save edit</button><button className="button button-quiet" disabled={busy} onClick={() => setEditing(false)}>Cancel</button></> : <><button className="button button-primary approve-button" disabled={busy || !settings?.xConnected} onClick={() => approve.mutate({ id: selected.id })}><Check size={17}/> Approve & publish</button><button className="button button-secondary" disabled={busy} onClick={() => { setEditedText(selected.content); setEditing(true); }}><FilePenLine size={16}/> Edit</button><button className="button button-danger" disabled={busy} onClick={() => reject.mutate({ id: selected.id })}><XIcon size={16}/> Reject</button></>}</div>{!settings?.xConnected && <p className="action-hint">Approval stays disabled until an X OAuth 2.0 user access token is added to protected project secrets.</p>}</article> : <div className="empty-card"><div className="empty-icon"><Send size={19}/></div><h3>Your next draft lands here.</h3><p>Generate one now, or enable the 15-minute schedule after publishing. If a draft is waiting, the scheduler skips its next slot.</p><div className="empty-note"><ShieldCheck size={15}/> Nothing is ever auto-published.</div></div>}
          <div className="history-head"><div><p className="eyebrow">RECENT ACTIVITY</p><h2>History</h2></div><span>{history.length} items</span></div>
          {history.length ? <div className="history-list">{history.slice(0, 8).map(post => <article className="history-row" key={post.id}><div className={`history-marker history-${post.status}`} /> <div className="history-body"><div className="history-title"><span>{statusLabel[post.status as Status] ?? post.status}</span><time>{formatDate(post.updatedAt)}</time></div><p>{post.content}</p>{post.errorMessage && <small>{post.errorMessage}</small>}{post.xPostId && <a href={`https://x.com/i/status/${post.xPostId}`} target="_blank" rel="noreferrer">View on X <ArrowUpRight size={12}/></a>}</div></article>)}</div> : <p className="history-empty">No decisions yet. Your first review starts the history.</p>}
        </div>

        <aside className="side-column"><section className="side-card cadence-card"><div className="side-card-top"><span className="side-icon"><Clock3 size={16}/></span><span className="small-label">CADENCE</span></div><div className="cadence-value">Every <strong>15</strong> min</div><p>One fresh draft at a time. If you have one to review, the next slot is skipped.</p><button className={`button ${settings?.paused ? "button-secondary" : "button-quiet"} side-control`} disabled={busy || !settings?.scheduleEnabled} onClick={() => pause.mutate({ paused: !settings?.paused })}>{settings?.paused ? <><Play size={14}/> Resume schedule</> : <><Pause size={14}/> Pause schedule</>}</button>{!settings?.scheduleEnabled && <button className="button button-primary side-control" disabled={busy || !settings?.canSchedule} onClick={() => schedule.mutate()}>{schedule.isPending ? <LoaderCircle size={14} className="spin"/> : <Play size={14}/>} {settings?.canSchedule ? "Enable schedule" : "Available after publish"}</button>}</section>
          <section className="side-card guard-card"><div className="side-card-top"><span className="side-icon safe-icon"><ShieldCheck size={16}/></span><span className="small-label">PUBLISHING GUARD</span></div><ul><li><Check size={13}/> You approve every post</li><li><Check size={13}/> No trend chasing or copied drafts</li><li><Check size={13}/> Uncertain API result is held</li></ul></section>
          <section className="side-note"><span className="note-line"/><p>Inspired by the rhythms of a personal dev log: small lessons, open-source progress, honest questions, and the occasional bit of developer-life humor.</p><span className="note-attribution">ORIGINAL WORDS, EVERY TIME</span></section>
        </aside>
      </section>
    </main>
    <footer className="app-footer"><span>postqueue<span className="brand-period">.</span> <span className="muted">Your voice, your approval.</span></span><span>Built for human-in-the-loop posting</span></footer>
  </div>;
}
