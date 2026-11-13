/**
 * composer.mjs — the local composer. Turns a request plus the user's own files
 * into a finished outreach draft with no model involved.
 *
 * If you find yourself adding a claim here, stop: every sentence is built from
 * a résumé bullet, the profile, or an answer the user typed. The composer may
 * reorder, shorten and reframe; it may not invent. `composeLocal` is therefore
 * deterministic and testable, which is why the fallback is no longer a
 * degradation — it is the default engine when no CLI is available.
 */

import { signatureBlock } from "./context.mjs";
import {
  emptySignals,
  overlapSkills,
  parseJobDescription,
  parseResume,
  resumeEducation,
  resumeSkillNames,
  selectEvidence,
} from "./evidence.mjs";

const CHANNELS = new Set(["email", "linkedin", "forms"]);

const ACTION_VERBS = new Set(
  `architected built designed developed engineered implemented created optimized operationalized curated led launched
   shipped automated reduced increased improved scaled deployed integrated migrated refactored wrote analyzed evaluated
   benchmarked productionized established directed secured delivered drove cut slashed trained fine-tuned orchestrated
   improved produced managed maintained supported partnered collaborated owned`
    .split(/\s+/)
    .filter(Boolean),
);

/* ------------------------------------------------------------------ text -- */

function str(value) {
  if (Array.isArray(value)) return value.map((item) => str(item)).filter(Boolean).join(", ");
  if (value && typeof value === "object") return "";
  return String(value ?? "").replace(/\r\n?/g, "\n");
}

/** Collapse whitespace and strip markdown emphasis, keeping prose. */
export function cleanProse(value) {
  return str(value)
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/(^|\s)\*([^*\n]+)\*/g, "$1$2")
    .replace(/\[([^\]]+)\]\((mailto:[^)]+|[^)]+)\)/g, "$1")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function words(value) {
  return str(value).split(/\s+/).filter(Boolean);
}

function wordCount(value) {
  return words(value).length;
}

function lowerFirst(value) {
  const s = str(value);
  return /^[A-Z][a-z]/.test(s) ? `${s[0].toLowerCase()}${s.slice(1)}` : s;
}

function startsWithAction(value) {
  const first = str(value).split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, "") ?? "";
  return ACTION_VERBS.has(first);
}

function trimEndPunctuation(value) {
  return str(value).replace(/[\s,;:.!?…-]+$/, "");
}

/** Words that leave a clipped sentence dangling if they end it. */
const TRAILING_STOPWORDS = new Set(
  "a an the and or but with by for from to of in on at as that which while achieving achieving, improving reducing increasing cutting boosting delivering serving handling reaching using via through into than then when where who whom whose is are was were be been being".split(
    /[,\s]+/,
  ),
);

/** Cut at the last clause boundary before `max` words. Never mid-word. */
function clipAtClause(value, max) {
  const list = words(value);
  if (list.length <= max) return trimEndPunctuation(value);
  let cut = list.slice(0, max).join(" ");
  const boundary = Math.max(cut.lastIndexOf(", "), cut.lastIndexOf("; "), cut.lastIndexOf(" — "));
  if (boundary > cut.length * 0.5) cut = cut.slice(0, boundary);
  else cut = cut.replace(/\s+\S*$/, "");
  // Drop function words left at the edge; they read as a broken sentence.
  let guard = 0;
  while (guard++ < 6) {
    const tail = cut.split(/\s+/).pop()?.toLowerCase().replace(/[^a-z-]/g, "") ?? "";
    if (!tail || !TRAILING_STOPWORDS.has(tail)) break;
    cut = cut.replace(/\s+\S+$/, "");
  }
  return trimEndPunctuation(cut);
}

function asSentence(value) {
  const clean = cleanProse(value).replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return /[.!?]$/.test(clean) ? clean : `${clean}.`;
}

function joinList(items, conjunction = "and") {
  const list = (items ?? []).map((item) => str(item).trim()).filter(Boolean);
  if (list.length <= 1) return list[0] ?? "";
  if (list.length === 2) return `${list[0]} ${conjunction} ${list[1]}`;
  return `${list.slice(0, -1).join(", ")} ${conjunction} ${list[list.length - 1]}`;
}

function firstName(value) {
  const clean = cleanProse(value).replace(/[^\p{L}\p{M} '\-.]/gu, " ").trim();
  if (!clean) return "";
  // "Priya Sharma (Recruiter)" and "priya.sharma@x.com" both yield "Priya".
  const token = clean.split(/\s+/)[0].replace(/[.'-]+$/, "");
  if (!token || token.includes("@") || /^(hi|hello|dear|hiring|team|recruiter|sir|madam)$/i.test(token)) return "";
  return token[0].toUpperCase() + token.slice(1);
}

function aOrAn(value) {
  return /^[aeiou]/i.test(str(value).trim()) ? "an" : "a";
}

/* -------------------------------------------------------------- evidence -- */

/**
 * Shorten one résumé bullet without changing its claim: cut at a clause
 * boundary and keep the measurable result clause when one exists.
 */
export function tightenEvidence(item, maxWords = 34) {
  const text = cleanProse(item?.text);
  if (!text) return "";
  // Result clauses begin with a verb and carry the number; taking the whole
  // chunk keeps "0.94 Context Precision" from being split at the decimal.
  const metric = text
    .split(/,\s+/)
    .reverse()
    .find(
      (chunk) =>
        /\d/.test(chunk) &&
        /^(?:improving|reducing|increasing|cutting|lowering|raising|boosting|driving|serving|delivering|handling|achieving|resulting in|with|at)\b/i.test(
          chunk,
        ),
    );
  let base = wordCount(text) <= maxWords ? trimEndPunctuation(text) : clipAtClause(text, maxWords);
  if (metric && !base.toLowerCase().includes(metric.toLowerCase())) {
    const combined = `${trimEndPunctuation(base)}, ${trimEndPunctuation(metric)}`;
    if (wordCount(combined) <= maxWords + 12) base = combined;
  }
  return trimEndPunctuation(base);
}

/**
 * One résumé bullet as a first-person sentence tied to where it happened.
 *
 * @param {{kind?: string, context?: string, text: string}} item
 * @param {number} [maxWords]
 */
export function evidenceClause(item, maxWords = 34) {
  const tight = tightenEvidence(item, maxWords);
  if (!tight) return "";
  const context = cleanProse(item?.context);
  const action = startsWithAction(tight);
  if (item?.kind === "project" && context) {
    return `In ${context}, I ${action ? lowerFirst(tight) : `shipped work on ${lowerFirst(tight)}`}.`;
  }
  if (item?.kind === "experience" && context) {
    return `At ${context}, I ${action ? lowerFirst(tight) : `worked on ${lowerFirst(tight)}`}.`;
  }
  return `${tight}${/[.!?]$/.test(tight) ? "" : "."}`;
}

/** The profile is user-authored, so its own sentences are safe verbatim. */
function profileFallbacks(candidate) {
  const out = [];
  const headline = cleanProse(candidate?.headline);
  const story = cleanProse(candidate?.exitStory);
  if (story) {
    const first = story.split(/(?<=[.!?])\s+/)[0];
    out.push(asSentence(first));
  }
  if (headline && !out.length) out.push(asSentence(`I'm ${aOrAn(headline)} ${lowerFirst(headline)}`));
  for (const point of (candidate?.proofPoints ?? []).slice(0, 3)) {
    const name = cleanProse(point?.name);
    const metric = cleanProse(point?.metric);
    if (!name || !metric) continue;
    out.push(asSentence(`${name}: ${metric}`));
  }
  return out;
}

function buildContext(req, ctx) {
  const company = cleanProse(req.company ?? ctx.company ?? "");
  const role = cleanProse(req.role ?? ctx.role ?? "");
  const jd = str(req.jd ?? ctx.jd ?? "").trim();
  const signals = jd ? parseJobDescription(jd, { company, role }) : emptySignals(company, role);
  signals.company = company || signals.company;
  signals.role = role || signals.role;

  const sources = [];
  const seen = new Set();
  for (const resume of ctx.resumes ?? []) {
    if (!resume || !str(resume.text).trim()) continue;
    const key = resume.key ?? resume.label ?? String(sources.length);
    if (seen.has(key)) continue;
    seen.add(key);
    sources.push(resume);
  }
  const docs = sources.map((resume) =>
    parseResume(resume.text, { key: resume.key ?? "", label: resume.label ?? "" }),
  );
  const candidate = ctx.candidate ?? {};
  const proofs = docs.length
    ? selectEvidence(docs, signals, { limit: 4 })
    : profileFallbacks(candidate).map((sentence, index) => ({
        kind: "profile",
        context: "",
        text: sentence,
        sentence,
        short: sentence,
        metric: "",
        order: index,
      }));
  const overlap = docs.length ? overlapSkills(docs, signals) : [];
  const skills = docs.length ? resumeSkillNames(docs) : [];
  const education = docs.length ? resumeEducation(docs) : { degree: "", school: "", cgpa: "", dates: "" };
  const templateName = cleanProse(ctx.templateName ?? "");
  const template = str(ctx.template ?? "");
  const intent = templateIntent(templateName, template);
  return {
    company,
    role,
    jd,
    signals,
    docs,
    proofs,
    overlap,
    skills,
    education,
    candidate,
    templateName,
    template,
    intent,
    jobUrl: cleanProse(req.jobUrl ?? ""),
    limit: req.limit === 200 ? 200 : 300,
    facts: resolveAnswers(req, candidate, signals, intent),
  };
}

/* -------------------------------------------------------------- template -- */

/**
 * Classify the chosen template into the strategy it actually encodes. The
 * filename is the strongest signal; the body catches renamed files.
 *
 * @param {string} name
 * @param {string} template
 */
export function templateIntent(name = "", template = "") {
  const byName = classifyIntent(String(name ?? "").toLowerCase());
  if (byName) return byName;
  return classifyIntent(String(template ?? "").toLowerCase()) ?? "generic";
}

/**
 * The filename is the strongest signal; the body only decides when the name is
 * generic (a body mentioning "students" must not turn a graduate template into
 * an internship one).
 */
function classifyIntent(text) {
  if (!text) return null;
  if (/follow[- ]?up|no reply|second follow/.test(text)) return "followup";
  if (/referral|mutual connection|know someone|referred/.test(text)) return "referral";
  if (/founder|cto|startup|early-stage/.test(text)) return "startup";
  if (/speculative|no open role|no active job/.test(text)) return "speculative";
  if (/agency|agencies|mass email/.test(text)) return "agency";
  if (/fresher|recent graduate|graduate/.test(text)) return "fresher";
  if (/student|internship/.test(text)) return "student";
  if (/\bhr\b|recruiter|talent acquisition|director/.test(text)) return "recruiter";
  if (/experienced professional|direct application/.test(text)) return "experienced";
  if (/filling in the blanks/.test(text)) return "blanks";
  if (/the script/.test(text)) return "script";
  if (/first message/.test(text)) return "first-message";
  if (/connection request|connect/.test(text)) return "connect-note";
  if (/higher reply rate/.test(text)) return "referral";
  if (/twitter|\bx dm\b/.test(text)) return "dm";
  if (/cover letter/.test(text)) return "cover";
  return null;
}

/* --------------------------------------------------------------- answers -- */

const ANSWER_INTENTS = [
  ["whyCompany", /why.*(company|us|our team|join us)|what\b[^?]{0,40}\b(attracts|interests|draws) you|interest in (the company|us)|why do you want to work/],
  ["whyRole", /why (this|the) (role|position|job)|why.*(fit|qualif)|interest in (this|the) (role|position)/],
  ["mutual", /referr|who suggested|how do you know|mutual|introduced/],
  ["specificThing", /specific|noticed|follow|recent (launch|post|news)|what stood out/],
  ["relocation", /relocat|willing to move|onsite|on-site|hybrid|work location/],
  ["visa", /visa|sponsor|authori[sz]ation|right to work|work permit/],
  ["salary", /salary|compensation|ctc|expected pay|pay expectation|remuneration/],
  ["availability", /availab|start date|notice period|when can you|join(ing)? date/],
  ["teamwork", /team ?work|collaborat|conflict|disagree|work(ing)? with others/],
  ["weakness", /weakness|improve|development area|constructive feedback/],
  ["challenge", /challenge|difficult|failure|obstacle|tight deadline|pressure/],
  ["strengths", /strength|superpower|best at|what are you good at/],
  ["project", /project|built|portfolio|technical work/],
];

function classifyAnswerKey(key) {
  const text = cleanProse(key).toLowerCase();
  for (const [id, pattern] of ANSWER_INTENTS) if (pattern.test(text)) return id;
  return null;
}

/**
 * Map whatever keys the UI sent (question text, question id, or a plain label)
 * onto the facts the composer needs. Answers are the user's own words, so they
 * are used verbatim when they fit.
 */
export function resolveAnswers(req, candidate = {}, signals = {}, intent = "generic") {
  const out = {
    whyCompany: "",
    whyRole: "",
    mutual: "",
    specificThing: "",
    relocation: "",
    visa: "",
    salary: "",
    availability: "",
    teamwork: "",
    weakness: "",
    challenge: "",
    strengths: "",
    project: "",
    extra: [],
  };
  for (const [key, value] of Object.entries(req.answers ?? {})) {
    const answer = cleanProse(value);
    if (!answer) continue;
    const id = classifyAnswerKey(key);
    if (id && !out[id]) out[id] = answer;
    else if (!id) out.extra.push(answer);
  }

  // The profile already answers a few of these; use it before asking.
  if (!out.visa) out.visa = cleanProse(candidate?.visaStatus);
  if (!out.relocation) out.relocation = cleanProse(candidate?.locationFlexibility);
  if (!out.salary) out.salary = cleanProse(candidate?.compensation);

  const notes = cleanProse(req.notes);
  if (notes) {
    const referred = notes.match(/\b(?:referr(?:ed|al) by|suggested by|through)\s+([A-Z][\p{L}'-]+(?:\s+[A-Z][\p{L}'-]+)?)/u);
    if (referred?.[1] && !out.mutual) out.mutual = referred[1];
    if (/\b(?:open to|willing to)\s+relocat/i.test(notes) && !out.relocation) out.relocation = notes;
    if (/\b(?:need|require)s?\s+(?:visa\s+)?sponsorship/i.test(notes) && !out.visa) out.visa = notes;
    if (intent === "referral" && !out.mutual && /referr/i.test(notes)) out.extra.push(notes);
  }
  return out;
}

/* ----------------------------------------------------------- personalise -- */

/**
 * Deterministic personalization questions. Only facts the files cannot hold:
 * the candidate's own reason for a company, a named contact, a real story.
 *
 * @param {object} req
 * @param {object} ctx - built context (company, role, facts, signals, intent, proofs)
 * @returns {Array<{id: string, question: string, why: string}>}
 */
export function personalizationQuestions(req, ctx) {
  const out = [];
  const company = cleanProse(ctx.company);
  const role = cleanProse(ctx.role);
  const facts = ctx.facts ?? {};
  const push = (id, question, why) => {
    if (out.some((q) => q.id === id)) return;
    out.push({ id, question, why });
  };

  if (company && !facts.whyCompany) {
    push(
      "why-company",
      `What genuinely interests you about ${company}?`,
      "A specific reason reads as genuine; invented enthusiasm is the first thing a recruiter notices.",
    );
  }

  if (ctx.intent === "referral" && !facts.mutual) {
    push(
      "mutual-connection",
      "Who referred you, or who suggested you reach out?",
      "The referral template names them in the first line. Without a name the email becomes a cold application.",
    );
  }

  if (req.channel === "linkedin") {
    if (!cleanProse(req.recipientName)) {
      push(
        "recipient-name",
        "What is the person's name (and role, if you know it)?",
        "A note addressed to a person gets read; 'Hi there' does not.",
      );
    } else if (!cleanProse(req.recipientProfile) && !facts.specificThing) {
      push(
        "specific-thing",
        `What is one specific thing you noticed about ${company || "their work"} or this person's profile?`,
        "One real detail is the difference between a note and a template.",
      );
    }
  }

  if (req.channel === "forms") {
    const questions = (req.questions ?? []).map((q) => cleanProse(q));
    const has = (pattern) => questions.some((q) => pattern.test(q));
    if (has(/team ?work|collaborat|conflict|disagree/i) && !facts.teamwork) {
      push(
        "teamwork-story",
        "Describe one real teamwork or disagreement story you can tell here.",
        "A teamwork answer has to be a real story; there is nothing in your résumé I can turn into one without inventing it.",
      );
    }
    if (has(/weakness|development area/i) && !facts.weakness) {
      push(
        "weakness",
        "What is a real weakness or development area you are comfortable naming?",
        "Only you can answer this honestly — I will not invent a weakness.",
      );
    }
    if (has(/challenge|difficult|failure|obstacle/i) && !facts.challenge && !ctx.proofs?.length) {
      push(
        "challenge-story",
        "Describe a challenge you actually ran into and how you handled it.",
        "The résumé has results, not the story behind them.",
      );
    }
  }

  if (ctx.signals?.mentionsVisa && !facts.visa) {
    push(
      "visa",
      "Do you need visa sponsorship for this role?",
      "The posting raises work authorization; an honest one-line answer prevents a later mismatch.",
    );
  }
  if (ctx.signals?.mentionsRelocation && !facts.relocation) {
    push(
      "relocation",
      "Are you open to relocating or working on-site for this role?",
      "The posting asks about location; your answer decides whether the draft should address it.",
    );
  }

  if (!role && req.channel !== "forms") {
    push("role", "Which role are you applying for?", "The role name anchors the subject line and the first sentence.");
  }

  return out.slice(0, 3);
}

/* ----------------------------------------------------------------- email -- */

const PROFESSIONAL_GREETINGS = new Set(["hr", "recruiter", "agency", "experienced"]);

function emailGreeting(req, ctx) {
  const name = cleanProse(req.recipientName);
  const first = firstName(name);
  if (first && !PROFESSIONAL_GREETINGS.has(ctx.intent)) return `Hi ${first},`;
  if (name) return `Dear ${name},`;
  if (ctx.intent === "startup") return "Hi there,";
  if (PROFESSIONAL_GREETINGS.has(ctx.intent)) return "Dear Hiring Team,";
  return "Hello,";
}

function emailSubject(req, ctx) {
  const role = ctx.role || "Software Engineer";
  const company = ctx.company;
  const overlap = ctx.overlap.slice(0, 2);
  const name = cleanProse(ctx.candidate?.name);
  switch (ctx.intent) {
    case "followup":
      return `Following up — ${role}${company ? ` at ${company}` : ""}`;
    case "speculative":
      return `Speculative application — ${role}${name ? ` | ${name}` : ""}`;
    case "recruiter":
    case "agency": {
      const who = firstName(req.recipientName);
      return `${who ? `${who}, ` : ""}keen on the ${role} role${company ? ` at ${company}` : ""}`;
    }
    case "startup":
      return `${role} — happy to build with ${company || "your team"}`;
    case "referral":
      return `${role} at ${company || "your team"} — quick intro`;
    case "student":
      return `${role} internship${company ? ` at ${company}` : ""} — ${name || "application"}`;
    case "fresher":
      return `${role}${company ? ` at ${company}` : ""} — ${name || "application"}`;
    case "dm":
      return `${role} at ${company || "your team"}`;
    default:
      if (overlap.length >= 2) return `${role} — ${overlap.join(" + ")}`.slice(0, 90);
      if (overlap.length === 1) return `${role} — ${overlap[0]}`.slice(0, 90);
      return company ? `${role} at ${company}` : role;
  }
}

function proofLines(ctx, max = 2) {
  return (ctx.proofs ?? [])
    .slice(0, max)
    .map((item) => (item.kind === "profile" ? asSentence(item.text) : evidenceClause(item, 36)))
    .filter(Boolean);
}

function overlapLine(ctx) {
  const overlap = ctx.overlap.slice(0, 3);
  if (!overlap.length) return "";
  if (overlap.length === 1) return `Your listing leans on ${overlap[0]}, which is where most of my work has been.`;
  return `Your listing leans on ${joinList(overlap)}, which is where most of my work has been.`;
}

function whyCompanyLine(ctx, req) {
  const company = ctx.company;
  const facts = ctx.facts;
  if (facts.whyCompany) {
    const answer = asSentence(facts.whyCompany.replace(/^why\s+[^:.]*[:.]\s*/i, ""));
    return company ? `On why ${company}: ${answer}` : answer;
  }
  const team = cleanProse(ctx.signals?.team);
  const domain = cleanProse(ctx.signals?.domainLabel);
  if (company && team) return `I'd like to bring that to ${company}'s ${team} team.`;
  if (company && domain) return `I'd like to bring that to ${company}'s ${domain} work.`;
  if (company) return `I'd like to bring that to ${company}.`;
  if (domain) return `I'd like to bring that to a team building ${domain}.`;
  return "";
}

function emailClose(ctx) {
  switch (ctx.intent) {
    case "speculative":
      return "If anything opens up, I'd love to be considered — and I'm happy to have an informal chat anytime.";
    case "startup":
      return "Would you be open to a 15-minute chat? I'm flexible on timing and happy to go deeper on what I've built.";
    case "followup":
      return "If the role is still open, I'd welcome a short conversation. If the timing is off, no worries at all.";
    case "referral":
      return ctx.facts?.mutual
        ? "If you think I'd be a good fit, I'd be grateful for a referral — and no worries at all if not."
        : "Would you be open to a short conversation about the role?";
    case "student":
    case "fresher":
      return "My résumé is attached. Would you be open to considering me for a relevant opening, or pointing me to the right person?";
    case "recruiter":
    case "agency":
      return "My résumé is attached. Would you be open to a quick 15-minute chat this week, or to passing this to the right person on your team?";
    default:
      return "My résumé is attached. Would you be open to a short conversation this week?";
  }
}

function educationLine(ctx) {
  const education = ctx.education ?? {};
  const degree = cleanProse(education.degree);
  const school = cleanProse(education.school);
  const cgpa = cleanProse(education.cgpa);
  // "2022 – Aug 2026" → "Aug 2026"; a plain year stays a plain year.
  const dates = cleanProse(education.graduating || education.dates).split("–").pop().trim();
  if (!degree && !school) return "";
  const place = school ? `at ${school}` : "";
  const grade = cgpa ? `CGPA ${cgpa}` : "";
  const when = dates && /^\d{4}$/.test(dates) ? `graduating in ${dates}` : dates ? `graduating ${dates}` : "";
  const detail = [place, grade, when].filter(Boolean).join(", ");
  return detail ? `${degree} ${detail}.` : `${degree}.`;
}

/** "architected …" → "I architected …" for a standalone answer sentence. */
function firstPerson(item, maxWords = 34) {
  const text = tightenEvidence(item, maxWords);
  if (!text) return "";
  return `${startsWithAction(text) ? "I " : ""}${startsWithAction(text) ? lowerFirst(text) : text}`;
}

function composeEmail(req, ctx) {
  const greeting = emailGreeting(req, ctx);
  const role = ctx.role || "the role";
  const company = ctx.company;
  const proofs = proofLines(ctx, 2);
  const paragraphs = [greeting];

  const opening = company
    ? `I'm applying for the ${role} role at ${company}.`
    : `I'm applying for the ${role}.`;
  paragraphs.push([opening, proofs[0] ?? ""].filter(Boolean).join(" "));

  if (ctx.intent === "speculative") {
    const bullets = (ctx.proofs ?? []).slice(0, 3).map((item) => `• ${evidenceClause(item, 24)}`);
    if (bullets.length) paragraphs.push("A few things about me:\n\n" + bullets.join("\n"));
  } else if (proofs[1]) {
    paragraphs.push(proofs[1]);
  }

  // One paragraph, not two: the overlap is the reason for the "bring that to X"
  // sentence, and splitting them leaves "that" pointing at nothing.
  const overlap = overlapLine(ctx);
  const why = whyCompanyLine(ctx, req);
  if (overlap || why) paragraphs.push([overlap, why].filter(Boolean).join(" "));

  if (ctx.intent === "student" || ctx.intent === "fresher") {
    const education = educationLine(ctx);
    const skills = joinList((ctx.overlap.length ? ctx.overlap : ctx.skills).slice(0, 3));
    paragraphs.push(
      [education, skills ? `I'm looking for ${aOrAn(role)} ${role} role where I can apply ${skills} on real work.` : ""]
        .filter(Boolean)
        .join(" "),
    );
  }

  if (ctx.intent === "startup") {
    const hats = (ctx.overlap.length ? ctx.overlap : ctx.skills).slice(0, 3);
    if (hats.length) {
      paragraphs.push(
        `I'm comfortable wearing several hats — ${joinList(hats)} — and I'd rather own a problem end to end than hand it off.`,
      );
    }
  }

  paragraphs.push(emailClose(ctx));
  if (ctx.jobUrl) paragraphs.push(`The posting: ${ctx.jobUrl}`);
  paragraphs.push(signatureBlock(ctx.candidate));

  const subject = emailSubject(req, ctx);
  const body = paragraphs
    .map((p) => cleanProse(p))
    .filter(Boolean)
    .join("\n\n");
  return { channel: "email", engine: "local", subject, body, questions: [], links: candidateLinks(ctx.candidate) };
}

function candidateLinks(candidate) {
  return (candidate?.links ?? []).filter(Boolean);
}

/* -------------------------------------------------------------- linkedin -- */

function linkedinHook(req, ctx) {
  const company = ctx.company;
  const role = ctx.role;
  const profile = cleanProse(req.recipientProfile);
  const facts = ctx.facts;

  if (facts.specificThing) {
    const detail = trimEndPunctuation(clipAtClause(facts.specificThing, 18));
    return detail ? `${detail} — that's what prompted this note.` : "";
  }
  if (profile) {
    const detail = trimEndPunctuation(clipAtClause(profile.split(/(?<=[.!?])\s+/)[0] ?? profile, 16));
    return detail ? `Your background — ${lowerFirst(detail)} — is why I'm reaching out.` : "";
  }
  if (ctx.intent === "referral" || ctx.intent === "script" || ctx.intent === "blanks") {
    return `I'm applying for the ${role || "role"} at ${company || "your company"} and hoped to ask you something.`;
  }
  if (req.recipientType === "hr" || req.recipientType === "recruiter") {
    return `I'm reaching out about the ${role || "open"} role${company ? ` at ${company}` : ""}.`;
  }
  return `I'm applying for the ${role || "open"} role${company ? ` at ${company}` : ""}.`;
}

const RESULT_PAST = Object.freeze({
  improving: "improved",
  reducing: "reduced",
  increasing: "increased",
  cutting: "cut",
  lowering: "lowered",
  raising: "raised",
  boosting: "boosted",
  driving: "drove",
  serving: "served",
  delivering: "delivered",
  handling: "handled",
  achieving: "achieved",
});

/** "…, improving retrieval precision by 35% (Precision@10)" → "improved retrieval precision by 35%" */
function resultPhrase(item) {
  const text = cleanProse(item?.text);
  const chunk = text
    .split(/,\s+/)
    .find(
      (part) =>
        /\d/.test(part) &&
        /^(?:improving|reducing|increasing|cutting|lowering|raising|boosting|driving|serving|delivering|handling|achieving)\b/i.test(
          part,
        ),
    );
  if (!chunk) return "";
  const clean = trimEndPunctuation(
    chunk
      .replace(/\s*\([^)]*\)\s*/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
  const match = clean.match(/^([A-Za-z]+)(\s+.*)$/);
  if (!match) return "";
  const past = RESULT_PAST[match[1].toLowerCase()];
  return past ? `${past}${match[2]}` : "";
}

function linkedinProof(ctx) {
  const overlap = ctx.overlap.slice(0, 2);
  const result = resultPhrase(ctx.proofs?.[0]);
  if (overlap.length && result) return `My work has been mostly ${joinList(overlap)}, and I've ${result}.`;
  if (overlap.length) return `Most of my work has been ${joinList(overlap)}.`;
  const item = ctx.proofs?.[0];
  return item ? evidenceClause(item, 20) : "";
}

function linkedinNote(req, ctx) {
  const first = firstName(req.recipientName) || "there";
  const hook = linkedinHook(req, ctx);
  const proof = linkedinProof(ctx);
  const note = `Hi ${first} — ${hook}${proof ? ` ${proof}` : ""} Would love to connect.`;
  return fitLinkedInNote(note, ctx.limit);
}

/** Trim a note without cutting a word in half; keep it under the limit. */
export function fitLinkedInNote(note, limit = 300) {
  let value = cleanProse(note).replace(/\s+/g, " ").trim();
  if (value.length <= limit) return value;
  const sentences = value.match(/[^.!?]+[.!?]?/g) ?? [value];
  // Drop trailing sentences (the proof, then the ask) until it fits, keeping the hook.
  while (sentences.length > 2) {
    sentences.pop();
    const candidate = sentences.join(" ").replace(/\s+/g, " ").trim();
    if (candidate.length <= limit - 20) {
      value = `${candidate} Would love to connect.`;
      break;
    }
  }
  if (value.length <= limit) return value;
  const cut = value.slice(0, limit - 1);
  const space = cut.lastIndexOf(" ");
  return `${cut.slice(0, space > limit * 0.6 ? space : limit - 1).replace(/[\s,;:.-]+$/, "")}…`;
}

function linkedinAsk(req, ctx) {
  const link = ctx.jobUrl ? ` Here's the posting: ${ctx.jobUrl}.` : "";
  const reqId = cleanProse(ctx.signals?.reqId);
  const ref = reqId ? ` (req ${reqId})` : "";
  switch (req.recipientType) {
    case "hiring-manager":
      return `Would you be open to a short conversation about what the team needs most in the first few months?`;
    case "hr":
    case "recruiter":
      return `Would you be open to pointing me to the right person on the team${ref}?${link}`;
    case "referral":
      return `Would you be open to referring me if my profile fits?${ref}${link} I can send my résumé so you can judge for yourself — and no worries at all if not.`;
    case "employee":
      return `Would you be open to sharing what the team is like — or to referring me if my profile fits?${ref}${link}`;
    default:
      return ctx.intent === "referral" || ctx.intent === "script" || ctx.intent === "blanks"
        ? `Would you be open to referring me if my profile fits?${ref}${link} Happy to send my résumé so you can judge for yourself.`
        : `Would you be open to a short conversation?`;
  }
}

function composeLinkedIn(req, ctx) {
  const first = firstName(req.recipientName) || "there";
  const role = ctx.role || "the role";
  const company = ctx.company;
  const proofs = proofLines(ctx, 2);
  const intro = company
    ? `Thanks for connecting. I'm applying for the ${role} role at ${company}.`
    : `Thanks for connecting. I'm applying for the ${role}.`;
  const body = [
    `Hi ${first},`,
    [intro, proofs[0] ?? ""].filter(Boolean).join(" "),
    proofs[1] ?? "",
    overlapLine(ctx),
    linkedinAsk(req, ctx),
    `Best,\n${ctx.candidate?.name ?? ""}`.trim(),
  ]
    .map((p) => cleanProse(p))
    .filter(Boolean)
    .join("\n\n");

  return {
    channel: "linkedin",
    engine: "local",
    connectNote: linkedinNote(req, ctx),
    message: body,
    limit: ctx.limit,
    questions: [],
    links: candidateLinks(ctx.candidate),
  };
}

/* ----------------------------------------------------------------- forms -- */

const FORM_INTENTS = Object.freeze([
  { id: "salary", re: /salary|compensation|ctc|expected pay|pay expectation|remuneration|package/i },
  { id: "visa", re: /visa|sponsor|authori[sz]ation|right to work|work permit/i },
  { id: "availability", re: /availab|start date|notice period|when can you|join(ing)? date/i },
  { id: "relocation", re: /relocat|willing to move|onsite|on-site|hybrid|work location|based in/i },
  { id: "why-company", re: /why.*(company|us|our team|join us)|what\b[^?]{0,40}\b(attracts|interests|draws) you|interest in (the company|us)|why do you want to work/i },
  { id: "why-role", re: /why (this|the) (role|position|job)|why.*(fit|qualif)|interest in (this|the) (role|position)/i },
  { id: "weakness", re: /weakness|development area|improve about yourself/i },
  { id: "teamwork", re: /team ?work|collaborat|conflict|disagree|work(ing)? with others/i },
  { id: "challenge", re: /challenge|difficult|failure|obstacle|tight deadline|pressure/i },
  { id: "project", re: /project|built|portfolio|technical work|proud of/i },
  { id: "strengths", re: /strength|superpower|best at|what are you good at/i },
  { id: "experience", re: /experience|background|tell us about yourself|introduce yourself|about you/i },
  { id: "referral-source", re: /how did you hear|referral|where did you find|source/i },
]);

/**
 * Classify one application question into the intent its answer should serve.
 *
 * @param {string} question
 * @returns {string}
 */
export function classifyFormQuestion(question) {
  const text = cleanProse(question);
  for (const intent of FORM_INTENTS) if (intent.re.test(text)) return intent.id;
  return "general";
}

/**
 * Pick the next unused proof that matches `predicate`; falls back to the first
 * match even if it was already used, so a one-bullet résumé still answers.
 */
function proofPicker(proofs, used) {
  return (predicate = () => true, max = 34) => {
    let index = proofs.findIndex((item, i) => !used.has(i) && predicate(item, i));
    if (index < 0) index = proofs.findIndex((item, i) => predicate(item, i));
    if (index < 0) return "";
    used.add(index);
    return evidenceClause(proofs[index], max);
  };
}

function formAnswer(intent, question, ctx, pick) {
  const facts = ctx.facts;
  const overlap = ctx.overlap.slice(0, 4);
  const role = ctx.role || "this role";
  const company = ctx.company;
  const team = cleanProse(ctx.signals?.team);
  const domain = cleanProse(ctx.signals?.domainLabel);

  if (intent === "salary") {
    if (facts.salary) return asSentence(`My target is ${facts.salary}; I'm open to discussing the full package.`);
    return "I'd rather not anchor a number before we've talked about scope — happy to align on the range for this role.";
  }
  if (intent === "visa") {
    if (facts.visa) return asSentence(facts.visa);
    return "Happy to confirm my work authorization for this role directly — it depends on the hiring location.";
  }
  if (intent === "availability") {
    if (facts.availability) return asSentence(facts.availability);
    const dates = cleanProse(ctx.education?.graduating || ctx.education?.dates).split("–").pop().trim();
    if (dates) return `I'm graduating ${/^\d{4}$/.test(dates) ? "in " : ""}${dates} and available to start from then.`;
    return "";
  }
  if (intent === "relocation") {
    if (facts.relocation) return asSentence(facts.relocation);
    return "Happy to confirm my location preference for this role directly.";
  }
  if (intent === "why-company") {
    if (facts.whyCompany) return asSentence(facts.whyCompany);
    const evidence = pick((item) => item.kind === "experience", 30) || pick(() => true, 30);
    let head;
    if (company && team) head = `My background lines up closely with what ${company}'s ${team} team builds`;
    else if (company && domain) head = `My background lines up closely with ${company}'s ${domain} work`;
    else if (company) head = `My background lines up closely with the work at ${company}`;
    else if (team) head = `My background lines up closely with what the ${team} team builds`;
    else head = "My background lines up closely with this work";
    return evidence ? `${head}: ${evidence}` : `${head}.`;
  }
  if (intent === "why-role") {
    const parts = [
      `The ${role} role is close to what I already do${overlap.length ? `: ${joinList(overlap)}` : ""}.`,
      pick(() => true, 32),
      pick(() => true, 26),
    ];
    return parts.filter(Boolean).join(" ");
  }
  if (intent === "project") {
    const evidence = pick((item) => item.kind === "project", 40) || pick(() => true, 40);
    if (!evidence) return "";
    const project = (ctx.proofs ?? []).find((item) => item.kind === "project");
    const stack = cleanProse(project?.stack);
    const parts = [evidence];
    if (stack) parts.push(`The stack was ${stack}.`);
    parts.push(pick((item) => item.kind !== "project", 26));
    return parts.filter(Boolean).join(" ");
  }
  if (intent === "challenge") {
    if (facts.challenge) return asSentence(facts.challenge);
    if (facts.teamwork) return asSentence(facts.teamwork);
    const evidence =
      pick(
        (item) => /\b(debug|optimi|reduc|improv|fix|scal|issue|latenc|cost|noise|hallucin)\w*/i.test(item.text),
        38,
      ) || pick(() => true, 38);
    return evidence ? `${evidence} The constraint was concrete and the target was measurable, which is what made it tractable.` : "";
  }
  if (intent === "teamwork") {
    if (facts.teamwork) return asSentence(facts.teamwork);
    const evidence = pick((item) => /\b(cross-functional|collaborat|partner|mentor|team)\w*/i.test(item.text), 34);
    return evidence || "";
  }
  if (intent === "strengths") {
    const top = (overlap.length ? overlap : ctx.skills).slice(0, 3);
    const parts = [];
    if (top.length) parts.push(`${joinList(top)} ${top.length === 1 ? "is" : "are"} where I'm strongest.`);
    parts.push(pick(() => true, 32), pick(() => true, 26));
    return parts.filter(Boolean).join(" ");
  }
  if (intent === "experience") {
    const education = educationLine(ctx);
    const evidence = pick(() => true, 34);
    const second = pick(() => true, 26);
    const parts = [education, evidence, second];
    return parts.filter(Boolean).join(" ");
  }
  if (intent === "referral-source") {
    if (facts.extra.length) return facts.extra[0];
    return company ? `I found the role through ${company}'s job posting.` : "";
  }
  if (facts.extra.length) return asSentence(facts.extra[0]);
  const parts = [pick(() => true, 30), pick(() => true, 24)];
  return parts.filter(Boolean).join(" ");
}

function composeForms(req, ctx) {
  const questions = (req.questions ?? []).map((q) => cleanProse(q)).filter(Boolean);
  const used = new Set();
  const answers = questions.map((question) => {
    const intent = classifyFormQuestion(question);
    const answer = formAnswer(intent, question, ctx, proofPicker(ctx.proofs ?? [], used));
    return { question, answer: cleanProse(answer) };
  });
  return { channel: "forms", engine: "local", answers, questions: [], links: candidateLinks(ctx.candidate) };
}

/* ------------------------------------------------------------------- API -- */

/**
 * Compose one outreach artifact from the user's own material.
 *
 * @param {object} req - normalized request (see prompt.mjs normalizeRequest)
 * @param {object} ctx
 * @param {{name?: string, email?: string, phone?: string, location?: string, links?: string[], headline?: string, exitStory?: string, proofPoints?: Array<{name: string, metric: string}>, visaStatus?: string, locationFlexibility?: string, compensation?: string}} [ctx.candidate]
 * @param {string} [ctx.template] - the chosen template's markdown
 * @param {string} [ctx.templateName] - its filename, used to pick the strategy
 * @param {Array<{key: string, label: string, text: string}>} [ctx.resumes]
 * @param {string} [ctx.jd]
 * @returns {object}
 */
export function composeLocal(req, ctx = {}) {
  const channel = CHANNELS.has(req?.channel) ? req.channel : "email";
  const built = buildContext(req, ctx);
  if (channel === "linkedin") return composeLinkedIn(req, built);
  if (channel === "forms") return composeForms(req, built);
  return composeEmail(req, built);
}

/** Build the context once so the route can ask questions and compose. */
export function localContext(req, ctx = {}) {
  return buildContext(req, ctx);
}

export { evidenceClause as _evidenceClause };
