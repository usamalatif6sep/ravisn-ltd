import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, storeConfig, type PublicOrder } from "./api";
import { answer, SUGGESTION_GROUPS, toPlain, WELCOME, type Action, type Memory, type Reply } from "./assistant";
import { Icon as LxIcon, type IconName } from "./icons";
import { saveOrder, savedOrders } from "./cart";
import type { Site } from "./data";
import { money } from "./format";
import { Link, navigate } from "./router";

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
const SLUGS: Record<string, string> = { UK: "uk", US: "usa", CA: "canada", DE: "germany", AU: "australia" };

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
        const code = /^((?:RVN-)?(UK|US|CA|DE|AU)-\d{4,5}) · (.*)$/.exec(line);
        if (code)
          return (
            <p key={i} className="chat-product">
              <Link to={`/${SLUGS[code[2]]}/${code[1]}`} onClick={close}>
                <span className="code">{code[1]}</span> {code[3]}
              </Link>
            </p>
          );
        return <p key={i}>{line}</p>;
      })}
    </>
  );
}

const ORDER_RE = /\b(RVS-\d{4}-\d{6}|RV\d{6}-[A-Z0-9]{5})\b/i;
const KEY_RE = /\b([0-9a-f]{32})\b/i;
const STATUS: Record<string, string> = { not_applicable: "Not needed", quote_pending: "Quote being prepared", awaiting_payment: "Awaiting payment", paid: "Paid" };
const LABEL: Record<string, string> = { none: "No label yet", submitted: "Label being checked", approved: "Label checked", rejected: "Label needs a change" };

function OrderCard({ o, token, close }: { o: PublicOrder; token: string; close: () => void }) {
  return (
    <div className="chat-order">
      <div className="chat-order-head">
        <span className="code">{o.number}</span>
        <span className="pill">{o.status}</span>
      </div>
      <dl>
        <dt>Payment</dt>
        <dd>{o.payment_status}</dd>
        <dt>Products</dt>
        <dd>
          {o.items.length} {o.items.length === 1 ? "line" : "lines"} · {money(o.subtotal_minor, o.symbol)} {o.currency}
          {o.prices_pending ? " + prices to confirm" : ""}
        </dd>
        {o.shipments.map((s, i) => (
          <div key={s.id} className="chat-order-ship">
            <dt>{o.shipments.length > 1 ? `Shipment ${i + 1}` : "Shipping"}</dt>
            <dd>
              {s.arranged_by === "reseller" ? `Your label · ${LABEL[s.label_status]}` : `Ravisn quote · ${STATUS[s.payment_status]}`}
              {s.dispatch_status === "dispatched" ? ` · Dispatched${s.carrier ? ` with ${s.carrier}` : ""}${s.tracking ? `, tracking ${s.tracking}` : ""}` : " · Not dispatched yet"}
            </dd>
          </div>
        ))}
      </dl>
      <Link to={`/order/${o.number}#t=${token}`} className="chat-link" onClick={close}>
        Open the full order
      </Link>
    </div>
  );
}

function Suggestions({ send }: { send: (s: string) => void }) {
  const [group, setGroup] = useState(0);
  return (
    <div className="chat-suggest lx-suggest">
      <div className="lx-suggest-tabs" role="tablist" aria-label="Suggested questions">
        {SUGGESTION_GROUPS.map((g, i) => (
          <button key={g.title} role="tab" aria-selected={i === group} className={i === group ? "on" : undefined} onClick={() => setGroup(i)}>
            {g.title}
          </button>
        ))}
      </div>
      {SUGGESTION_GROUPS[group].items.map((s) => (
        <button key={s} className="lx-suggest-q" onClick={() => send(s)}>
          <span>{s}</span>
          <LxIcon name="arrow" size={14} />
        </button>
      ))}
    </div>
  );
}

type Local = { after: number; order: PublicOrder; token: string } | { after: number; note: string };

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
  const [showAll, setShowAll] = useState(false);
  const [verify, setVerify] = useState(false);
  const [check, setCheck] = useState({ number: "", key: "" });
  const [checkError, setCheckError] = useState<string | null>(null);
  const [local, setLocal] = useState<Local[]>([]);
  const mem = useRef<Memory>({ misses: 0 });
  const seen = useRef(0);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const honey = useRef<HTMLInputElement>(null);
  const sendRef = useRef<(t: string) => void>(() => {});

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
      const d = (e as CustomEvent).detail ?? {};
      if (d.message && d.send) setTimeout(() => sendRef.current(d.message), 30);
      else if (d.message) setText(d.message);
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
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" });
  }, [state?.messages.length, open, leave, busy, verify, local.length]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);

  const ensure = async () => {
    if (chat) return chat;
    const c = await api<{ id: string; token: string }>("/api/store/chat", { body: { page: location.pathname, website: honey.current?.value ?? "" } });
    save(c);
    return c;
  };
  const lastId = () => state?.messages.at(-1)?.id ?? 0;

  const send = async (value = text) => {
    const t = value.trim();
    if (!t || busy || !site) return;
    if (/^talk to the ravisn team$/i.test(t)) return askTeam();
    setBusy(true);
    setError(null);
    setShowAll(false);
    setVerify(false);
    try {
      const c = await ensure();
      const mode = state?.mode ?? "assistant";
      const reply = mode === "assistant" ? await answer(t, site, slug, mem.current) : null;
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
  sendRef.current = (t: string) => void send(t);

  const askTeam = async (withMessage = false) => {
    setBusy(true);
    setError(null);
    setShowAll(false);
    setVerify(false);
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

  const checkOrder = async (number: string, token: string) => {
    setBusy(true);
    setCheckError(null);
    try {
      const o = await api<PublicOrder>(`/api/store/orders/${encodeURIComponent(number)}`, { headers: { "X-Order-Token": token } });
      saveOrder({ number: o.number, token, at: o.created_at, catalogue: site?.countries.find((c) => c.key === o.catalogue)?.slug ?? o.catalogue });
      setLocal((l) => [...l, { after: lastId(), order: o, token }]);
      setVerify(false);
      setCheck({ number: "", key: "" });
    } catch (e) {
      const err = e as ApiError;
      setCheckError(err.status === 404 || err.status === 403 ? "That order number and access key don't match. Check the private link you saved when you sent the order." : err.message);
    } finally {
      setBusy(false);
    }
  };
  const submitCheck = () => {
    const raw = `${check.number} ${check.key}`;
    const n = ORDER_RE.exec(raw)?.[1]?.toUpperCase();
    const k = KEY_RE.exec(check.key)?.[1]?.toLowerCase() ?? KEY_RE.exec(raw)?.[1]?.toLowerCase();
    if (!n) return setCheckError("Enter your order number, for example RVS-2026-000184.");
    if (!k) return setCheckError("Paste the private order link or the 32-character access key you received.");
    checkOrder(n, k);
  };

  const close = () => setOpen(false);
  const act = (a: Action) => {
    if (a.team) return askTeam();
    if (a.send) return send(a.send);
    if (a.verify) return setVerify(true), setCheckError(null);
    if (a.order) {
      const saved = savedOrders().find((o) => o.number === a.order);
      if (saved) return checkOrder(saved.number, saved.token);
      return setVerify(true);
    }
    if (a.to) return navigate(a.to), close();
  };

  const mode = state?.mode ?? "assistant";
  const messages = state?.messages ?? [];
  const fresh = messages.length === 0 && local.length === 0;
  const QUICK: { label: string; hint: string; icon: IconName; action: Action }[] = [
    { label: "Find products", hint: "Search all catalogues", icon: "search", action: { label: "", send: "Find products to resell" } },
    { label: "How ordering works", hint: "Four simple steps", icon: "layers", action: { label: "", send: "How do I place an order?" } },
    { label: "Shipping", hint: "Your label or our quote", icon: "truck", action: { label: "", send: "Who pays for shipping?" } },
    { label: "Track an order", hint: "Private and secure", icon: "pin", action: { label: "", verify: true } },
    { label: "Product enquiry", hint: "Can't see what you need?", icon: "help", action: { label: "", send: "Can you find a product that isn't listed?" } },
    { label: "Talk to the team", hint: "A real person", icon: "person", action: { label: "", team: true } },
  ];

  const renderLocal = (after: number) =>
    local
      .filter((l) => l.after === after)
      .map((l, i) => (
        <div key={`l-${after}-${i}`} className="chat-msg from-assistant">
          {"order" in l ? (
            <>
              <p>Here's the latest on {l.order.number}. Only you can see this, because you entered its private access key.</p>
              <OrderCard o={l.order} token={l.token} close={close} />
            </>
          ) : (
            <p>{l.note}</p>
          )}
        </div>
      ));

  return (
    <>
      <button className={open ? "chat-fab hidden" : "chat-fab"} onClick={() => setOpen(true)} aria-label={unread ? `Ravisn Assistant, ${unread} new messages` : "Open Ravisn Assistant"}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4.5 6.5A2.5 2.5 0 0 1 7 4h10a2.5 2.5 0 0 1 2.5 2.5v7A2.5 2.5 0 0 1 17 16h-6.2L7 19.5V16a2.5 2.5 0 0 1-2.5-2.5v-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        </svg>
        <span className="chat-fab-label">Ask Ravisn</span>
        {online && <span className="lx-fab-dot" aria-hidden="true" />}
        {unread > 0 && <span className="chat-badge">{unread}</span>}
      </button>
      {open && (
        <section className="chat-panel lx-chat" role="dialog" aria-label="Ravisn Assistant">
          <header className="chat-head">
            <div className="chat-avatar" aria-hidden="true">
              R<span className={online ? "lx-av-dot on" : "lx-av-dot"} />
            </div>
            <div className="chat-head-text">
              <div className="chat-title">{mode === "human" ? "Ravisn team" : "Ravisn Assistant"}</div>
              <div className="chat-sub">
                {mode === "human" ? "You're chatting with a member of our team" : mode === "waiting" ? "Waiting for the team to join" : online ? "Instant answers · Team online now" : "Instant answers · Team away, leave a message"}
              </div>
            </div>
            <button className="chat-close" onClick={close} aria-label="Close chat">
              ×
            </button>
          </header>
          <div className="chat-body" ref={list} aria-live="polite">
            {fresh && mode === "assistant" ? (
              <div className="lx-chat-hero">
                <p className="lx-chat-hello">Welcome to Ravisn</p>
                <p>{WELCOME}</p>
              </div>
            ) : (
              <div className="chat-msg from-assistant">
                <p>{WELCOME}</p>
              </div>
            )}
            {fresh && mode === "assistant" && (
              <>
                <div className="chat-quick lx-quick">
                  {QUICK.map((q) => (
                    <button key={q.label} onClick={() => act(q.action)}>
                      <span className="lx-quick-ico">
                        <LxIcon name={q.icon} size={18} />
                      </span>
                      <span className="lx-quick-text">
                        <strong>{q.label}</strong>
                        <small>{q.hint}</small>
                      </span>
                    </button>
                  ))}
                </div>
                <Suggestions send={(s) => send(s)} />
                {site && (
                  <div className="lx-escalate">
                    <span>
                      <strong>Prefer a person?</strong>
                      <small>{online ? "The team is online now." : "Leave a message, or use WhatsApp for anything urgent."}</small>
                    </span>
                    <div>
                      <button onClick={() => askTeam()}>Chat with the team</button>
                      <a href={`https://wa.me/${site.whatsapp.number}`} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp ${site.whatsapp.display}`}>
                        <LxIcon name="whatsapp" size={17} />
                      </a>
                    </div>
                  </div>
                )}
              </>
            )}
            {renderLocal(0)}
            {messages.map((m) => (
              <div key={m.id}>
                <div className={`chat-msg from-${m.sender}`}>
                  {m.sender === "team" && <div className="chat-who">Ravisn team</div>}
                  {m.sender === "assistant" && replies[m.id] ? (
                    <>
                      <p className="pre">{replies[m.id].text}</p>
                      {!!replies[m.id].products?.length && (
                        <div className="chat-cards">
                          {replies[m.id].products!.map((p) => (
                            <Link key={p.code} to={`/${p.slug}/${p.code}`} className="chat-card" onClick={close}>
                              <span className="chat-card-img">{p.image ? <img src={p.image} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="chat-card-ph" />}</span>
                              <span className="chat-card-text">
                                <span className="code">{p.code}</span>
                                <span className="chat-card-name">{p.name}</span>
                                <span className="chat-card-meta">
                                  <strong>{p.price}</strong> · {p.status}
                                  {p.stock ? ` · ${p.stock}` : ""}
                                </span>
                              </span>
                            </Link>
                          ))}
                        </div>
                      )}
                      {!!replies[m.id].actions?.length && (
                        <div className="chat-actions">
                          {replies[m.id].actions!.map((a, i) =>
                            a.whatsapp && site ? (
                              <a key={i} className="chat-action wa" href={`https://wa.me/${site.whatsapp.number}`} target="_blank" rel="noopener noreferrer">
                                {a.label}
                              </a>
                            ) : (
                              <button key={i} className={a.to ? "chat-action link" : "chat-action"} onClick={() => act(a)}>
                                {a.label}
                              </button>
                            ),
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <Rich text={m.body} close={close} />
                  )}
                  {m.sender === "system" && !online && m.body.startsWith("Need a little more help") && site && (
                    <a className="chat-action wa" href={`https://wa.me/${site.whatsapp.number}`} target="_blank" rel="noopener noreferrer">
                      WhatsApp {site.whatsapp.display}
                    </a>
                  )}
                </div>
                {renderLocal(m.id)}
              </div>
            ))}
            {verify && (
              <form
                className="chat-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  submitCheck();
                }}
              >
                <div className="chat-form-title">Check an order securely</div>
                <p className="muted small">Enter the order number and paste the private link or access key from your confirmation. We never show an order to someone who only knows its number.</p>
                <input placeholder="Order number, e.g. RVS-2026-000184" value={check.number} onChange={(e) => setCheck({ ...check, number: e.target.value })} maxLength={40} aria-label="Order number" autoComplete="off" />
                <input placeholder="Private order link or access key" value={check.key} onChange={(e) => setCheck({ ...check, key: e.target.value })} maxLength={300} aria-label="Private order link or access key" autoComplete="off" />
                {checkError && <div className="chat-form-error">{checkError}</div>}
                <div className="row-gap">
                  <button className="btn btn-dark btn-small" disabled={busy}>
                    Check order
                  </button>
                  <button type="button" className="btn btn-light btn-small" onClick={() => setVerify(false)}>
                    Cancel
                  </button>
                </div>
                <button type="button" className="text-btn small" onClick={() => askTeam()}>
                  Lost your link? Ask the team
                </button>
              </form>
            )}
            {busy && <div className="chat-typing" aria-label="Working" />}
            {leave && (
              <form
                className="chat-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (contact.message.trim()) askTeam(true);
                }}
              >
                <div className="chat-form-title">Leave a message for the team</div>
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
            {showAll && mode === "assistant" && <Suggestions send={(s) => send(s)} />}
          </div>
          {error && <div className="chat-error">{error}</div>}
          {!leave && (
            <div className="chat-foot">
              {mode === "assistant" && !fresh && (
                <div className="chat-foot-links">
                  <button onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
                    {showAll ? "Hide questions" : "Suggested questions"}
                  </button>
                  <button onClick={() => (setVerify(true), setCheckError(null))}>Track an order</button>
                  <button onClick={() => askTeam()}>Talk to the team</button>
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
                  placeholder={mode === "assistant" ? "Ask about products, orders or shipping" : "Write a message to the team"}
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
                Automated replies come from Ravisn's catalogue and published information. Chats are kept to help us reply.{" "}
                <Link to="/privacy" onClick={close}>
                  Privacy
                </Link>
              </div>
            </div>
          )}
        </section>
      )}
    </>
  );
}
