from PIL import Image, ImageDraw, ImageFilter
from app.services.ai.rag import answer_question
from app.services.ai.anomaly import find_anomalies
from app.services.ai.guardrails import decide, check_answer_text
from app.services.ai.voice import transcribe
from app.services.ai.ocr import process_image, extract_fields
from app.services.ai.evaluate import evaluate
from app.knowledge.ingest import load_chunks

def test_rag_cites_ingested_source():
    a = answer_question("How do I check a relief payment?")
    ids = {c["chunk_id"] for c in load_chunks()}
    assert not a.abstained and a.sources and all(s.chunk_id in ids for s in a.sources)

def test_rag_abstains():
    a = answer_question("What is the weather in Karachi today?")
    assert a.abstained and a.requires_human_review and not a.sources

def test_anomaly_name_variants_flagged_not_rejected():
    recs = [{"id": 1, "name": "Muhammad Ali", "cnic": "42101-1234567-1", "phone": "0300"},
            {"id": 2, "name": "Mohammad Ali", "cnic": "42101-1234567-1", "phone": "0300"}]
    r = find_anomalies(recs)
    assert r.flags[0].kind == "possible_duplicate"
    assert r.changes_case_status is False

def test_anomaly_missing_fields_no_crash():
    r = find_anomalies([{"id": 1}, {"id": 2, "name": None}])
    assert any(f.kind == "missing_field" for f in r.flags)

def test_guardrail_levels():
    assert decide(0.95).action == "auto_ok"
    assert decide(0.75).action == "ask_more_proof"
    assert decide(0.4).action == "escalate_to_human"
    assert decide(0.95, high_impact=True).action == "escalate_to_human"

def test_guardrail_blocks_invented_phone():
    assert check_answer_text("Call 0300 1234567 and send Rs 500 to account").action == "blocked"

def test_voice_requires_confirmation_and_no_fake_urdu():
    v = transcribe(language="ur")
    assert v.needs_confirmation is True and v.offer_text_entry is True

def test_ocr_fields():
    f = {x.name: x.status for x in extract_fields("Name: Ayesha Khan\n42101-1234567-8\n01-02-1990")}
    assert set(f.values()) == {"ok"}

def test_ocr_blurry_requests_human(tmp_path):
    img = Image.new("RGB", (600, 300), "white")
    ImageDraw.Draw(img).text((20, 100), "Name: Ayesha Khan  42101-1234567-8", fill="black")
    p = tmp_path / "blur.png"
    img.filter(ImageFilter.GaussianBlur(8)).save(p)
    r = process_image(str(p))
    assert r.requires_human_review and r.identity_verified is False

def test_ocr_unopenable_file(tmp_path):
    p = tmp_path / "x.png"; p.write_text("not an image")
    assert process_image(str(p)).requires_human_review

def test_evaluation_reports_numbers():
    e = evaluate()
    assert e["missed_scams"] == 0 and e["n"] > 0


def test_clean_white_document_is_not_flagged_as_too_bright():
    from app.services.ai.ocr import check_quality
    from PIL import ImageFont
    img = Image.new("RGB", (800, 400), "white")
    d = ImageDraw.Draw(img)
    f = ImageFont.load_default(size=32)
    for i, t in enumerate(["Name: Ayesha Khan", "CNIC: 42101-1234567-8", "DOB: 01-02-1990"]):
        d.text((40, 80 + 80 * i), t, fill="black", font=f)
    quality, warnings = check_quality(img)
    assert "image is too dark or too bright" not in warnings
