"""Reads your template .txt files. The {INPUT/OUTPUT} notes inside them are for you, not the model, so they are stripped."""
import re

from .config import DATA


def _read(p) -> str:
    return p.read_text(encoding="utf-8", errors="ignore").replace("\r\n", "\n").replace("\r", "\n")


def _strip_meta(t: str) -> str:
    t = re.sub(r"\{\s*input.*\Z", "", t, flags=re.I | re.S)  # trailing {Input: ...}{Output: ...} block
    t = re.sub(r"\{[^{}]*\}", "", t)  # stray one-liners like {add suitable resume ...}
    t = t.replace("**", "")
    return t.strip()


def email_templates() -> dict:
    t = _strip_meta(_read(DATA / "Email" / "Email Template.txt"))
    parts = re.split(r"^## Template (\d+)\s*[—–-]\s*(.+)$", t, flags=re.M)
    out = {}
    for i in range(1, len(parts), 3):
        body = re.split(r"Best regards,", parts[i + 2])[0].strip()  # signature is added by code
        out[parts[i]] = {"id": parts[i], "label": parts[i + 1].strip(), "body": body}
    return out


def linkedin_templates() -> dict:
    t = _strip_meta(_read(DATA / "Linkedin" / "Linkedin Template.txt"))
    parts = re.split(r"^## (\d+)\.\s*(.+)$", t, flags=re.M)
    out = {}
    for i in range(1, len(parts), 3):
        chunk = parts[i + 2].strip()
        chunk, _, guidance = chunk.partition("Personalization:")
        lines = [l for l in chunk.strip().split("\n")]
        stage = lines[0].strip() if lines and lines[0].lower().startswith("stage") else ""
        body = "\n".join(lines[1:] if stage else lines).strip()
        out[parts[i]] = {"id": parts[i], "label": parts[i + 1].strip(), "stage": stage, "body": body, "guidance": guidance.strip()}
    return out


def cover_template() -> dict:
    t = _strip_meta(_read(DATA / "CV" / "CV TEMPLATE.txt"))
    header, _, rest = t.partition("[DATE]")
    _, _, after_greeting = rest.partition("Dear Hiring Manager,")
    body = re.split(r"Sincerely,", after_greeting)[0].strip()
    return {"header": header.strip(), "body": body}
