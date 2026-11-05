"""The optional generative assistant is prepared but inactive: nothing runs or is sent without owner approval and a key."""

from ravisn import assistant_ai, db


def test_generative_assistant_is_off_by_default(con, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "")
    assert assistant_ai.status(con)["active"] is False
    assert assistant_ai.answer(con, "Do you have perfume?", "public data") is None
    # Even with a key present, it stays off until the owner approves the paid service.
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key-not-real")
    assert assistant_ai.status(con) == {"active": False, "reason": "Not approved by the owner (paid service)"}
    db.set_setting(con, "ai_assistant", {"enabled": True})
    assert assistant_ai.status(con)["active"] is False  # approval needs a recorded date


def test_replies_never_use_em_dashes():
    assert assistant_ai._clean("Yes \u2014 we can help") == "Yes, we can help"
