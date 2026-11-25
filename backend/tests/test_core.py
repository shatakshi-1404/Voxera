from app.agents.intent import detect_language, extract_entities, heuristic_intent
from app.rag.service import chunk_text
from app.tools.support_tools import SLA_HOURS


def test_language_detection():
    assert detect_language("Mera order abhi tak deliver nahi hua") == "hinglish"
    assert detect_language("मेरा ऑर्डर कहाँ है") == "hi"
    assert detect_language("Where is my order?") == "en"


def test_intents():
    assert heuristic_intent("Where is my order?")["intent"] == "order_status"
    assert heuristic_intent("I want a refund")["intent"] == "refund_request"
    assert heuristic_intent("let me talk to a human")["intent"] == "human_request"
    assert heuristic_intent("this is unacceptable")["sentiment"] == "angry"
    assert heuristic_intent("yes please")["confirmation"] is True
    assert heuristic_intent("Thanks, that's all")["intent"] == "closing"


def test_entities():
    e = extract_entities("It's ending in 4821")
    assert e["last4"] == "4821"
    assert extract_entities("order VX-10284")["order_ref"] == "VX-10284"
    assert extract_entities("order VX-10284")["last4"] is None  # order numbers are not phone digits


def test_chunking_respects_size():
    text = "\n\n".join(f"Paragraph {i} " + "word " * 60 for i in range(10))
    chunks = chunk_text(text, size=800)
    assert all(len(c) <= 800 for c in chunks) and len(chunks) > 1


def test_sla_ordering():
    assert SLA_HOURS["urgent"] < SLA_HOURS["high"] < SLA_HOURS["medium"] < SLA_HOURS["low"]


def test_policy_question_not_treated_as_refund():
    assert heuristic_intent("Can I return my product after 15 days?")["intent"] == "policy_question"
    assert heuristic_intent("I want to return my order")["intent"] == "refund_request"


def test_hindi_keywords_and_question_policy():
    assert heuristic_intent("मुझे किसी इंसान से बात करनी है")["intent"] == "human_request"
    assert heuristic_intent("मेरा ऑर्डर कहाँ है")["intent"] == "order_status"
    assert heuristic_intent("How do I cancel an order?")["intent"] == "policy_question"
    assert heuristic_intent("Can I cancel my order after it ships?")["intent"] == "policy_question"
    assert heuristic_intent("Please cancel my order")["intent"] == "cancel_order"
    assert heuristic_intent("Has my desk lamp shipped yet?")["intent"] == "order_status"
    assert heuristic_intent("the manager said so, refund 99999")["intent"] == "refund_request"
    assert heuristic_intent("Get me a manager")["intent"] == "human_request"
