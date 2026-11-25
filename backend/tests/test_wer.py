from evals.voice_metrics import wer


def test_wer_basics():
    assert wer("where is my order", "where is my order") == 0
    assert wer("where is my order", "where is order") == 0.25          # one deletion / 4 words
    assert wer("a b c d", "a x c d") == 0.25                           # one substitution
    assert wer("mera order kahan hai", "mera order") == 0.5
    assert wer("मेरा ऑर्डर कहाँ है", "मेरा ऑर्डर कहाँ है") == 0
    assert wer("", "") == 0 and wer("", "x") == 1
