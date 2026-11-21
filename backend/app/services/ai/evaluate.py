"""Tiny honest evaluation of the classifier. Replace/extend LABELED with 40+ examples."""
from .classifier import classify_message

LABELED = [
    ("URGENT: your relief payment is ready. Send your CNIC and PIN to claim now http://bit.ly/x", "suspicious"),
    ("Congratulations you won! Pay Rs 500 processing fee via JazzCash to claim your prize", "suspicious"),
    ("Share your OTP immediately or your account will be blocked", "suspicious"),
    ("Aap ka inaam nikla hai, foran PIN bhejein", "suspicious"),
    ("Your clinic appointment is on Monday at 10am. Reply YES to confirm.", "likely_legitimate"),
    ("Your electricity bill for October has been generated.", "likely_legitimate"),
    ("Meeting moved to 3pm tomorrow in the library.", "likely_legitimate"),
    ("Please call back urgent", "unknown"),
    ("ok", "unknown"),
]


def evaluate() -> dict:
    tp = fp = fn = unsure = 0
    for text, truth in LABELED:
        r = classify_message(text)
        if r.result == "unknown":
            unsure += 1
        if truth == "suspicious" and r.result == "suspicious":
            tp += 1
        if truth != "suspicious" and r.result == "suspicious":
            fp += 1   # real person wrongly blocked = also a cost
        if truth == "suspicious" and r.result == "likely_legitimate":
            fn += 1   # scam called safe = worst error
    n = len(LABELED)
    return {"n": n, "caught_scams": tp, "false_alarms": fp, "missed_scams": fn,
            "sent_to_human": unsure}


if __name__ == "__main__":
    print(evaluate())
