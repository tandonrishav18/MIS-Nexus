from decimal import Decimal, ROUND_HALF_UP
from typing import Iterable


TWO_PLACES = Decimal("0.01")
ONE_UNIT = Decimal("1")


def to_decimal(value: Decimal | int | str) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def quantize_money(value: Decimal) -> Decimal:
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def calculate_line_total(quantity: int, unit_price: Decimal) -> Decimal:
    return quantize_money(Decimal(quantity) * to_decimal(unit_price))


def calculate_document_totals(
    items: Iterable[tuple[int, Decimal]],
    tax_rate_pct: Decimal,
) -> tuple[Decimal, Decimal, Decimal]:
    """Compute subtotal, tax_amount, and grand_total strictly with Decimal arithmetic."""
    subtotal = Decimal("0.00")
    for qty, unit_price in items:
        subtotal += calculate_line_total(qty, unit_price)
    subtotal = quantize_money(subtotal)
    rate = to_decimal(tax_rate_pct)
    tax_amount = quantize_money((subtotal * rate) / Decimal("100"))
    grand_total = quantize_money(subtotal + tax_amount)
    return subtotal, tax_amount, grand_total


def format_inr(amount: Decimal | int | float) -> str:
    """Format monetary value in Indian Rupee grouping (e.g., ₹45,00,000)."""
    dec = quantize_money(to_decimal(str(amount)))
    negative = dec < 0
    dec = abs(dec)
    rounded = dec.quantize(ONE_UNIT, rounding=ROUND_HALF_UP)
    s = str(int(rounded))
    if len(s) <= 3:
        formatted = s
    else:
        last3 = s[-3:]
        rest = s[:-3]
        groups: list[str] = []
        while len(rest) > 2:
            groups.insert(0, rest[-2:])
            rest = rest[:-2]
        if rest:
            groups.insert(0, rest)
        formatted = ",".join(groups) + "," + last3
    return f"-₹{formatted}" if negative else f"₹{formatted}"

