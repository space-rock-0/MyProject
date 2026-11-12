import re
from datetime import date
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import config, gmail, llm, prompts, resumes, templates_loader as tpl

P = config.PROFILE
STATIC = Path(__file__).resolve().parent.parent / "static"
app = FastAPI(title="Personal Drafter")

RECIPIENT_TO_TEMPLATE = {"recruiter": "1", "employee": "2", "founder": "3", "general": "4"}
LINKEDIN_LIMIT = {"1": 300}  # connection notes are capped; later messages are not
LINKEDIN_SOFT = 700


def signature() -> str:
    return (f"Best regards,\n{P['name']}\n{P['location']}\n{P['phone']}\n{P['email']}\n"
            f"LinkedIn: {P['linkedin']}\nGitHub: {P['github']}")


def run(system: str, user: str, max_tokens: int = 600) -> dict:
    try:
        return llm.complete(system, user, max_tokens=max_tokens)
    except llm.LLMError as e:
        raise HTTPException(e.status, str(e))


def meta_of(r: dict, **extra) -> dict:
    return {"model": r["model"], "prompt_tokens": r["prompt_tokens"], "completion_tokens": r["completion_tokens"], **extra}


class Ctx(BaseModel):
    company: str = ""
    job_title: str = ""
    job_link: str = ""
    jd: str = ""
    company_info: str = ""
    person_info: str = ""


class EmailReq(Ctx):
    recipient_type: str = "recruiter"
    recipient_name: str = ""
    resume: str = "auto"


class LinkedInReq(Ctx):
    stage: str = "1"
    person_name: str = ""
    person_role: str = ""
    domain: str = ""


class FormReq(Ctx):
    questions: str = ""
    limit_words: int = 60


class CoverReq(Ctx):
    location: str = ""


class DraftReq(BaseModel):
    to: str = ""
    subject: str
    body: str
    resume_key: str = ""


@app.get("/api/meta")
def get_meta():
    available = list(config.resume_pdfs().keys())
    return {
        "profile": {"name": P["name"], "email": P["email"]},
        "email_templates": [{"id": k, "label": v["label"]} for k, v in tpl.email_templates().items()],
        "linkedin_templates": [{"id": k, "label": v["label"], "stage": v["stage"]} for k, v in tpl.linkedin_templates().items()],
        "resumes": [{"key": k, "file": p.name} for k, p in config.resume_pdfs().items()],
        "available": available,
        "linkedin_limits": LINKEDIN_LIMIT,
        "models": config.MODELS,
        "has_key": bool(config.GROQ_API_KEY),
        "gmail": gmail.status(),
    }


@app.post("/api/email")
def make_email(r: EmailReq):
    available = list(config.resume_pdfs().keys())
    if r.resume in available:
        key, scores = r.resume, resumes.score_roles(r.job_title, r.jd)
    else:
        key, scores = resumes.choose(r.job_title, r.jd, available)
    templates = tpl.email_templates()
    t = templates.get(RECIPIENT_TO_TEMPLATE.get(r.recipient_type, "1"))
    if not t:
        raise HTTPException(500, "Email template not found. Check 'Personal Drive/Email/Email Template.txt'.")
    resume_text = resumes.context_for(key, f"{r.job_title} {r.jd} {r.company_info}", mode="smart")
    ctx = prompts.ctx_block(r.model_dump(), [
        ("recipient_name", "Recipient name"), ("company", "Company"), ("job_title", "Job title"), ("job_link", "Job link"),
        ("jd", "Job description"), ("company_info", "Company notes"), ("person_info", "About the recipient")])
    out = run(prompts.SYSTEM, prompts.email_prompt(resume_text, t["body"], ctx), 500)
    m = re.search(r"SUBJECT:\s*(.*?)\s*\n\s*BODY:\s*(.*)", out["text"], re.S | re.I)
    if m:
        subject, body = m.group(1).strip(), m.group(2).strip()
    else:
        subject, body = "", out["text"].strip()
    if not subject:
        subject = f"Application for {r.job_title}" if r.job_title else f"Interested in opportunities at {r.company or 'your team'}"
    body = re.sub(r"\n*\s*(best regards|regards|sincerely),?\s*\n.*\Z", "", body, flags=re.I | re.S).strip()
    return {"subject": subject, "body": body + "\n\n" + signature(), "resume_key": key, "scores": scores,
            "template": t["label"], "meta": meta_of(out)}


@app.post("/api/linkedin")
def make_linkedin(r: LinkedInReq):
    t = tpl.linkedin_templates().get(r.stage)
    if not t:
        raise HTTPException(400, "Unknown LinkedIn stage.")
    limit = LINKEDIN_LIMIT.get(r.stage, LINKEDIN_SOFT)
    key, _ = resumes.choose(r.job_title, r.jd + " " + r.domain, list(config.resume_pdfs().keys()))
    resume_text = resumes.context_for(key, f"{r.job_title} {r.jd} {r.domain} {r.person_info}", mode="smart", budget_chars=7000)
    ctx = prompts.ctx_block(r.model_dump(), [
        ("person_name", "Their name"), ("person_role", "Their role/team"), ("domain", "My target domain"), ("company", "Company"),
        ("job_title", "Job title"), ("job_link", "Job link / req ID"), ("jd", "Job description"),
        ("person_info", "Their LinkedIn info (summary, posts)"), ("company_info", "Company notes")])
    out = run(prompts.SYSTEM, prompts.linkedin_prompt(resume_text, t, ctx, limit - 20), 350)
    msg = out["text"].strip().strip('"')
    note = ""
    if len(msg) > limit:  # one cheap retry, no resume needed
        fix = run("Shorten the message. Keep the meaning, first person, plain text. Output only the message.",
                  f"Max {limit - 20} characters including spaces.\n\n{msg}", 250)
        msg, note = fix["text"].strip().strip('"'), "Shortened to fit LinkedIn's limit."
    return {"message": msg, "limit": limit, "note": note, "meta": meta_of(out, resume_key=key)}


@app.post("/api/form")
def make_form(r: FormReq):
    qs = [q.strip() for q in re.split(r"\n\s*---+\s*\n|\n\s*---+\s*$", "\n" + r.questions.strip() + "\n") if q.strip()]
    if not qs:
        raise HTTPException(400, "Paste at least one question.")
    qs = qs[:10]
    limit = max(15, min(r.limit_words, 250))
    key, _ = resumes.choose(r.job_title, r.jd, list(config.resume_pdfs().keys()))
    resume_text = resumes.context_for(key, "", mode="full")  # form questions are open-ended: give the whole resume
    ctx = prompts.ctx_block(r.model_dump(), [("company", "Company"), ("job_title", "Job title"), ("jd", "Job description"), ("company_info", "Company notes")])
    out = run(prompts.SYSTEM, prompts.form_prompt(resume_text, ctx, qs, limit), 160 * len(qs) + 100)
    parts = re.split(r"^\s*###\s*(\d+)\s*$", out["text"], flags=re.M)
    answers = {int(parts[i]): parts[i + 1].strip() for i in range(1, len(parts) - 1, 2)}
    if not answers:  # model ignored the format
        answers = {1: out["text"].strip()}
    return {"answers": [{"q": q, "a": answers.get(i, "")} for i, q in enumerate(qs, 1)], "meta": meta_of(out)}


@app.post("/api/cover")
def make_cover(r: CoverReq):
    t = tpl.cover_template()
    key, _ = resumes.choose(r.job_title, r.jd, list(config.resume_pdfs().keys()))
    resume_text = resumes.context_for(key, f"{r.job_title} {r.jd} {r.company_info}", mode="smart")
    ctx = prompts.ctx_block(r.model_dump(), [("company", "Company"), ("job_title", "Job title"), ("jd", "Job description"), ("company_info", "Company notes")])
    out = run(prompts.SYSTEM, prompts.cover_prompt(resume_text, t["body"], ctx), 600)
    letter = (f"{t['header']}\n\n{date.today().strftime('%d %B %Y')}\n\n{r.company}\n{r.location}\n\n"
              f"Dear Hiring Manager,\n\n{out['text'].strip()}\n\nSincerely,\n{P['name']}")
    return {"text": letter, "meta": meta_of(out, resume_key=key)}


# ---------- resumes + Gmail ----------
@app.get("/api/resume/{key}")
def resume_pdf(key: str):
    p = config.resume_pdfs().get(key.lower())
    if not p:
        raise HTTPException(404, "Resume not found.")
    return FileResponse(p, media_type="application/pdf", filename=p.name)


@app.post("/api/gmail/draft")
def gmail_draft(r: DraftReq):
    pdf = config.resume_pdfs().get(r.resume_key.lower()) if r.resume_key else None
    try:
        return gmail.create_draft(r.to.strip(), r.subject, r.body, pdf, P.get("attachment_name", "Resume.pdf"))
    except PermissionError as e:
        raise HTTPException(401, str(e))
    except Exception as e:
        raise HTTPException(502, f"Gmail error: {e}")


@app.get("/auth/google/login")
def google_login():
    if not gmail.CRED.exists():
        raise HTTPException(400, "credentials.json not found in the project folder. See README step 3.")
    return RedirectResponse(gmail.login_url())


@app.get("/auth/google/callback")
def google_callback(request: Request):
    try:
        gmail.finish_login(str(request.url))
    except Exception as e:
        raise HTTPException(400, f"Google sign-in failed: {e}")
    return RedirectResponse("/?gmail=connected")


@app.post("/api/gmail/disconnect")
def google_disconnect():
    gmail.disconnect()
    return {"ok": True}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


app.mount("/static", StaticFiles(directory=STATIC), name="static")
