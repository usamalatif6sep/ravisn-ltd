"""Admin panel routes for reseller orders and live chat.

Orders and chats live in the storefront database: the local storefront.db while the website runs on this computer,
or the Cloudflare D1 database once the order service is set up (reached over HTTPS with the owner's admin token).
Supplier assignment, supplier costs, expected margin and internal notes are joined here from the private database and
never leave this computer. Nothing is ever sent to a supplier or another service automatically.
"""

import json
import urllib.error
import urllib.parse
import urllib.request

from fastapi import Body, Depends

from . import db, storefront, vault


class LocalStore:
    """storefront.db on this computer (the local preview website writes to it)."""

    def __init__(self, con):
        self.con = con

    def summary(self):
        return storefront.summary(self.con)

    def presence(self, online):
        return storefront.set_presence(self.con, online)

    def retention(self):
        return storefront.retention(self.con)

    def set_retention(self, values):
        return storefront.set_retention(self.con, values)

    def purge(self):
        return storefront.purge(self.con)

    def orders(self, status, q, limit, offset):
        return storefront.list_orders(self.con, status, q, limit, offset) | {"order_statuses": storefront.ORDER_STATUSES,
                                                                              "payment_statuses": storefront.PAYMENT_STATUSES}

    def order(self, number):
        return storefront.admin_order(self.con, number)

    def update(self, number, changes):
        return storefront.update_order(self.con, number, changes)

    def erase(self, number):
        return storefront.erase_order_personal_data(self.con, number)

    def chats(self, view):
        return {"chats": storefront.list_chats(self.con, view), "summary": storefront.summary(self.con)}

    def chat(self, cid):
        return storefront.admin_chat(self.con, cid)

    def chat_action(self, cid, action, body):
        if action == "reply":
            return storefront.chat_reply(self.con, cid, body.get("text"))
        return storefront.chat_set(self.con, cid, action)

    def close(self):
        self.con.close()


class RemoteStore:
    """The Cloudflare order service (D1), through its admin API. Every call needs the owner's admin token."""

    def __init__(self, url: str, token: str, opener=urllib.request.urlopen):
        self.base = url.rstrip("/") + "/api/owner"
        self.token = token
        self.opener = opener

    def _call(self, method, path, body=None, params=None):
        url = self.base + path + ("?" + urllib.parse.urlencode({k: v for k, v in (params or {}).items() if v not in (None, "")}) if params else "")
        data = None if body is None else json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, method=method, headers={"Authorization": f"Bearer {self.token}", "Content-Type": "application/json",
                                                                             "Accept": "application/json"})
        try:
            with self.opener(req, timeout=20) as r:
                return json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            try:
                err = json.loads(e.read() or b"{}")
            except ValueError:
                err = {}
            if e.code == 404:
                raise KeyError(path) from e
            raise storefront.StoreError(err.get("error") or f"The order service answered {e.code}", status=e.code if e.code < 500 else 502,
                                        fields=err.get("fields") or {}) from e
        except OSError as e:
            raise storefront.StoreError("Could not reach the online order service. Check the internet connection.", status=502) from e

    def summary(self):
        return self._call("GET", "/summary")

    def presence(self, online):
        return self._call("PUT", "/presence", {"online": online})

    def retention(self):
        return self._call("GET", "/retention")

    def set_retention(self, values):
        return self._call("PUT", "/retention", values)

    def purge(self):
        return self._call("POST", "/purge", {})

    def orders(self, status, q, limit, offset):
        return self._call("GET", "/orders", params={"status": status, "q": q, "limit": limit, "offset": offset})

    def order(self, number):
        return self._call("GET", f"/orders/{urllib.parse.quote(number)}")

    def update(self, number, changes):
        return self._call("PATCH", f"/orders/{urllib.parse.quote(number)}", changes)

    def erase(self, number):
        return self._call("POST", f"/orders/{urllib.parse.quote(number)}/erase", {})

    def chats(self, view):
        return self._call("GET", "/chats", params={"view": view})

    def chat(self, cid):
        return self._call("GET", f"/chats/{urllib.parse.quote(cid)}")

    def chat_action(self, cid, action, body):
        return self._call("POST", f"/chats/{urllib.parse.quote(cid)}/{action}", body if action == "reply" else {})

    def close(self):
        pass


def open_store(con=None):
    """The online order service once it is set up (owner's choice), otherwise this computer's storefront database."""
    remote = vault.get("storefront_remote")
    if remote and con is not None and db.get_setting(con, "cloud_store") and db.get_setting(con, "store_mode") == "remote":
        return RemoteStore(remote["url"], remote["token"])
    return LocalStore(storefront.connect())


def _line_costs(con, number: str, catalogue: str, items: list[dict]) -> dict[int, dict]:
    """Supplier and cost per order line. The first time an order is opened the current cost is kept, so the expected
    margin does not move when supplier prices change later."""
    out = {}
    for line in items:
        row = con.execute("SELECT * FROM order_line_costs WHERE order_number = ? AND line_id = ?", (number, line["id"])).fetchone()
        item = con.execute("SELECT id FROM items WHERE code = ? AND country = ?", (line["code"], catalogue)).fetchone()
        offer = con.execute("SELECT * FROM offers WHERE item_id = ?", (item["id"],)).fetchone() if item else None
        if row is None:
            cost = None
            if offer is not None:
                cost = offer["cost_minor"]
                if line["option"]:
                    t = con.execute("SELECT cost_minor FROM offer_cost_tiers WHERE offer_id = ? AND label = ?", (offer["id"], line["option"])).fetchone()
                    cost = t["cost_minor"] if t else cost
            with con:
                con.execute("INSERT INTO order_line_costs (order_number, line_id, item_id, supplier_id, cost_minor, captured_at) VALUES (?, ?, ?, ?, ?, ?)",
                            (number, line["id"], item["id"] if item else None, offer["supplier_id"] if offer else None, cost, db.now()))
            row = con.execute("SELECT * FROM order_line_costs WHERE order_number = ? AND line_id = ?", (number, line["id"])).fetchone()
        sup = con.execute("SELECT id, name, phone, whatsapp_link, emails FROM suppliers WHERE id = ?", (row["supplier_id"],)).fetchone() if row["supplier_id"] else None
        cost_line = row["cost_minor"] * line["qty"] if row["cost_minor"] is not None else None
        margin = line["line_minor"] - cost_line if cost_line is not None and line["line_minor"] is not None else None
        out[line["id"]] = {"item_id": row["item_id"], "supplier": dict(sup) if sup else None, "cost_minor": row["cost_minor"], "cost_line_minor": cost_line,
                           "margin_minor": margin, "supplier_sku": offer["supplier_sku"] if offer else None, "item_ref": offer["item_ref"] if offer else None,
                           "captured_at": row["captured_at"]}
    return out


def order_detail(con, store, number: str, o: dict | None = None) -> dict:
    o = o or store.order(number)
    costs = _line_costs(con, number, o["catalogue"], o["items"])
    for line in o["items"]:
        line["private"] = costs[line["id"]]
    known = [c for c in costs.values() if c["margin_minor"] is not None]
    o["cost_total_minor"] = sum(c["cost_line_minor"] for c in known) if known else None
    o["margin_minor"] = sum(c["margin_minor"] for c in known) if known else None
    o["margin_complete"] = len(known) == len(costs)
    priv = con.execute("SELECT notes FROM order_private WHERE order_number = ?", (number,)).fetchone()
    o["notes"] = priv["notes"] if priv else None
    o["private_history"] = [{"at": a["at"], "action": a["action"], "changes": json.loads(a["changes"]), "note": a["note"]} for a in con.execute(
        "SELECT * FROM audit WHERE entity = 'order' AND note = ? ORDER BY id", (number,))]
    o["suppliers"] = [dict(s) for s in con.execute("SELECT id, name FROM suppliers ORDER BY name")]
    o["order_statuses"] = storefront.ORDER_STATUSES
    o["payment_statuses"] = storefront.PAYMENT_STATUSES
    return o


def update(con, store, number: str, body: dict) -> dict:
    public = {k: body[k] for k in ("status", "payment_status", "tracking", "carrier", "message") if k in body}
    o = store.update(number, public) if public else store.order(number)
    if "notes" in body:
        notes = (str(body["notes"] or "").strip()[:4000]) or None
        old = con.execute("SELECT notes FROM order_private WHERE order_number = ?", (number,)).fetchone()
        with con:
            con.execute("INSERT INTO order_private (order_number, notes, updated_at) VALUES (?, ?, ?) "
                        "ON CONFLICT(order_number) DO UPDATE SET notes = excluded.notes, updated_at = excluded.updated_at", (number, notes, db.now()))
            db.audit(con, "order", None, "notes", {"notes": [old["notes"] if old else None, notes]}, number)
    for change in body.get("lines") or []:
        line_id, supplier_id = int(change["line_id"]), change.get("supplier_id")
        if supplier_id is not None and not con.execute("SELECT 1 FROM suppliers WHERE id = ?", (int(supplier_id),)).fetchone():
            raise storefront.StoreError("Unknown supplier")
        with con:
            row = con.execute("SELECT supplier_id FROM order_line_costs WHERE order_number = ? AND line_id = ?", (number, line_id)).fetchone()
            if row is None:
                raise storefront.StoreError("Open the order before assigning suppliers")
            con.execute("UPDATE order_line_costs SET supplier_id = ? WHERE order_number = ? AND line_id = ?",
                        (int(supplier_id) if supplier_id is not None else None, number, line_id))
            db.audit(con, "order", None, "supplier", {"line": [line_id, line_id], "supplier_id": [row["supplier_id"], supplier_id]}, number)
    return order_detail(con, store, number, o)


def register_routes(admin, get_con) -> None:
    def get_store(con=Depends(get_con)):
        store = open_store(con)
        try:
            yield store
        finally:
            store.close()

    @admin.get("/store/summary")
    def store_summary(store=Depends(get_store)):
        return store.summary()

    @admin.put("/store/presence")
    def presence(body: dict = Body(...), store=Depends(get_store)):
        return store.presence(bool(body.get("online")))

    @admin.get("/store/retention")
    def get_retention(store=Depends(get_store)):
        return store.retention()

    @admin.put("/store/retention")
    def put_retention(body: dict = Body(...), store=Depends(get_store)):
        return store.set_retention(body)

    @admin.post("/store/purge")
    def run_purge(store=Depends(get_store)):
        return store.purge()

    @admin.get("/store/mode")
    def store_mode(con=Depends(get_con)):
        return {"mode": db.get_setting(con, "store_mode") or "local", "online_ready": bool(db.get_setting(con, "cloud_store") and vault.get("storefront_remote"))}

    @admin.put("/store/mode")
    def set_store_mode(body: dict = Body(...), con=Depends(get_con)):
        mode = body.get("mode")
        if mode not in ("local", "remote"):
            raise storefront.StoreError("Choose local or online")
        if mode == "remote" and not (db.get_setting(con, "cloud_store") and vault.get("storefront_remote")):
            raise storefront.StoreError("Set up the order service first")
        with con:
            db.set_setting(con, "store_mode", mode)
        return {"mode": mode}

    @admin.get("/orders")
    def orders(status: str | None = None, q: str | None = None, limit: int = 100, offset: int = 0, store=Depends(get_store)):
        return store.orders(status, q, limit, offset)

    @admin.get("/orders/{number}")
    def order(number: str, con=Depends(get_con), store=Depends(get_store)):
        return order_detail(con, store, number)

    @admin.patch("/orders/{number}")
    def patch_order(number: str, body: dict = Body(...), con=Depends(get_con), store=Depends(get_store)):
        return update(con, store, number, body)

    @admin.post("/orders/{number}/erase")
    def erase(number: str, body: dict = Body(...), con=Depends(get_con), store=Depends(get_store)):
        if body.get("confirm") != number:
            raise storefront.StoreError(f"Type the order number {number} to confirm")
        return order_detail(con, store, number, store.erase(number))

    @admin.get("/chats")
    def chats(view: str = "open", store=Depends(get_store)):
        return store.chats(view)

    @admin.get("/chats/{cid}")
    def chat(cid: str, store=Depends(get_store)):
        return store.chat(cid)

    @admin.post("/chats/{cid}/{action}")
    def chat_action(cid: str, action: str, body: dict = Body(default={}), store=Depends(get_store)):
        if action not in ("reply", "takeover", "assistant", "close", "archive", "reopen", "delete"):
            raise storefront.StoreError("Unknown action")
        return store.chat_action(cid, action, body)
