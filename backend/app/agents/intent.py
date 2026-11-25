"""Heuristic intent / language detection. Used as a fallback when the LLM is unavailable and to extract
hard entities (last4, order ref, email) deterministically."""
import re

ACCOUNT_INTENTS = {"order_status", "refund_request", "cancel_order", "payment_issue"}

_Q_NOT_ACCOUNT = r"(?!.*(my order|status|where|track|deliver|arriv|parcel|package|shipment|hasn't|vx-?\d))"
_RULES = [
    ("human_request", r"\b(human|real person|representative|live agent|talk to (an )?agent|speak (to|with) (an )?agent|insaan)\b|(get|call|talk|speak|connect|escalate)\b.{0,25}\bmanager|इंसान|मानव|एजेंट|किसी व्यक्ति"),
    ("policy_question", r"\b(policy|policies|warranty|how long|how many days|can i return|exchange|shipping charges|free shipping|kitne din)\b|(after|once) (it )?(has )?ship"),
    ("policy_question", r"^\s*(how (do|does|can|many)|what (is|are|'s)|does|do you|can i (cancel|return|exchange)|is there|when (do|does|will|can))\b" + _Q_NOT_ACCOUNT),
    ("refund_request", r"\b(refund|money back|paise wapas|return(ing)? (my|the|this)|wapas)\b|रिफंड|पैसे वापस|पैसा वापस"),
    ("cancel_order", r"\b(cancel|cancellation|raddh)\b|कैंसिल|रद्द"),
    ("payment_issue", r"\b(payment|charged|deducted|failed|double charge|paisa kat|transaction)\b|पेमेंट|भुगतान"),
    ("order_status", r"\b(order|deliver\w*|arriv\w*|track\w*|shipped|shipment|dispatch(ed)?|parcel|package|kahan|nahi (hua|aaya|pahuncha)|pahuncha)\b|ऑर्डर|आर्डर|डिलीवर|पार्सल|पैकेज"),
    ("closing", r"\b(thanks|thank you|that'?s all|that is all|nothing else|shukriya|dhanyavaad|bas itna|all good)\b|धन्यवाद|शुक्रिया"),
    ("greeting", r"^\s*(hi|hello|hey|namaste|hii+)\b|^\s*नमस्ते"),
]
_ANGRY = r"\b(worst|angry|unacceptable|fraud|scam|useless|terrible|pathetic|bakwas|ridiculous|furious)\b"
_CONFIRM = r"^\s*(yes|yeah|yep|yup|sure|ok(ay)?|please do|go ahead|confirm(ed)?|haan|han|ha|kar do|theek hai)\b"
_DECLINE = r"^\s*(no|nope|nah|don'?t|not now|nahi|nahin|mat)\b"
_HINGLISH = {"mera", "meri", "mere", "nahi", "hua", "kya", "hai", "abhi", "tak", "kab", "kahan", "paise", "wapas",
             "karo", "kar", "do", "aap", "mujhe", "chahiye", "kyun", "bhi", "toh", "se", "ko", "ka", "ki", "ke"}


def detect_language(text: str) -> str:
    if re.search(r"[\u0900-\u097F]", text):
        return "hi"
    words = set(re.findall(r"[a-z']+", text.lower()))
    if len(words & _HINGLISH) >= 2:
        return "hinglish"
    return "en"


def extract_entities(text: str) -> dict:
    m_ord = re.search(r"\bVX-?\s?(\d{4,6})\b", text, re.I)
    m_email = re.search(r"[\w.+-]+@[\w-]+\.[\w.-]+", text)
    digits = re.findall(r"(?<!\d)(\d{4})(?!\d)", text)
    return {
        "order_ref": f"VX-{m_ord.group(1)}" if m_ord else None,
        "email": m_email.group(0).lower() if m_email else None,
        "last4": digits[-1] if digits and not m_ord else None,
    }


def heuristic_intent(text: str) -> dict:
    t = text.lower()
    intent = "other"
    for name, pat in _RULES:
        if re.search(pat, t):
            intent = name
            break
    sentiment = "angry" if re.search(_ANGRY, t) else ("negative" if re.search(r"\b(not happy|disappointed|late again|problem)\b", t) else "neutral")
    return {
        "intent": intent,
        "sentiment": sentiment,
        "confirmation": bool(re.search(_CONFIRM, t)),
        "decline": bool(re.search(_DECLINE, t)),
        "language": detect_language(text),
        "confidence": 0.6,
    }
