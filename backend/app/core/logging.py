import logging
import re

_EMAIL = re.compile(r"([A-Za-z0-9._%+-])[A-Za-z0-9._%+-]*(@[A-Za-z0-9.-]+)")
_PHONE = re.compile(r"\b(\+?\d[\d\s-]{6,}\d)(\d{2})\b")


class PIIFilter(logging.Filter):
    """Masks emails and long digit runs (phones/cards) in log lines."""

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        msg = _EMAIL.sub(r"\1***\2", msg)
        msg = _PHONE.sub(lambda m: "*" * len(m.group(1)) + m.group(2), msg)
        record.msg, record.args = msg, ()
        return True


def setup_logging():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    for h in logging.getLogger().handlers:
        h.addFilter(PIIFilter())
