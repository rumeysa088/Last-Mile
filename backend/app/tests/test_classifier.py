import json
import pytest
from app.services.ai.classifier import classify_message
from app.services.ai.llm_client import LLMClient

def check_contract(r):
    assert 0.0 <= r.confidence <= 1.0
    assert r.explanation
    assert r.model_version

def test_suspicious():
    r = classify_message("URGENT send your PIN and OTP now http://bit.ly/abc")
    check_contract(r)
    assert r.result == "suspicious" and r.confidence >= 0.8 and r.evidence

def test_likely_legitimate_still_says_verify():
    r = classify_message("Your clinic appointment is on Monday at 10am.")
    check_contract(r)
    assert r.result == "likely_legitimate"
    assert any("verify" in s.lower() for s in r.safe_next_steps)

def test_ambiguous_goes_to_human():
    r = classify_message("Please call back urgent")
    check_contract(r)
    assert r.result == "unknown" and r.requires_human_review

@pytest.mark.parametrize("text", ["", "   ", None])
def test_empty_input(text):
    r = classify_message(text)
    check_contract(r)
    assert r.result == "unknown" and r.requires_human_review

def test_malformed_response_falls_back():
    c = LLMClient(mode="mock")
    c.classify_json = lambda t, l=None: "this is not json {{"
    r = classify_message("Send your PIN immediately", client=c)
    check_contract(r)
    assert r.model_version == "rules-fallback-v1"

def test_missing_key_falls_back():
    c = LLMClient(mode="live", api_key="")
    r = classify_message("Send your OTP and PIN, pay Rs 500 fee", client=c)
    check_contract(r)
    assert r.model_version == "rules-fallback-v1" and r.result == "suspicious"

def test_disagreement_means_not_sure():
    c = LLMClient(mode="mock")
    c.classify_json = lambda t, l=None: json.dumps({"result": "likely_legitimate", "explanation": "ok", "evidence": []})
    r = classify_message("Send your PIN and OTP now http://bit.ly/x", client=c)
    assert r.result == "unknown" and r.requires_human_review

def test_mock_works_without_internet_or_key():
    r = classify_message("hello there how are you", client=LLMClient(mode="mock", api_key=None))
    check_contract(r)
    assert r.model_version == "mock-v1"
