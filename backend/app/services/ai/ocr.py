"""OCR with Tesseract + image quality checks.
OCR only READS text. It never verifies identity or approves anything."""
import re
from typing import Optional
from .schemas import OCRResult, FieldResult

MIN_W, MIN_H = 300, 200
SHARPNESS_MIN = 60.0     # tune on real samples (see DECISIONS.md)

_CNIC = re.compile(r"\b\d{5}-\d{7}-\d\b")
_DOB = re.compile(r"\b\d{2}[./-]\d{2}[./-]\d{4}\b")
_NAME = re.compile(r"name[:\s]+([A-Za-z][A-Za-z .]{2,40})", re.I)


def extract_fields(text: str):
    found = {
        "name": (_NAME.search(text or "") or [None, None])[1],
        "cnic": (_CNIC.search(text or "") or [None])[0],
        "date_of_birth": (_DOB.search(text or "") or [None])[0],
    }
    return [FieldResult(name=k, value=(v.strip() if v else None),
                        status="ok" if v else "missing") for k, v in found.items()]


def check_quality(img):
    """Return (quality, warnings). Uses only Pillow."""
    from PIL import ImageFilter, ImageStat
    warnings = []
    w, h = img.size
    if w < MIN_W or h < MIN_H:
        warnings.append("image is too small")
    g = img.convert("L")
    sharp = ImageStat.Stat(g.filter(ImageFilter.FIND_EDGES)).var[0]
    if sharp < SHARPNESS_MIN:
        warnings.append("image looks blurry")
    mean = ImageStat.Stat(g).mean[0]
    if mean < 50 or mean > 235:
        warnings.append("image is too dark or too bright")
    return ("low" if warnings else "good"), warnings


def process_image(path: str) -> OCRResult:
    try:
        from PIL import Image
        img = Image.open(path)
        img.load()
    except Exception:
        return OCRResult(quality="unreadable", warnings=["file could not be opened as an image"],
                         confidence=0.0, explanation="The file could not be read.",
                         model_version="ocr-none", requires_human_review=True)
    quality, warnings = check_quality(img)
    try:
        import pytesseract
        version = f"tesseract-{pytesseract.get_tesseract_version()}"
        text = pytesseract.image_to_string(img)
    except Exception:
        warnings.append("Tesseract is not available")
        return OCRResult(quality=quality, warnings=warnings, confidence=0.0,
                         explanation="Text could not be read automatically.",
                         model_version="ocr-unavailable", requires_human_review=True)
    fields = extract_fields(text)
    ok = sum(f.status == "ok" for f in fields)
    conf = round((0.3 + 0.2 * ok) if quality == "good" else 0.2, 2)
    if ok < len(fields):
        warnings.append("some fields were not found")
    review = quality != "good" or ok < len(fields)
    return OCRResult(
        fields=fields, raw_text=text, quality=quality, warnings=warnings, confidence=conf,
        explanation="Text was read from the image. Identity is NOT verified."
                    + (" Quality is low, so a person must check." if review else ""),
        model_version=version, requires_human_review=review)
