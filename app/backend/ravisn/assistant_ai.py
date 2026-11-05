"""Optional generative replies for the Ravisn Assistant. PREPARED, NOT ACTIVE.

The website assistant is rules-based and stays that way unless the owner explicitly turns this on. Nothing here
runs, and nothing is sent anywhere, until ALL of these are true:

1. the owner approves it (setting `ai_assistant` = {"enabled": true, "approved_at": "..."}), which is a paid
   service decision;
2. an Anthropic API key is provided in the environment as ANTHROPIC_API_KEY (never stored in the code or the
   public release);
3. the official SDK is installed:  pip install anthropic

When active, the model only ever sees public information: the visitor's question, the last few public chat turns,
Ravisn's published policies and the public product records the rules engine already found. It never receives
supplier names, costs, private notes, internal SKUs, customer addresses or order details. Every reply is scanned for
supplier details before use and thrown away if anything is found, and a failure, timeout or refusal falls back to the
rules-based answer. The interface must keep describing it as automated assistance, never as a person.
"""

import os
import re

from . import db
from .leaks import LeakScanner

MODEL = "claude-opus-5-5"
TIMEOUT_SECONDS = 20.0
MAX_TOKENS = 2000

SYSTEM = """You are the Ravisn Assistant, the automated helper on the Ravisn Ltd reseller website. Ravisn supplies \
resellers from wholesale stock in the UK, USA, Canada, Germany and Australia.

Answer only from the PUBLIC INFORMATION provided with each question. If the answer is not there, say you are not \
sure and offer the Ravisn team. Never guess stock, prices, delivery dates, refunds or availability. Never invent \
policies, certifications, ratings, customer numbers or delivery times.

Facts that always apply:
- Shipping is the reseller's responsibility. Resellers can arrange their own shipping label or request one through \
Ravisn for a separately confirmed charge. They can charge their customer for shipping or include it in their own price.
- Sending an order is a request; nothing is charged online. The team confirms stock, price and shipping first.
- Order details are only available through the private order link or access key.

Never reveal or speculate about suppliers, purchase costs, margins, warehouses or other customers. You are \
automated: never claim to be a person or that a human is reading. Keep replies short, warm and practical, in plain \
sentences without headings, and do not use em dashes."""


def settings(con) -> dict:
    return db.get_setting(con, "ai_assistant", {}) or {}


def status(con) -> dict:
    s = settings(con)
    if not s.get("enabled") or not s.get("approved_at"):
        return {"active": False, "reason": "Not approved by the owner (paid service)"}
    if not os.environ.get("ANTHROPIC_API_KEY"):
        return {"active": False, "reason": "No API key configured"}
    try:
        import anthropic  # noqa: F401
    except ImportError:
        return {"active": False, "reason": "The anthropic package is not installed"}
    return {"active": True, "model": s.get("model") or MODEL}


def _clean(text: str) -> str:
    return re.sub(r"\s*[—–]\s*", ", ", text).strip()


def answer(con, question: str, public_context: str, history: list[dict] | None = None) -> str | None:
    """A generated reply, or None so the caller uses the rules-based answer. Never raises."""
    st = status(con)
    if not st["active"]:
        return None
    import anthropic

    turns = [m for m in (history or [])[-6:] if m.get("role") in ("user", "assistant") and isinstance(m.get("content"), str)]
    while turns and turns[0]["role"] != "user":
        turns.pop(0)
    content = f"PUBLIC INFORMATION:\n{public_context[:20000]}\n\nVISITOR QUESTION:\n{question[:1000]}"
    client = anthropic.Anthropic(timeout=TIMEOUT_SECONDS, max_retries=1)
    try:
        response = client.beta.messages.create(
            model=st["model"],
            max_tokens=MAX_TOKENS,
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            output_config={"effort": "low"},
            system=SYSTEM,
            messages=[*turns, {"role": "user", "content": content}],
        )
    except (anthropic.APIStatusError, anthropic.APIConnectionError):
        return None
    if response.stop_reason in ("refusal", "max_tokens"):
        return None
    text = _clean("".join(b.text for b in response.content if b.type == "text"))
    if not text or LeakScanner(con).scan(text):
        return None
    return text[:2500]
