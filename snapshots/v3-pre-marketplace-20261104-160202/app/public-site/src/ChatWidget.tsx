import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, storeConfig } from "./api";
import { answer, toPlain, type Reply } from "./assistant";
import type { Site } from "./data";
import { Link } from "./router";

interface Msg {
  id: number;
  at: string;
  sender: "visitor" | "assistant" | "team" | "system";
  body: string;
}
interface State {
  mode: "assistant" | "waiting" | "human";
  status: string;
  team_online: boolean;
  messages: Msg[];
}
const KEY = "ravisn.chat.v1";
const SUGGESTIONS = ["Find a product", "How does ordering work?", "Delivery and dispatch", "Talk to the team"];

function stored(): { id: string; token: string } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "null");
  } catch {
    return null;
  }
}

/** Plain text with product codes and site paths turned into links. Never rendered as HTML. */
function Rich({ text, close }: { text: string; close: () => void }) {
  return (
    <>
      {text.split("\n").map((line, i) => {
        const path = /^(.*?):\s(\/[\w/?=&%.-]*)$/.exec(line);
        if (path)
          return (
            <p key={i}>
              <Link to={path[2]} className="chat-link" onClick={close}>
                {path[1]}
              </Link>
            </p>
          );
        const code = /^((UK|US|CA|DE|AU)-\d{4,5}) · (.*)$/.exec(line);
        if (code) {
          const slug = { UK: "uk", US: "usa", CA: "canada", DE: "germany", AU: "australia" }[code[2]];
          return (
            <p key={i} className="chat-product">
              <Link to={`/${slug}/${code[1]}`} onClick={close}>
                <span className="code">{code[1]}</span> {code[3]}
              </Link>
            </p>
          );
        }
        return <p key={i}>{line}</p>;
      })}
    </>
  );
}

export default function ChatWidget({ site, slug }: { site: Site | null; slug?: string }) {
  const [open, setOpen] = useState(false);
  const [chat, setChat] = useState(stored);
  const [state, setState] = useState<State | null>(null);
  const [online, setOnline] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leave, setLeave] = useState(false);
  const [contact, setContact] = useState({ name: "", contact: "", message: "" });
  const [unread, setUnread] = useState(0);
  const [replies, setReplies] = useState<Record<number, Reply>>({});
  const seen = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const honey = useRef<HTMLInputElement>(null);

  const save = (c: { id: string; token: string } | null) => {
    setChat(c);
    try {
      if (c) localStorage.setItem(KEY, JSON.stringify(c));
      else localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  };

  const refresh = useCallback(async () => {
    if (!chat) return;
    try {
      const s = await api<State>(`/api/store/chat/${chat.id}`, { headers: { "X-Chat-Token": chat.token } });
      setState(s);
      setOnline(s.team_online);
      const last = s.messages.at(-1)?.id ?? 0;
      if (!open && last > seen.current) setUnread(s.messages.filter((m) => m.id > seen.current && (m.sender === "team" || m.sender === "system")).length);
      if (open) seen.current = last;
    } catch (e) {
      if ((e as ApiError).status === 410 || (e as ApiError).status === 404) {
        save(null);
        setState(null);
      }
    }
  }, [chat, open]);

  useEffect(() => {
    storeConfig().then((c) => setOnline(c.team_online), () => {});
  }, [open]);
  useEffect(() => {
    if (!chat) return;
    refresh();
    const live = state?.mode !== "assistant";
    if (!open && !live) return;
    const t = setInterval(refresh, open ? 4000 : 20000);
    return () => clearInterval(t);
  }, [chat, open, refresh, state?.mode]);
  useEffect(() => {
    const on = (e: Event) => {
      setOpen(true);
      const m = (e as CustomEvent).detail?.message;
      if (m) setText(m);
      setTimeout(() => input.current?.focus(), 50);
    };
    window.addEventListener("ravisn-chat", on);
    return () => window.removeEventListener("ravisn-chat", on);
  }, []);
  useEffect(() => {
    if (open) {
      setUnread(0);
      seen.current = state?.messages.at(-1)?.id ?? seen.current;
    }
  }, [open, state?.messages.length]);
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [state?.messages.length, open, leave, busy]);

  const ensure = async () => {
    if (chat) return chat;
    const c = await api<{ id: string; token: string }>("/api/store/chat", { body: { page: location.pathname, website: honey.current?.value ?? "" } });
    save(c);
    return c;
  };

  const send = async (value = text) => {
    const t = value.trim();
    if (!t || busy || !site) return;
    if (/^talk to the team$/i.test(t)) return askTeam();
    setBusy(true);
    setError(null);
    try {
      const c = await ensure();
      const mode = state?.mode ?? "assistant";
      const reply = mode === "assistant" ? await answer(t, site, slug) : null;
      const s = await api<State>(`/api/store/chat/${c.id}/messages`, {
        body: { text: t, assistant_reply: reply ? toPlain(reply) : null },
        headers: { "X-Chat-Token": c.token },
      });
      if (reply) {
        const last = [...s.messages].reverse().find((m) => m.sender === "assistant");
        if (last) setReplies((r) => ({ ...r, [last.id]: reply }));
      }
      setState(s);
      setText("");
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const askTeam = async (withMessage = false) => {
    setBusy(true);
    setError(null);
    try {
      const c = await ensure();
      const body = withMessage ? contact : {};
      const s = await api<State>(`/api/store/chat/${c.id}/team`, { body, headers: { "X-Chat-Token": c.token } });
      setState(s);
      setOnline(s.team_online);
      setLeave(!s.team_online && !withMessage);
      if (withMessage) setContact({ name: "", contact: "", message: "" });
      setText("");
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const mode = state?.mode ?? "assistant";
  const close = () => setOpen(false);
  const messages = state?.messages ?? [];
  const lastReply = [...messages].reverse().find((m) => m.sender === "assistant");
  const offerTeam = mode === "assistant" && lastReply && replies[lastReply.id]?.offerTeam;

  return (
    <>
      <button className={open ? "chat-fab hidden" : "chat-fab"} onClick={() => setOpen(true)} aria-label={unread ? `Chat, ${unread} new messages` : "Open chat"}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.2L7 19.5V16a2.5 2.5 0 0 1-2.5-2.5v-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
        {unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>
      {open && (
        <section className="chat-panel" role="dialog" aria-label="Chat with Ravisn Ltd">
          <header className="chat-head">
            <div>
              <div className="chat-title">{mode === "human" ? "Ravisn Ltd team" : "Ravisn help"}</div>
              <div className="chat-sub">
                <span className={online ? "presence on" : "presence"} />
                {mode === "human" ? "You're chatting with our team" : online ? "Automated help · team online" : "Automated help · team away"}
              </div>
            </div>
            <button className="chat-close" onClick={close} aria-label="Close chat">
              ×
            </button>
          </header>
          <div className="chat-body" ref={list} aria-live="polite">
            {messages.length === 0 && (
              <div className="chat-msg from-assistant">
                <p>Hello. I can find products by name or code, explain ordering and delivery, and answer from Ravisn's published policies. You can ask for the team at any time.</p>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg from-${m.sender}`}>
                {m.sender === "team" && <div className="chat-who">Ravisn Ltd team</div>}
                {m.sender === "assistant" && replies[m.id] ? (
                  <>
                    <p className="pre">{replies[m.id].text}</p>
                    {replies[m.id].products?.map((p) => (
                      <Link key={p.code} to={`/${p.slug}/${p.code}`} className="chat-card" onClick={close}>
                        <span className="code">{p.code}</span>
                        <span className="chat-card-name">{p.name}</span>
                        <span className="muted small">
                          {p.price} · {p.status}
                          {p.stock ? ` · ${p.stock}` : ""}
                        </span>
                      </Link>
                    ))}
                    {replies[m.id].links?.map((l) => (
                      <Link key={l.to} to={l.to} className="chat-link" onClick={close}>
                        {l.label}
                      </Link>
                    ))}
                  </>
                ) : (
                  <Rich text={m.body} close={close} />
                )}
                {m.sender === "system" && !online && m.body.startsWith("Need a little more help") && site && (
                  <a className="chat-link" href={`https://wa.me/${site.whatsapp.number}`} target="_blank" rel="noopener noreferrer">
                    WhatsApp {site.whatsapp.display}
                  </a>
                )}
              </div>
            ))}
            {busy && <div className="chat-typing" aria-label="Sending" />}
            {leave && (
              <form
                className="chat-leave"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (contact.message.trim()) askTeam(true);
                }}
              >
                <input placeholder="Your name" value={contact.name} onChange={(e) => setContact({ ...contact, name: e.target.value })} maxLength={80} aria-label="Your name" />
                <input placeholder="Email or phone, so we can reply" value={contact.contact} onChange={(e) => setContact({ ...contact, contact: e.target.value })} maxLength={120} aria-label="Email or phone" />
                <textarea placeholder="Your message" rows={3} value={contact.message} onChange={(e) => setContact({ ...contact, message: e.target.value })} maxLength={1000} aria-label="Your message" />
                <div className="row-gap">
                  <button className="btn btn-dark btn-small" disabled={!contact.message.trim() || busy}>
                    Leave message
                  </button>
                  <button type="button" className="btn btn-light btn-small" onClick={() => setLeave(false)}>
                    Not now
                  </button>
                </div>
              </form>
            )}
          </div>
          {error && <div className="chat-error">{error}</div>}
          {!leave && (
            <div className="chat-foot">
              {mode === "assistant" && (messages.length === 0 || offerTeam) && (
                <div className="chat-chips">
                  {(offerTeam ? ["Talk to the team"] : SUGGESTIONS).map((s) => (
                    <button key={s} onClick={() => (s === "Talk to the team" ? askTeam() : s === "Find a product" ? (setText(""), input.current?.focus()) : send(s))}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <form
                className="chat-input"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <textarea
                  ref={input}
                  rows={1}
                  value={text}
                  maxLength={1000}
                  placeholder={mode === "assistant" ? "Ask about a product or code" : "Write a message"}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  aria-label="Message"
                />
                <input ref={honey} className="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" />
                <button className="chat-send" disabled={!text.trim() || busy} aria-label="Send">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M5 12h13M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </form>
              <div className="chat-note">
                {mode === "assistant" && (
                  <button className="text-btn small" onClick={() => askTeam()}>
                    Talk to the team
                  </button>
                )}
                <span>
                  Chats are kept to help us reply. <Link to="/privacy" onClick={close}>Privacy</Link>
                </span>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
