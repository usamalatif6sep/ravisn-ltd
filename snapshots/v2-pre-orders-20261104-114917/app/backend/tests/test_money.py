import pytest

from ravisn.money import fmt, rule_price, to_minor


@pytest.mark.parametrize("cost, expected", [
    (1000, 1100),   # 10.00: 5% is 0.50, so the minimum margin of 1 applies
    (2000, 2100),   # 20.00: both rules give 21.00
    (3000, 3150),   # 30.00: 5% applies
    (1250, 1350),   # 12.50: minimum margin
    (2250, 2363),   # 22.50 x 1.05 = 23.625, rounded half up
    (0, 100),
])
def test_rule_price(cost, expected):
    assert rule_price(cost, 500, 100) == expected


def test_rule_price_half_up():
    # 62.50 x 1.05 = 65.625 -> 65.63 (half up), never 65.62
    assert rule_price(6250, 500, 100) == 6563


def test_to_minor_avoids_float_errors():
    assert to_minor(13.65) == 1365
    assert to_minor(0.1 + 0.2) == 30
    assert to_minor("1,234.505") == 123451
    assert to_minor(None) is None


def test_fmt():
    assert fmt(123456, "US$") == "US$1,234.56"
    assert fmt(-50, "£") == "-£0.50"
