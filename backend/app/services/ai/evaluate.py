"""Honest evaluation of the scam classifier.

Run from the backend folder:  python -m app.services.ai.evaluate
Add your OWN examples to LABELED (especially Roman Urdu and real-looking messages).
Truth labels: "suspicious", "likely_legitimate", or "unknown" (genuinely ambiguous).
"""
from .classifier import classify_message

LABELED = [
# scams
    ("URGENT: your relief payment is ready. Send your CNIC and PIN to claim now http://bit.ly/x","suspicious"),
    ("Congratulations you won! Pay Rs 500 processing fee via JazzCash to claim your prize","suspicious"),
    ("Share your OTP immediately or your account will be blocked","suspicious"),
    ("Aap ka inaam nikla hai, foran PIN bhejein","suspicious"),
    ("BISP relief amount approved. Click http://bit.ly/bisp-claim and enter your CNIC and password","suspicious"),
    ("Dear customer your Easypaisa account is suspended. Send OTP now to reactivate","suspicious"),
    ("Aap ko Rs 25000 relief fund mila hai. Processing fee Rs 300 JazzCash par send karein","suspicious"),
    ("Lucky draw winner! Reply with your CNIC and pay Rs 200 fee to receive your prize","suspicious"),
    ("Your SIM will be blocked within 2 hours. Share your CNIC and OTP to verify","suspicious"),
    ("Ehsaas program: claim your payment at tinyurl.com/ehsaas26 and send your PIN","suspicious"),
    ("فوری: اپنا پن بھیجیں ورنہ آپ کا اکاؤنٹ بند ہو جائے گا","suspicious"),
    ("Bank alert: send your password to this number immediately","suspicious"),
# real
    ("Your clinic appointment is on Monday at 10am. Reply YES to confirm.","likely_legitimate"),
    ("Your electricity bill for October has been generated.","likely_legitimate"),
    ("Meeting moved to 3pm tomorrow in the library.","likely_legitimate"),
    ("Your parcel has been delivered. Thank you for shopping with us.","likely_legitimate"),
    ("Happy birthday! Wishing you a great year ahead.","likely_legitimate"),
    ("Class cancelled today due to rain. Notes will be shared later.","likely_legitimate"),
    ("Aap ka bill jama ho gaya hai. Shukriya.","likely_legitimate"),
    ("Your Raast transfer of Rs 5000 to Ali was successful.","likely_legitimate"),
    ("Salary of Rs 60000 has been credited to your account ending 4417.","likely_legitimate"),
    ("Reminder: submit your assignment by Friday. Check the portal https://flex.nu.edu.pk","likely_legitimate"),
    ("Your OTP is 482913. Do not share it with anyone.","likely_legitimate"),
    ("Your payment of Rs 1200 for the electricity bill was received.","likely_legitimate"),
    ("Mama ne kaha ke aaj raat khana ghar par hai.","likely_legitimate"),
    ("Tomorrow's exam is at 9am in room 12.","likely_legitimate"),
# ambiguous
    ("Please call back urgent","unknown"),
    ("ok","unknown"),
    ("Your account has been blocked. Visit your branch.","unknown"),
    ("Click here to see your results https://example.com/results","unknown"),
    ("Immediately reply with your name","unknown"),
]


def evaluate(verbose: bool = False) -> dict:
    caught = false_alarms = missed = unsure = 0
    problems = []
    for text, truth in LABELED:
        r = classify_message(text)
        if r.result == "unknown":
            unsure += 1
        if truth == "suspicious" and r.result == "suspicious":
            caught += 1
        elif truth != "suspicious" and r.result == "suspicious":
            false_alarms += 1          # a real person wrongly warned = also a cost
            problems.append(("FALSE ALARM", text, r.evidence))
        elif truth == "suspicious" and r.result == "likely_legitimate":
            missed += 1                # scam called safe = the worst error
            problems.append(("MISSED SCAM", text, r.evidence))
    scams = sum(1 for _, t in LABELED if t == "suspicious")
    out = {"n": len(LABELED), "scams": scams, "caught_scams": caught,
           "false_alarms": false_alarms, "missed_scams": missed, "sent_to_human": unsure}
    if verbose:
        for p in problems:
            print(p)
    return out


if __name__ == "__main__":
    print(evaluate(verbose=True))
