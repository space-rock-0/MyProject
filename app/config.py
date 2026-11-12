import json
import os
import re
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

DATA = ROOT / os.getenv("DATA_DIR", "Personal Drive")
PORT = int(os.getenv("PORT", "8000"))
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
MODELS = [m.strip() for m in os.getenv("GROQ_MODELS", "openai/gpt-oss-120b,openai/gpt-oss-20b").split(",") if m.strip()]
PROFILE = json.loads((ROOT / "profile.json").read_text(encoding="utf-8"))

RESUME_DIR = DATA / "Resume_org"
COMBINED_RESUME = DATA / "Resumes" / "Resume combiined.txt"


def resume_pdfs() -> dict:
    """Finds Resume_ai.pdf / _ml / _sde / _fde style files. Key = the suffix, lowercased."""
    found = {}
    if RESUME_DIR.exists():
        for p in sorted(RESUME_DIR.glob("*.pdf")):
            m = re.search(r"_([A-Za-z]+)\.pdf$", p.name)
            if m:
                found[m.group(1).lower()] = p
    return found
