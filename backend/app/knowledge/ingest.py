"""Load trusted sources and cut them into chunks with metadata."""
import json
from pathlib import Path
from typing import List, Dict

SOURCES_FILE = Path(__file__).with_name("sources.json")


def load_chunks(path: Path = SOURCES_FILE) -> List[Dict]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    chunks = []
    for s in data["sources"]:
        for i, text in enumerate(s["chunks"]):
            chunks.append({"chunk_id": f"{s['id']}#{i}", "title": s["title"],
                           "identifier": s["identifier"], "text": text})
    return chunks
