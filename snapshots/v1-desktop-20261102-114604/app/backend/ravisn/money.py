"""Money in integer minor units (pence, cents) and the Ravisn pricing rule."""

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation


def rule_price(cost_minor: int, markup_bp: int, min_margin_minor: int) -> int:
    """Higher of cost x (1 + markup) and cost + minimum margin, rounded half up to the cent.

    markup_bp is in basis points: 500 = 5%.
    """
    if cost_minor < 0:
        raise ValueError("cost cannot be negative")
    marked_up = (cost_minor * (10000 + markup_bp) + 5000) // 10000
    return max(marked_up, cost_minor + min_margin_minor)


def to_minor(value) -> int | None:
    """Convert a workbook or user value (float, int, str) to minor units, rounding half up."""
    if value is None or value == "":
        return None
    try:
        if isinstance(value, float):
            d = Decimal(repr(value))
        else:
            d = Decimal(str(value).replace(",", "").strip())
    except InvalidOperation as exc:
        raise ValueError(f"not an amount: {value!r}") from exc
    return int((d * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def from_minor(minor: int) -> Decimal:
    return (Decimal(minor) / 100).quantize(Decimal("0.01"))


def fmt(minor: int | None, symbol: str) -> str:
    if minor is None:
        return ""
    sign = "-" if minor < 0 else ""
    return f"{sign}{symbol}{abs(minor) / 100:,.2f}"


def margin_and_markup(cost_minor: int | None, price_minor: int | None) -> tuple[int | None, float | None]:
    if cost_minor is None or price_minor is None:
        return None, None
    margin = price_minor - cost_minor
    markup = (margin / cost_minor) if cost_minor else None
    return margin, markup
