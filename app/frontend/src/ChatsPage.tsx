import { useCallback, useEffect, useRef, useState } from "react";
import { api, qs } from "./api";
import { when } from "./format";
import * as I from "./icons";
import { useApp } from "./store";
import { isAvailable, refreshStoreSummary, setAvailable, useStoreSummary } from "./storeSummary";
import { Button, cx, Dialog, Empty, Field, Segmented, Spinner, Switch, useToast } from "./ui";

interface ChatRow {
  public_id: string;
  created_at: string;
  last_message_at: string;
  status: "open" | "closed" | "archived";
  mode: "assistant" | "waiting" | "human";
  name: string | null;
  contact: string | null;
  page: string | null;
  unread: number;
  last: { sender: string; body: string; at: string } | null;
}
interface Msg {
  id: number;
  at: string;
  sender: "visitor" | "assistant" | "team" | "system";
  body: string;
}
interface Chat extends Omit<ChatRow, "unread" | "last"> {
  messages: Msg[];
}

const MODE: Record<string, string> = { assistant: "Assistant answering", waiting: "Waiting for you", human: "You are chatting" };
const WHO: Record<string, string> = { visitor: "Visitor", assistant: "Automated reply (shown to the visitor)", team: "You", system: "Notice shown to the visitor" };

export default function ChatsPage({ id }: { id?: string }) {
  const { go } = useApp();
  const toast = useToast();
  const summary = useStoreSummary();
  const [view, setView] = useState<"open" | "closed" | "archived">("open");
  const [rows, setRows] = useState<ChatRow[] | null>(null);
  const [available, setAvail] = useState(isAvailable);
  const [settings, setSettings] = useState(false);
  const load = useCallback(() => api<{ chats: ChatRow[] }>("/api/chats" + qs({ view })).then((d) => setRows(d.chats)), [view]);
  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => load().catch(() => {}), 6000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="page om-page">
      <section className="om-list">
        <div className="om-list-head">
          <h1>Live chat</h1>
          <button className="icon-btn" onClick={() => setSettings(true)} aria-label="Chat retention settings" title="Retention and clean-up">
            <I.Gear size={14} />
          </button>
        </div>
        <label className="om-avail">
          <Switch
            checked={available}
            onChange={(v) => {
              setAvail(v);
              setAvailable(v).then(() => toast({ text: v ? "Resellers now see the team as online" : "Resellers now see the team as away" }));
            }}
            label="Available for chat"
          />
          <span>
            <strong>{available ? "You're available" : "You're away"}</strong>
            <span className="muted">{available ? "Resellers see the team as online while this panel is open." : "Resellers can leave a message, and see WhatsApp for urgent help."}</span>
          </span>
        </label>
        <div className="om-tabs">
          <Segmented size="sm" value={view} onChange={setView} options={[{ value: "open", label: "Open" }, { value: "closed", label: "Closed" }, { value: "archived", label: "Archived" }]} />
          {summary && summary.waiting_chats > 0 && <span className="om-pill om-accent">{summary.waiting_chats} waiting</span>}
        </div>
        <div className="om-rows">
          {!rows ? (
            <Spinner />
          ) : rows.length === 0 ? (
            <Empty title="No conversations here">Chats from the reseller website appear here.</Empty>
          ) : (
            rows.map((c) => (
              <a key={c.public_id} href={`#/chats/${c.public_id}`} className={cx("om-row", c.public_id === id && "on")}>
                <div className="om-row-top">
                  <span className="om-row-name">
                    {c.unread > 0 && <span className="om-new" aria-label="Unread" />}
                    {c.name || "Visitor"}
                  </span>
                  <span className="muted">{when(c.last_message_at)}</span>
                </div>
                <div className="om-row-sub muted om-clip">{c.last ? `${c.last.sender === "team" ? "You: " : c.last.sender === "assistant" ? "Assistant: " : ""}${c.last.body}` : ""}</div>
                <div className="om-row-pills">
                  <span className={cx("om-pill", c.mode === "waiting" ? "om-accent" : c.mode === "human" ? "om-good" : "om-plain")}>{MODE[c.mode]}</span>
                  {c.unread > 0 && <span className="om-pill om-warn">{c.unread} new</span>}
                </div>
              </a>
            ))
          )}
        </div>
      </section>
      <section className="om-detail">
        {id ? (
          <Conversation key={id} id={id} onChanged={load} onGone={() => go({ view: "chats" })} />
        ) : (
          <Empty title="Choose a conversation" icon={<I.Chat size={22} />}>
            The assistant answers from the public catalogue and policies. Take over at any time; the visitor is told when the team joins.
          </Empty>
        )}
      </section>
      {settings && <RetentionDialog onClose={() => setSettings(false)} />}
    </div>
  );
}

function Conversation({ id, onChanged, onGone }: { id: string; onChanged: () => void; onGone: () => void }) {
  const toast = useToast();
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const load = useCallback(
    () =>
      api<Chat>(`/api/chats/${id}`)
        .then(setChat)
        .catch((e) => e.status === 404 && onGone()),
    [id],
  );
  useEffect(() => {
    load().then(() => {
      onChanged();
      refreshStoreSummary();
    });
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" }); // newer browsers return a promise here, which must not become the cleanup
  }, [chat?.messages.length]);

  const act = async (action: string, ok: string) => {
    try {
      const r = await api<any>(`/api/chats/${id}/${action}`, { method: "POST" });
      if (r.deleted) onGone();
      else setChat(r);
      toast({ text: ok });
      onChanged();
      refreshStoreSummary();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    }
  };
  const send = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      setChat(await api<Chat>(`/api/chats/${id}/reply`, { body: { text } }));
      setText("");
      onChanged();
      refreshStoreSummary();
    } catch (e: any) {
      toast({ text: e.message, tone: "error" });
    } finally {
      setSending(false);
    }
  };

  if (!chat) return <div className="center-fill"><Spinner /></div>;
  return (
    <div className="om-chat">
      <header className="om-doc-head">
        <div>
          <div className="om-doc-title">{chat.name || "Visitor"}</div>
          <div className="muted">
            {chat.contact ? `${chat.contact} · ` : ""}Started {when(chat.created_at)}
            {chat.page ? ` on ${chat.page}` : ""} · {MODE[chat.mode]}
          </div>
        </div>
        <div className="row-gap">
          {chat.mode !== "human" ? (
            <Button size="sm" variant="primary" onClick={() => act("takeover", "You have joined the chat")}>
              Take over
            </Button>
          ) : (
            <Button size="sm" onClick={() => act("assistant", "The assistant is answering again")}>
              Hand back to assistant
            </Button>
          )}
          {chat.status === "open" ? (
            <Button size="sm" onClick={() => act("close", "Conversation closed")}>
              Close
            </Button>
          ) : (
            <Button size="sm" onClick={() => act("reopen", "Conversation reopened")}>
              Reopen
            </Button>
          )}
          {chat.status !== "archived" && (
            <Button size="sm" variant="plain" icon={<I.Archive size={13} />} onClick={() => act("archive", "Conversation archived")}>
              Archive
            </Button>
          )}
          <Button size="sm" variant="plain" onClick={() => confirm("Delete this conversation permanently?") && act("delete", "Conversation deleted")}>
            Delete
          </Button>
        </div>
      </header>
      <div className="om-messages">
        {chat.messages.map((m) => (
          <div key={m.id} className={`om-msg om-msg-${m.sender}`}>
            <div className="om-msg-meta">
              {WHO[m.sender]} · {when(m.at)}
            </div>
            <div className="om-msg-body">{m.body}</div>
          </div>
        ))}
        <div ref={end} />
      </div>
      {chat.status !== "archived" ? (
        <form
          className="om-reply"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            className="input"
            rows={3}
            value={text}
            maxLength={2000}
            placeholder={chat.mode === "human" ? "Write a reply" : "Write a reply. Sending it takes over from the assistant."}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send();
            }}
          />
          <div className="om-reply-foot">
            <span className="muted">Ctrl+Enter to send. Never share supplier names, costs or other resellers' details.</span>
            <Button variant="primary" size="sm" disabled={!text.trim() || sending}>
              Send
            </Button>
          </div>
        </form>
      ) : (
        <p className="muted om-hint">Archived. The visitor's chat window has ended; they can start a new one.</p>
      )}
    </div>
  );
}

function RetentionDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const [r, setR] = useState<{ chat_days: number; order_personal_days: number } | null>(null);
  useEffect(() => {
    api("/api/store/retention").then(setR);
  }, []);
  return (
    <Dialog
      title="Retention of chats and order details"
      onClose={onClose}
      footer={
        <>
          <Button
            variant="plain"
            onClick={async () => {
              const res = await api<{ chats_deleted: number; orders_erased: number }>("/api/store/purge", { method: "POST" });
              toast({ text: `Clean-up done: ${res.chats_deleted} chats deleted, ${res.orders_erased} orders erased` });
            }}
          >
            Run clean-up now
          </Button>
          <div className="spacer" />
          <Button variant="plain" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!r}
            onClick={async () => {
              try {
                await api("/api/store/retention", { method: "PUT", body: r });
                toast({ text: "Retention saved" });
                onClose();
              } catch (e: any) {
                toast({ text: e.message, tone: "error" });
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      {r && (
        <>
          <Field label="Delete chats after this many days without messages">
            <input className="input" type="number" min={7} max={3650} value={r.chat_days} onChange={(e) => setR({ ...r, chat_days: Number(e.target.value) })} />
          </Field>
          <Field label="Erase personal details of delivered or cancelled orders after (days)" hint="Order numbers, products and amounts are kept. The privacy notice on the website shows these periods.">
            <input className="input" type="number" min={7} max={3650} value={r.order_personal_days} onChange={(e) => setR({ ...r, order_personal_days: Number(e.target.value) })} />
          </Field>
        </>
      )}
    </Dialog>
  );
}
