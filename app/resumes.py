import re
from collections import Counter
from math import log

from . import config

ROLE_KEYWORDS = {
    "fde": ["forward deployed", "forward deployment", "solutions engineer", "solution engineer", "customer", "client", "integration",
            "implementation", "deployment", "stakeholder", "requirements", "onboarding", "workflow automation", "technical scoping", "consulting"],
    "ai": ["llm", "rag", "agent", "agentic", "genai", "generative", "langchain", "langgraph", "prompt", "vector", "embedding",
           "openai", "retrieval", "ai engineer", "mcp", "fine-tuning", "evaluation"],
    "ml": ["machine learning", "ml engineer", "pytorch", "scikit-learn", "model training", "classification", "regression", "recommendation",
           "deep learning", "data scientist", "mlops", "feature engineering", "anomaly", "tensorflow", "nlp", "computer vision"],
    "sde": ["software engineer", "sde", "backend", "frontend", "full stack", "full-stack", "react", "node", "java", "microservices",
            "system design", "rest api", "distributed", "web developer", "developer", "typescript"],
}
PREFERENCE = ["ai", "fde", "ml", "sde"]  # tie-break order


def _count(kw: str, text: str) -> int:
    return len(re.findall(r"\b" + re.escape(kw) + r"s?\b", text))


def score_roles(title: str, jd: str) -> dict:
    t, j = (title or "").lower(), (jd or "").lower()
    return {role: sum(3 * _count(k, t) + min(_count(k, j), 3) for k in kws) for role, kws in ROLE_KEYWORDS.items()}


def choose(title: str, jd: str, available: list) -> tuple:
    scores = score_roles(title, jd)
    pool = [r for r in PREFERENCE if r in available] or list(available)
    best = max(pool, key=lambda r: (scores.get(r, 0), -PREFERENCE.index(r) if r in PREFERENCE else -99))
    return best, scores


# ---------- combined resume text ----------
_PROFILE_HINT = {"fde": "forward deployment", "ml": "machine learning engineer", "sde": "software engineer hands-on", "ai": "ai engineer specializing"}
_ALWAYS = re.compile(r"^(languages & cloud|machine learning:|programming languages|education|technical skills|vellore)", re.I)
_EXPERIENCE = re.compile(r"\b(intern|externship|inc\.|junior)\b", re.I)
_DATE = re.compile(r"(19|20)\d\d")
_STOP = set("the and for with that this from your into over using used use built build have has are was were their our out per via not but all any can will more less than then also its been one two three each across within".split())


def load_clean() -> str:
    raw = config.COMBINED_RESUME.read_text(encoding="utf-8", errors="ignore").replace("\r\n", "\n").replace("\r", "\n")
    seen, out = set(), []
    for line in raw.split("\n"):
        s = line.strip()
        if len(s) > 40:  # your skills block is pasted twice; keep one copy
            if s in seen:
                continue
            seen.add(s)
        out.append(re.sub(r"[ \t]+", " ", s))
    return re.sub(r"\n{3,}", "\n\n", "\n".join(out)).strip()


def _paragraphs(text: str) -> list:
    return [p.strip() for p in text.split("\n\n") if p.strip()]


def _is_header(par: str) -> bool:
    lines = par.split("\n")
    first = lines[0]
    if len(first) > 120 or first.endswith(".") or first.startswith("•") or _ALWAYS.match(first):
        return False
    return len(lines) == 1 or "|" in lines[1] or bool(_DATE.search(lines[1]) and len(lines[1]) < 60) or "|" in first


def _groups(text: str) -> list:
    groups, cur = [], None
    for par in _paragraphs(text):
        if _ALWAYS.match(par):
            groups.append({"text": par, "always": True})
            cur = None
        elif _is_header(par) or cur is None:
            cur = {"text": par, "always": False, "header": par.split("\n")[0]}
            groups.append(cur)
        else:
            cur["text"] += "\n\n" + par
    return groups


def _tokens(s: str) -> set:
    return {w for w in re.findall(r"[a-z][a-z0-9+.#-]{2,}", s.lower()) if w not in _STOP}


def _drop_other_profiles(text: str, role: str) -> str:
    """The file holds four role-specific profile paragraphs; keep only the one for the chosen role."""
    m = re.match(r"(Profile summary:\s*\n)((?:.+\n?)+)", text)
    if not m:
        return text
    paras = [p for p in m.group(2).strip().split("\n") if p.strip()]
    # paragraphs wrap over several lines, so rebuild by role starters
    block = m.group(2)
    starters = {"ai": "AI Engineer specializing", "fde": "AI Engineer focused on Forward", "ml": "Machine Learning Engineer", "sde": "Software Engineer hands-on"}
    pos = sorted((block.find(s), r) for r, s in starters.items() if block.find(s) >= 0)
    if len(pos) < 2 or role not in dict((r, p) for p, r in pos):
        return text
    ranges = {}
    for idx, (p, r) in enumerate(pos):
        ranges[r] = block[p: pos[idx + 1][0] if idx + 1 < len(pos) else len(block)].strip()
    return m.group(1) + ranges[role] + "\n" + text[m.end():]


def context_for(role: str, query: str = "", mode: str = "full", budget_chars: int = 9000) -> str:
    """full  = whole combined resume (deduped, one role profile).
       smart = profile + experience + skills always, then the projects that best match `query` until the budget is used."""
    text = _drop_other_profiles(load_clean(), role)
    if mode == "full" or len(text) <= budget_chars:
        return text
    groups = _groups(text)
    q = _tokens(query)
    df = Counter(t for g in groups for t in _tokens(g["text"]))
    n = len(groups)
    for i, g in enumerate(groups):
        toks = _tokens(g["text"])
        g["score"] = sum(log(1 + n / df[t]) for t in toks & q) if q else 0
        g["keep"] = g["always"] or i == 0 or bool(_EXPERIENCE.search(g.get("header", ""))) or g["text"].startswith("Profile summary")
    used = sum(len(g["text"]) for g in groups if g["keep"])
    for g in sorted((g for g in groups if not g["keep"]), key=lambda g: -g["score"]):
        if used + len(g["text"]) <= budget_chars:
            g["keep"] = True
            used += len(g["text"])
    return "\n\n".join(g["text"] for g in groups if g["keep"])
