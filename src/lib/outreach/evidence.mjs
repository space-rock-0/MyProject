/**
 * evidence.mjs — read a job description and the user's résumés into a small set
 * of matching, quantified proof points.
 *
 * The local composer is not allowed to invent. This module is the fact floor:
 * every sentence it hands the composer comes from a résumé the user selected,
 * ranked against the JD's own language. Pure text in, plain objects out, so
 * `node --test` can assert the ranking without a model or a browser.
 */

const MAX_TEXT = 24000;

/** Canonical skills → aliases. Kept deliberately explicit: a fuzzy matcher
 * would happily claim "Go" for the word "go", and a wrong skill is a made-up
 * qualification. */
export const SKILL_CATALOG = Object.freeze([
  // Languages
  { name: "Python", group: "language", aliases: ["python"] },
  { name: "JavaScript", group: "language", aliases: ["javascript"] },
  { name: "TypeScript", group: "language", aliases: ["typescript"] },
  { name: "Java", group: "language", aliases: ["java"] },
  { name: "SQL", group: "language", aliases: ["sql"] },
  { name: "C++", group: "language", aliases: ["c++"] },
  { name: "Go", group: "language", aliases: ["golang"] },
  { name: "Rust", group: "language", aliases: ["rust"] },
  { name: "C#", group: "language", aliases: ["c#", "csharp"] },
  { name: "Kotlin", group: "language", aliases: ["kotlin"] },
  { name: "Swift", group: "language", aliases: ["swift"] },
  { name: "Scala", group: "language", aliases: ["scala"] },
  { name: "R", group: "language", aliases: ["r programming"] },
  // AI / LLM
  { name: "LLM", group: "ai", aliases: ["llm", "large language model"] },
  { name: "RAG", group: "ai", aliases: ["rag", "retrieval-augmented"] },
  { name: "Generative AI", group: "ai", aliases: ["generative ai", "gen ai", "genai"] },
  { name: "AI agents", group: "ai", aliases: ["ai agent", "agentic"] },
  { name: "LangChain", group: "ai", aliases: ["langchain"] },
  { name: "LangGraph", group: "ai", aliases: ["langgraph"] },
  { name: "LlamaIndex", group: "ai", aliases: ["llamaindex"] },
  { name: "OpenAI", group: "ai", aliases: ["openai"] },
  { name: "Azure OpenAI", group: "ai", aliases: ["azure openai"] },
  { name: "Gemini", group: "ai", aliases: ["gemini"] },
  { name: "Hugging Face", group: "ai", aliases: ["hugging face", "huggingface"] },
  { name: "Prompt engineering", group: "ai", aliases: ["prompt engineering", "prompt design"] },
  { name: "Vector search", group: "ai", aliases: ["vector search", "vector database", "vector db"] },
  { name: "Embeddings", group: "ai", aliases: ["embedding"] },
  { name: "Semantic search", group: "ai", aliases: ["semantic search", "semantic reranking"] },
  { name: "Retrieval", group: "ai", aliases: ["retrieval", "hybrid search", "reranking"] },
  { name: "Fine-tuning", group: "ai", aliases: ["fine-tuning", "finetuning", "sft", "rlhf"] },
  { name: "LLM evaluation", group: "ai", aliases: ["ragas", "langsmith", "langfuse", "llm evaluation", "eval set"] },
  { name: "Guardrails", group: "ai", aliases: ["guardrail", "responsible ai", "hallucination"] },
  { name: "MCP", group: "ai", aliases: ["model context protocol", "mcp"] },
  { name: "Tool calling", group: "ai", aliases: ["tool calling", "function calling"] },
  { name: "Multi-agent", group: "ai", aliases: ["multi-agent", "multi agent"] },
  { name: "Context engineering", group: "ai", aliases: ["context engineering", "context window"] },
  // ML
  { name: "Machine learning", group: "ml", aliases: ["machine learning"] },
  { name: "Deep learning", group: "ml", aliases: ["deep learning"] },
  { name: "NLP", group: "ml", aliases: ["nlp", "natural language"] },
  { name: "Computer vision", group: "ml", aliases: ["computer vision"] },
  { name: "PyTorch", group: "ml", aliases: ["pytorch"] },
  { name: "TensorFlow", group: "ml", aliases: ["tensorflow"] },
  { name: "scikit-learn", group: "ml", aliases: ["scikit-learn", "sklearn", "scikit learn"] },
  { name: "Pandas", group: "ml", aliases: ["pandas"] },
  { name: "NumPy", group: "ml", aliases: ["numpy"] },
  { name: "SciPy", group: "ml", aliases: ["scipy"] },
  { name: "Recommendation systems", group: "ml", aliases: ["recommendation system", "recommender"] },
  { name: "Anomaly detection", group: "ml", aliases: ["anomaly detection"] },
  { name: "Classification", group: "ml", aliases: ["classification", "logistic regression"] },
  { name: "Feature engineering", group: "ml", aliases: ["feature engineering"] },
  { name: "XGBoost", group: "ml", aliases: ["xgboost", "lightgbm"] },
  { name: "MLOps", group: "ml", aliases: ["mlops"] },
  { name: "Model training", group: "ml", aliases: ["model training", "model development"] },
  // Backend
  { name: "FastAPI", group: "backend", aliases: ["fastapi"] },
  { name: "Django", group: "backend", aliases: ["django"] },
  { name: "Flask", group: "backend", aliases: ["flask"] },
  { name: "Node.js", group: "backend", aliases: ["node.js", "nodejs", "node"] },
  { name: "Express", group: "backend", aliases: ["express.js", "expressjs"] },
  { name: "REST APIs", group: "backend", aliases: ["rest api", "restful", "api design"] },
  { name: "GraphQL", group: "backend", aliases: ["graphql"] },
  { name: "gRPC", group: "backend", aliases: ["grpc"] },
  { name: "Microservices", group: "backend", aliases: ["microservice"] },
  { name: "WebSockets", group: "backend", aliases: ["websocket"] },
  { name: "Redis", group: "backend", aliases: ["redis"] },
  { name: "PostgreSQL", group: "backend", aliases: ["postgresql", "postgres"] },
  { name: "MySQL", group: "backend", aliases: ["mysql"] },
  { name: "MongoDB", group: "backend", aliases: ["mongodb"] },
  { name: "SQLite", group: "backend", aliases: ["sqlite"] },
  { name: "Supabase", group: "backend", aliases: ["supabase"] },
  { name: "Prisma", group: "backend", aliases: ["prisma"] },
  { name: "Kafka", group: "backend", aliases: ["kafka"] },
  { name: "RabbitMQ", group: "backend", aliases: ["rabbitmq"] },
  { name: "BullMQ", group: "backend", aliases: ["bullmq"] },
  { name: "Celery", group: "backend", aliases: ["celery"] },
  { name: "Distributed systems", group: "backend", aliases: ["distributed system", "system design", "event-driven"] },
  // Frontend
  { name: "React", group: "frontend", aliases: ["react.js", "reactjs", "react"] },
  { name: "Next.js", group: "frontend", aliases: ["next.js", "nextjs"] },
  { name: "Vue", group: "frontend", aliases: ["vue.js", "vuejs"] },
  { name: "Angular", group: "frontend", aliases: ["angular"] },
  { name: "HTML", group: "frontend", aliases: ["html5", "html"] },
  { name: "CSS", group: "frontend", aliases: ["css3", "css"] },
  { name: "Tailwind CSS", group: "frontend", aliases: ["tailwind"] },
  { name: "Redux", group: "frontend", aliases: ["redux"] },
  { name: "UI/UX", group: "frontend", aliases: ["ui/ux", "user experience", "responsive design"] },
  // Cloud / DevOps
  { name: "AWS", group: "cloud", aliases: ["aws", "amazon web services"] },
  { name: "Azure", group: "cloud", aliases: ["azure"] },
  { name: "GCP", group: "cloud", aliases: ["gcp", "google cloud"] },
  { name: "Vertex AI", group: "cloud", aliases: ["vertex ai"] },
  { name: "Docker", group: "cloud", aliases: ["docker"] },
  { name: "Kubernetes", group: "cloud", aliases: ["kubernetes", "k8s"] },
  { name: "CI/CD", group: "cloud", aliases: ["ci/cd", "continuous integration", "github actions"] },
  { name: "Terraform", group: "cloud", aliases: ["terraform"] },
  { name: "Linux", group: "cloud", aliases: ["linux"] },
  { name: "Observability", group: "cloud", aliases: ["opentelemetry", "application insights", "observability"] },
  // Data
  { name: "Spark", group: "data", aliases: ["spark"] },
  { name: "Airflow", group: "data", aliases: ["airflow"] },
  { name: "dbt", group: "data", aliases: ["dbt"] },
  { name: "Snowflake", group: "data", aliases: ["snowflake"] },
  { name: "Databricks", group: "data", aliases: ["databricks"] },
  { name: "BigQuery", group: "data", aliases: ["bigquery"] },
  { name: "ETL", group: "data", aliases: ["etl", "data pipeline"] },
  { name: "Data modeling", group: "data", aliases: ["data modeling", "data model"] },
  // Business / automation
  { name: "Power BI", group: "product", aliases: ["power bi"] },
  { name: "Power Automate", group: "product", aliases: ["power automate"] },
  { name: "Power Apps", group: "product", aliases: ["power apps"] },
  { name: "UiPath", group: "product", aliases: ["uipath"] },
  { name: "SharePoint", group: "product", aliases: ["sharepoint"] },
  { name: "Figma", group: "product", aliases: ["figma"] },
  // Soft / delivery
  { name: "Communication", group: "soft", aliases: ["communication"] },
  { name: "Collaboration", group: "soft", aliases: ["collaboration", "cross-functional", "cross functional"] },
  { name: "Stakeholder management", group: "soft", aliases: ["stakeholder"] },
  { name: "Ownership", group: "soft", aliases: ["ownership", "end-to-end"] },
  { name: "Problem solving", group: "soft", aliases: ["problem solving", "problem-solving"] },
  { name: "Customer-facing", group: "soft", aliases: ["customer-facing", "customer facing", "client-facing"] },
  { name: "Requirements gathering", group: "soft", aliases: ["requirements gathering", "technical scoping"] },
  { name: "Solution architecture", group: "soft", aliases: ["solution architecture", "solution design"] },
  { name: "Rapid prototyping", group: "soft", aliases: ["rapid prototyping", "prototype"] },
  { name: "Workflow automation", group: "soft", aliases: ["workflow automation", "automation"] },
  { name: "Mentoring", group: "soft", aliases: ["mentoring", "mentor"] },
  { name: "Documentation", group: "soft", aliases: ["documentation"] },
]);

const STOPWORDS = new Set(
  `a an and are as at be been being but by can could did do does for from had has have having he her here him his
   how i if in into is it its itself may me might more most must my no nor not of on one only or other our out over
   own same she should so some such than that the their them then there these they this those through to too under
   until up very was we were what when where which while who whom why will with would you your yours role roles job
   jobs work working team teams company companies candidate candidates experience experiences year years required
   requirements responsibilities qualifications ability able across also among around because before between both
   during each either etc every first great good including like looking make many new next now opportunity plus
   preferred provide strong successful support use using want well within without world least including`
    .split(/\s+/)
    .filter(Boolean),
);

const ACTION_VERBS = new Set(
  `architected built designed developed engineered implemented created optimized operationalized curated led launched
   shipped automated reduced increased improved scaled deployed integrated migrated refactored wrote analyzed evaluated
   benchmarked productionized established directed secured delivered drove cut slashed trained fine-tuned orchestrated`
    .split(/\s+/)
    .filter(Boolean),
);

const GROUP_LABELS = Object.freeze({
  ai: "AI engineering",
  ml: "machine learning",
  backend: "backend engineering",
  frontend: "frontend engineering",
  fullstack: "full-stack engineering",
  data: "data engineering",
  cloud: "platform / DevOps",
  product: "product engineering",
  soft: "software delivery",
  language: "software engineering",
});

function textOf(value) {
  return String(value ?? "");
}

function normalizeText(value) {
  return textOf(value)
    .slice(0, MAX_TEXT)
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/^(\s*)\uFFFD\s+/gm, "$1• ")
    .replace(/\uFFFD/g, "–")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

function collapse(value) {
  return textOf(value).replace(/\s+/g, " ").trim();
}

function stripTrailingPeriod(value) {
  return collapse(value).replace(/[.;:,]+$/, "").trim();
}

function lowerFirst(value) {
  const s = textOf(value);
  return /^[A-Z][a-z]/.test(s) ? `${s[0].toLowerCase()}${s.slice(1)}` : s;
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function aliasRegex(alias) {
  const escaped = escapeRegex(alias);
  const body = escaped.replace(/\s+/g, "\\s+");
  if (/^[a-z0-9]+$/.test(alias)) return new RegExp(`\\b${body}\\b`, "gi");
  return new RegExp(body, "gi");
}

/** Count every alias once per occurrence; keep the best alias count per skill. */
function countAlias(text, alias) {
  try {
    return (text.match(aliasRegex(alias)) ?? []).length;
  } catch {
    return 0;
  }
}

/**
 * Match the skill catalog against arbitrary text.
 *
 * @param {string} text
 * @returns {Array<{name: string, group: string, score: number}>}
 */
export function matchSkills(text) {
  const haystack = textOf(text);
  if (!haystack.trim()) return [];
  const found = [];
  for (const skill of SKILL_CATALOG) {
    let best = 0;
    for (const alias of skill.aliases) {
      const count = countAlias(haystack, alias);
      if (count > best) best = count;
    }
    if (best > 0) found.push({ name: skill.name, group: skill.group, score: best });
  }
  found.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return found;
}

function skillWeightedTokens(skills) {
  const weights = new Map();
  for (const skill of skills ?? []) {
    weights.set(skill.name.toLowerCase(), 5 + Math.min(skill.score, 4));
  }
  return weights;
}

function significantTokens(text, limit = 30) {
  const counts = new Map();
  for (const raw of textOf(text).toLowerCase().split(/[^a-z0-9+#.]+/)) {
    const token = raw.replace(/^[.]+|[.]+$/g, "");
    if (token.length < 4 || STOPWORDS.has(token)) continue;
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([token]) => token);
}

function extractBulletLines(text) {
  const lines = text.split(/\n/);
  const bulletRe = /^\s*(?:[-*•●▪◦–]|\uFFFD|\d+[.)])\s+(.*)$/;
  const out = [];
  let current = null;
  const flush = () => {
    if (current) out.push(collapse(current));
    current = null;
  };
  for (const raw of lines) {
    const line = collapse(raw);
    const match = bulletRe.exec(raw);
    if (match) {
      flush();
      current = match[1].trim();
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    if (current) {
      // A wrapped bullet continues on the next line; a heading starts a new block.
      const looksLikeHeading =
        line.length < 70 &&
        (/^(?:[A-Z][A-Z &/()'-]{2,}|[A-Z][\w /&()-]{2,}:)$/.test(line) || /^#{1,6}\s/.test(line));
      if (!looksLikeHeading && /^[a-z0-9(“"'\-]/.test(line)) {
        current = `${current} ${line}`;
      } else {
        flush();
      }
    }
  }
  flush();
  return out.map(stripTrailingPeriod).filter((line) => line.length >= 24 && line.length <= 700);
}

function sentenceLines(text, limit = 24) {
  const out = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const clean = collapse(paragraph);
    if (clean.length < 40) continue;
    const parts = clean.split(/(?<=[.!?])\s+(?=[A-Z])/);
    for (const part of parts) {
      const sentence = stripTrailingPeriod(part);
      if (sentence.length >= 40 && sentence.length <= 700) out.push(sentence);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

function classifyBullets(bullets) {
  const responsibilities = [];
  const requirements = [];
  for (const bullet of bullets) {
    if (
      /\b(require[sd]?|qualif(?:ication|ied)|must have|proficien|familiar|knowledge of|degree|nice to have|experience (?:with|in)|you have|we look for)\b/i.test(
        bullet,
      )
    ) {
      requirements.push(bullet);
    } else if (
      /\b(build|design|develop|own|lead|collaborat|deploy|maintain|ship|implement|create|architect|optimize|analy[sz]e|partner|drive|work)\b/i.test(
        bullet,
      )
    ) {
      responsibilities.push(bullet);
    } else {
      responsibilities.push(bullet);
    }
  }
  return { responsibilities, requirements };
}

function detectSeniority(text) {
  if (/\b(intern|internship)\b/i.test(text)) return "internship";
  if (/\b(new grad|graduate|entry[- ]level|junior|fresher|associate)\b/i.test(text)) return "entry";
  if (/\b(principal|staff|head of|director|vp|vice president)\b/i.test(text)) return "leadership";
  if (/\b(senior|lead|manager)\b/i.test(text)) return "senior";
  return "mid";
}

function detectDomain(skills) {
  const score = { ai: 0, ml: 0, backend: 0, frontend: 0, data: 0, cloud: 0, product: 0, soft: 0 };
  for (const skill of skills ?? []) score[skill.group] = (score[skill.group] ?? 0) + skill.score;
  const aiCombined = score.ai + score.ml;
  if (aiCombined > 0 && aiCombined >= Math.max(score.backend, score.frontend, score.data, score.cloud)) {
    return score.ai >= score.ml ? "ai" : "ml";
  }
  if (score.frontend > 0 && score.backend > 0) return "fullstack";
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  const [group, value] = ranked[0] ?? ["language", 0];
  return value > 0 ? group : "language";
}

function extractTeam(text) {
  const patterns = [
    /\b(?:the|our)\s+([A-Z][\w/&.-]*(?:\s+[A-Z][\w/&.-]*){0,3})\s+(?:team|group|org)\b/,
    /\b(?:the|our)\s+([\w/&.-]+(?:\s+[\w/&.-]+){0,3})\s+(?:team|group)\b/i,
    /\bteam behind\s+([\w/&.-]+(?:\s+[\w/&.-]+){0,3})\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return collapse(match[1]).replace(/[.,;:]+$/, "");
  }
  return "";
}

const LOCATION_WORDS = Object.freeze([
  "Bengaluru",
  "Bangalore",
  "Hyderabad",
  "Chennai",
  "Pune",
  "Mumbai",
  "Delhi",
  "Noida",
  "Gurugram",
  "Gurgaon",
  "Kolkata",
  "Ahmedabad",
  "London",
  "Berlin",
  "Munich",
  "Amsterdam",
  "Dublin",
  "Paris",
  "Zurich",
  "New York",
  "San Francisco",
  "Seattle",
  "Austin",
  "Boston",
  "Toronto",
  "Vancouver",
  "Singapore",
  "Dubai",
  "Sydney",
  "Tokyo",
]);

function detectLocation(text) {
  const city = LOCATION_WORDS.find((name) => new RegExp(`\\b${escapeRegex(name)}\\b`, "i").test(text)) ?? "";
  const remote = /\b(?:fully )?remote\b/i.test(text);
  const hybrid = /\bhybrid\b/i.test(text);
  const onsite = /\b(?:on-?site|in-?office|in person)\b/i.test(text);
  return {
    city,
    remote,
    hybrid,
    onsite,
    label: [city, remote ? "Remote" : "", hybrid ? "Hybrid" : "", onsite ? "On-site" : ""]
      .filter(Boolean)
      .join(" · "),
  };
}

function extractReqId(text) {
  const patterns = [
    /\b(?:req(?:uisition)?|job|posting|position)\s*(?:id|#|number|no\.?)?\s*[:#-]?\s*([A-Z]{0,4}[-_]?\d{3,}[A-Z0-9-]*)/i,
    /\b(?:ref|reference)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{2,})/i,
    /\b(JR[-_]?\d{3,}[A-Z0-9-]*)\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1].replace(/[-_]+$/, "");
  }
  return "";
}

function extractRole(text) {
  const patterns = [
    /^\s*(?:job title|role|position)\s*[:—-]\s*(.+)$/im,
    /\b(?:hiring|seeking|looking for|recruiting)\s+(?:an?|one)?\s*([A-Z][\w/&+.-]*(?:\s+[A-Z][\w/&+.-]*){0,5})/,
    /^\s*([A-Z][\w/&+.-]*(?:\s+[A-Z][\w/&+.-]*){0,5})\s*(?:\(|$)/m,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match?.[1]) continue;
    const value = collapse(match[1]).replace(/[.,;:]+$/, "");
    if (value.length >= 3 && value.length <= 80 && /\b(engineer|developer|scientist|analyst|manager|intern|designer|architect|consultant|specialist|lead|director)\b/i.test(value)) {
      return value;
    }
  }
  return "";
}

function buildHook(signals) {
  const skills = signals.skillNames.slice(0, 3);
  if (skills.length >= 2) return `the role's focus on ${skills.slice(0, 2).join(" and ")}`;
  if (skills.length === 1) return `the role's focus on ${skills[0]}`;
  const first = signals.responsibilities[0] ?? signals.requirements[0] ?? "";
  if (first) return collapse(first).replace(/[.;:]+$/, "").slice(0, 150);
  return `the work behind ${signals.role || "the role"}`;
}

/**
 * Read a JD into the signals a composer needs.
 *
 * @param {string} jd
 * @param {{company?: string, role?: string}} [opts]
 */
export function parseJobDescription(jd, opts = {}) {
  const raw = normalizeText(jd);
  const text = raw || "";
  const skills = matchSkills(text);
  const skillNames = skills.map((s) => s.name);
  const bulletLines = extractBulletLines(text);
  const lines = bulletLines.length >= 3 ? bulletLines : sentenceLines(text);
  const { responsibilities, requirements } = classifyBullets(lines);
  const domain = detectDomain(skills);
  const location = detectLocation(text);
  const signals = {
    raw,
    text,
    company: collapse(opts.company ?? ""),
    role: collapse(opts.role ?? "") || extractRole(text),
    skills,
    skillNames,
    responsibilities,
    requirements,
    allLines: lines,
    seniority: detectSeniority(text),
    domain,
    domainLabel: GROUP_LABELS[domain] ?? "software engineering",
    team: extractTeam(text),
    location,
    reqId: extractReqId(text),
    mentionsVisa: /\b(visa|sponsor(?:ship)?|work authorization|right to work|work permit)\b/i.test(text),
    mentionsStart: /\b(start date|start in|available to start|join(?:ing)? date|immediate(?:ly)?)\b/i.test(text),
    mentionsRelocation: /\b(relocat|willing to move|onsite|on-site|hybrid|in-office|in office)\b/i.test(text),
  };
  signals.hook = buildHook(signals);
  return signals;
}

/** Empty signals for the "no JD" case — still useful, never null. */
export function emptySignals(company = "", role = "") {
  return {
    raw: "",
    text: "",
    company: collapse(company),
    role: collapse(role),
    skills: [],
    skillNames: [],
    responsibilities: [],
    requirements: [],
    allLines: [],
    seniority: "mid",
    domain: "language",
    domainLabel: GROUP_LABELS.language,
    team: "",
    location: { city: "", remote: false, hybrid: false, onsite: false, label: "" },
    reqId: "",
    mentionsVisa: false,
    mentionsStart: false,
    mentionsRelocation: false,
    hook: "",
  };
}

const SECTION_ALIASES = Object.freeze([
  { id: "summary", re: /^(?:professional )?summary$|^profile$|^about(?: me)?$/i },
  { id: "experience", re: /^(?:work |professional |employment )?experience$|^work history$|^employment history$/i },
  { id: "projects", re: /^(?:projects?|selected projects|technical projects)$/i },
  { id: "education", re: /^education(?: & training)?$/i },
  { id: "skills", re: /^(?:technical )?skills(?: & (?:tools|technologies))?$|^technologies$/i },
  { id: "achievements", re: /^(?:achievements?|awards?|certifications?|achievements? & certifications?)$/i },
]);

function sectionId(line) {
  const clean = collapse(line).replace(/[:：]+$/, "");
  for (const alias of SECTION_ALIASES) if (alias.re.test(clean)) return alias.id;
  return null;
}

/**
 * The leading run of ALL-CAPS words in a line, e.g.
 * "EDUCATION   2022 – Aug 2026" → "EDUCATION".
 *
 * Résumés exported from PDF/DOCX routinely put a right-aligned date on the
 * same line as the heading, which the whole-line caps test used to reject.
 */
function upperHeading(line) {
  const run = [];
  for (const token of collapse(line).split(/\s+/)) {
    const bare = token.replace(/[^A-Za-z&/()'’-]/g, "");
    if (!bare || !/^[A-Z][A-Z&/()'’-]*$/.test(bare) || !/[A-Z]{2}/.test(bare)) break;
    run.push(token.replace(/[^A-Za-z&/()'’-]+$/, ""));
  }
  return run.join(" ").trim();
}

function splitResumeSections(text) {
  const lines = text.split(/\n/);
  const sections = {};
  let current = null;
  const push = (id, line) => {
    if (!id) return;
    if (!sections[id]) sections[id] = [];
    if (line) sections[id].push(line);
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const clean = collapse(line);
    if (!clean) {
      if (current) sections[current]?.push("");
      continue;
    }
    const md = clean.match(/^(#{1,6})\s+(.+)$/);
    if (md && md[1].length <= 2) {
      const id = sectionId(md[2]);
      if (id) {
        current = id;
        sections[id] = sections[id] ?? [];
      } else {
        current = null;
      }
      continue;
    }
    if (md) {
      // A level-3+ heading is an entry inside the current section (cv.md style).
      if (current) sections[current].push(clean);
      continue;
    }
    const heading = upperHeading(clean);
    const headingId = heading ? sectionId(heading) : null;
    if (headingId) {
      current = headingId;
      sections[headingId] = sections[headingId] ?? [];
      // "EDUCATION   2022 – Aug 2026" carries the date on the heading line.
      const rest = clean.slice(clean.indexOf(heading) + heading.length).trim();
      if (rest) sections[headingId].push(rest);
      continue;
    }
    if (heading && heading.length >= 3) {
      // A caps line that is not a section heading ("SIDDHARTHA SAGI") ends the
      // previous section rather than becoming content inside it.
      current = null;
      continue;
    }
    if (current) sections[current].push(line);
  }
  return sections;
}

const MONTH = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const DATE_RANGE = new RegExp(`(${MONTH}\\s+\\d{4})\\s*(?:[–—\\-•]|to)\\s*(${MONTH}\\s+\\d{4}|present|current)`, "i");
const DATE_SINGLE = new RegExp(`(${MONTH}\\s+\\d{4})`, "i");

function parseDateRange(value) {
  const text = collapse(value);
  const range = text.match(DATE_RANGE);
  if (range) return { dates: `${range[1]} – ${range[2].replace(/^current$/i, "Present")}`, rest: text.replace(range[0], "").trim() };
  const single = text.match(DATE_SINGLE);
  if (single) return { dates: single[1], rest: text.replace(single[0], "").trim() };
  return { dates: "", rest: text };
}

function isDateRangeLine(value) {
  const text = collapse(value);
  return DATE_RANGE.test(text) && text.replace(DATE_RANGE, "").replace(/[|\s,]+/g, "").length === 0;
}

function parseExperienceHeader(line) {
  const clean = collapse(line);
  if (!clean || /^[-*•●▪◦]/.test(clean)) return null;

  // cv.md: "### Innodata — Remote"
  const md = clean.match(/^#{3,6}\s+(.+)$/);
  if (md) {
    const body = md[1];
    const [company, ...rest] = body.split(/\s+[—–-]\s+/);
    if (company && company.length >= 2) {
      return { company: company.trim(), location: rest.join(" — ").trim(), title: "", dates: "" };
    }
  }

  // Personal Drive: "Accenture | Advanced App Engineering Analyst (Intern)   May 2025 – July 2025"
  if (clean.includes("|")) {
    const [left, ...rightParts] = clean.split("|");
    const right = rightParts.join("|").trim();
    const parsed = parseDateRange(right);
    const title = parsed.rest.replace(/^[\s,·•–-]+|[\s,·•–-]+$/g, "");
    const company = left.replace(/^[-*•]\s*/, "").replace(/\*\*/g, "").trim();
    if (company.length >= 2 && (title || parsed.dates)) {
      return { company, title, dates: parsed.dates, location: "" };
    }
  }

  // "Company — Title   Jan 2024 – Mar 2025"
  const withRange = parseDateRange(clean);
  if (withRange.dates) {
    const parts = withRange.rest.split(/\s+[—–|]\s+/);
    if (parts.length >= 2) {
      return { company: parts[0].trim(), title: parts.slice(1).join(" — ").trim(), dates: withRange.dates, location: "" };
    }
  }

  return null;
}

function parseBulletLine(line) {
  const match = /^\s*(?:[-*•●▪◦–]|\uFFFD)\s+(.+)$/.exec(line);
  if (!match) return "";
  return stripTrailingPeriod(match[1]);
}

function parseExperience(lines) {
  const entries = [];
  let current = null;
  const ensure = () => {
    if (!current) {
      current = { company: "", title: "", dates: "", location: "", bullets: [], description: "" };
    }
    return current;
  };
  for (const raw of lines) {
    const line = collapse(raw);
    if (!line) continue;
    const header = parseExperienceHeader(line);
    if (header) {
      if (current && (current.company || current.title || current.bullets.length)) entries.push(current);
      current = { location: "", bullets: [], description: "", ...header };
      continue;
    }
    if (/^\*\*[^*]+\*\*$/.test(line)) {
      const entry = ensure();
      if (!entry.title) entry.title = line.replace(/\*\*/g, "").trim();
      continue;
    }
    if (isDateRangeLine(line)) {
      const entry = ensure();
      if (!entry.dates) entry.dates = parseDateRange(line).dates;
      continue;
    }
    const bullet = parseBulletLine(raw);
    if (bullet) {
      ensure().bullets.push(bullet);
      continue;
    }
    if (current) {
      if (current.bullets.length) current.bullets[current.bullets.length - 1] += ` ${line}`;
      else current.description = collapse(`${current.description} ${line}`);
    }
  }
  if (current && (current.company || current.title || current.bullets.length)) entries.push(current);
  return entries
    .map((entry) => ({
      ...entry,
      company: entry.company || entry.title || "",
      title: entry.title || entry.company || "",
      bullets: entry.bullets.map(collapse).filter(Boolean),
      description: collapse(entry.description),
    }))
    .filter((entry) => entry.company || entry.bullets.length);
}

function parseProjects(lines) {
  const projects = [];
  let current = null;
  for (const raw of lines) {
    const line = collapse(raw);
    if (!line) continue;

    // cv.md: "- **MediGenius** — Python, FastAPI... Multi-agent healthcare assistant..."
    const bold = line.match(/^(?:[-*•]\s*)?\*\*([^*]+)\*\*\s*(?:[—–-]\s*)?(.+)$/);
    if (bold) {
      const name = bold[1].trim();
      const rest = bold[2].trim();
      if (name && rest) {
        const dot = rest.indexOf(". ");
        const stack = dot > 0 ? rest.slice(0, dot).trim() : rest;
        const description = dot > 0 ? rest.slice(dot + 2).trim() : "";
        current = { name, stack, bullets: description ? [stripTrailingPeriod(description)] : [], description: "" };
        projects.push(current);
        continue;
      }
    }

    // Personal Drive: "MediGenius | Tech Stack : Python, FastAPI..."
    if (/\|\s*(?:tech\s*stack|stack)/i.test(line)) {
      const [namePart, ...stackParts] = line.split("|");
      const name = namePart.replace(/^[-*•]\s*/, "").replace(/\*\*/g, "").trim();
      const stack = stackParts
        .join("|")
        .replace(/^\s*tech\s*stack\s*:\s*/i, "")
        .replace(/\|\s*link\s*$/i, "")
        .replace(/\s*\|\s*/g, ", ")
        .replace(/[,;\s]+$/, "")
        .trim();
      current = { name, stack, bullets: [], description: "" };
      projects.push(current);
      continue;
    }

    const bullet = parseBulletLine(raw);
    if (bullet && current) {
      current.bullets.push(bullet);
      continue;
    }
    if (current) {
      if (current.bullets.length) current.bullets[current.bullets.length - 1] += ` ${line}`;
      else current.description = collapse(`${current.description} ${line}`);
    }
  }
  return projects
    .map((project) => ({
      ...project,
      bullets: project.bullets.map(collapse).filter(Boolean),
      description: collapse(project.description),
    }))
    .filter((project) => project.name && (project.bullets.length || project.description));
}

function parseEducation(lines, fullText) {
  const text = collapse(lines.join(" "));
  const haystack = text || fullText;
  const degreeMatch = haystack.match(
    /\b(B\.?\s?Tech|Bachelor(?:'s)?(?: of [A-Za-z ]+)?|Master(?:'s)?(?: of [A-Za-z ]+)?|M\.?\s?Tech|B\.?\s?E\.?|M\.?\s?S\.?)\b[^.|•]{0,90}/i,
  );
  const schoolMatch = haystack.match(/\b([A-Z][\w&.'-]*(?:\s+[\w&.'-]+){0,5}\s+(?:University|Institute|College|School))\b/);
  let school = schoolMatch ? collapse(schoolMatch[1]) : "";
  if (schoolMatch) {
    // "Vellore Institute" + " of Technology"
    const after = haystack.slice(schoolMatch.index + schoolMatch[0].length);
    const extra = after.match(/^\s+of\s+([A-Z][\w.&'-]*(?:\s+[A-Z][\w.&'-]*){0,3})/);
    if (extra) school = `${school} of ${extra[1].trim()}`;
  }
  const cgpaMatch = haystack.match(/\bCGPA\s*[:—-]?\s*(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?/i);
  const dates = text ? parseEducationDates(text) : parseEducationDates(fullText);
  return {
    // "B.Tech in CSE -- CGPA: 8.97/10" is one line: the degree ends at the marker.
    degree: degreeMatch
      ? collapse(degreeMatch[0])
          .split(/\s*(?:--|—|–|\||,?\s*CGPA\b)/i)[0]
          .replace(/[.,;:\s]+$/, "")
          .trim()
      : "",
    school: school,
    cgpa: cgpaMatch ? `${cgpaMatch[1]}${cgpaMatch[2] ? `/${cgpaMatch[2]}` : ""}` : "",
    dates,
    graduating: dates.includes("–") ? dates.split("–").pop().trim() : dates,
  };
}

/**
 * Education dates are usually a bare-year range ("2022 – Aug 2026"), not the
 * month-to-month range jobs use.
 */
function parseEducationDates(value) {
  const text = collapse(value);
  if (DATE_RANGE.test(text)) return parseDateRange(text).dates;
  const range = text.match(
    /\b(20\d{2})\s*[–—\-�]\s*((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+20\d{2}|20\d{2}|present|current)\b/i,
  );
  if (range) {
    const end = /^(?:present|current)$/i.test(range[2]) ? "Present" : range[2];
    return `${range[1]} – ${end}`;
  }
  const single = text.match(DATE_SINGLE);
  return single ? single[1] : "";
}

function parseSkillsSection(lines) {
  const text = collapse(lines.join(" "));
  return {
    names: matchSkills(text).map((skill) => skill.name),
    lines: lines.map(collapse).filter(Boolean),
  };
}

function fallbackLines(text) {
  return text
    .split(/\n/)
    .map((line) => collapse(line.replace(/^[-*•●▪◦]\s+/, "")))
    .filter((line) => line.length >= 12 && line.length <= 700);
}

/**
 * Read one résumé into sections, entries and bullets.
 *
 * @param {string} markdown
 * @param {{key?: string, label?: string}} [meta]
 */
export function parseResume(markdown, meta = {}) {
  const text = normalizeText(markdown);
  const sections = text ? splitResumeSections(text) : {};
  const experiences = parseExperience(sections.experience ?? []);
  const projects = parseProjects(sections.projects ?? []);
  const education = parseEducation(sections.education ?? [], text);
  const skills = parseSkillsSection(sections.skills ?? []);
  const achievements = (sections.achievements ?? [])
    .map(parseBulletLine)
    .filter(Boolean);
  const summary = collapse((sections.summary ?? []).join(" "));
  const fallback = experiences.length || projects.length ? [] : fallbackLines(text);
  return {
    key: textOf(meta.key),
    label: textOf(meta.label),
    text,
    summary,
    experiences,
    projects,
    education,
    skills,
    achievements,
    fallbackLines: fallback,
  };
}

function cleanBullet(value) {
  return collapse(value)
    .replace(/^[-*•●▪◦–]\s+/, "")
    .replace(/\s+([,.;:])/g, "$1")
    .replace(/\.{2,}/g, ".")
    .replace(/[.;:,]+$/, "")
    .trim();
}

function looksLikeAction(value) {
  const first = textOf(value).split(/\s+/)[0]?.toLowerCase().replace(/[^a-z-]/g, "") ?? "";
  return ACTION_VERBS.has(first);
}

/** Convert one résumé into flat, citable evidence items. */
export function resumeEvidence(doc) {
  const out = [];
  const meta = { key: doc.key, label: doc.label };
  for (const experience of doc.experiences ?? []) {
    for (const bullet of experience.bullets ?? []) {
      const text = cleanBullet(bullet);
      if (text.length < 24) continue;
      out.push({
        kind: "experience",
        context: experience.company || experience.title || "my last role",
        title: experience.title,
        dates: experience.dates,
        stack: "",
        text,
        ...meta,
      });
    }
  }
  for (const project of doc.projects ?? []) {
    const bullets = project.bullets?.length ? project.bullets : project.description ? [project.description] : [];
    for (const bullet of bullets) {
      const text = cleanBullet(bullet);
      if (text.length < 24) continue;
      out.push({
        kind: "project",
        context: project.name,
        title: project.name,
        dates: "",
        stack: project.stack,
        text,
        ...meta,
      });
    }
  }
  for (const achievement of doc.achievements ?? []) {
    const text = cleanBullet(achievement);
    if (text.length < 24) continue;
    out.push({ kind: "achievement", context: "", title: "", dates: "", stack: "", text, ...meta });
  }
  for (const line of doc.fallbackLines ?? []) {
    const text = cleanBullet(line);
    if (text.length < 24) continue;
    out.push({ kind: "experience", context: "", title: "", dates: "", stack: "", text, ...meta });
  }
  return out;
}

function evidenceScore(item, signals, skillWeights, responsibilityTokens) {
  const haystack = item.text.toLowerCase();
  let score = 0;
  for (const [skill, weight] of skillWeights) {
    if (haystack.includes(skill)) score += weight;
  }
  for (const token of responsibilityTokens) {
    if (haystack.includes(token)) score += 1;
  }
  if (/\d+(?:[.,]\d+)?\s*%|\b\d+(?:\.\d+)?x\b|\bp95\b|\b\d[\d,]*\+\b|\bms\b|\b\d+(?:\.\d+)?s\b/i.test(item.text)) {
    score += 2.5;
  }
  if (looksLikeAction(item.text)) score += 1;
  if (item.kind === "experience") score += 0.6;
  if (item.text.length > 420) score -= 0.5;
  return score;
}

function evidenceSentence(item) {
  const text = cleanBullet(item?.text);
  if (!text) return "";
  if (looksLikeAction(text)) {
    if (item.kind === "project" && item.context) return `In ${item.context}, I ${lowerFirst(text)}.`;
    if (item.kind === "experience" && item.context) return `At ${item.context}, I ${lowerFirst(text)}.`;
    return `I ${lowerFirst(text)}.`;
  }
  if (item.kind === "project" && item.context) return `In ${item.context}, ${lowerFirst(text)}.`;
  if (item.kind === "experience" && item.context) return `At ${item.context}, ${lowerFirst(text)}.`;
  return `${text}.`;
}

export { evidenceSentence };

function shortSentence(value, max = 150) {
  const clean = collapse(value).replace(/[.;:,]+$/, "");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.55 ? cut.slice(0, space) : cut).replace(/[\s,;:.-]+$/, "")}…`;
}

/** One-line proof for a LinkedIn note: an action sentence, length-bounded. */
export function shortEvidence(item, max = 150) {
  return shortSentence(evidenceSentence(item), max);
}

/**
 * Rank every bullet from the selected résumés against the JD.
 *
 * @param {Array<ReturnType<typeof parseResume>>} docs
 * @param {ReturnType<typeof parseJobDescription>} signals
 * @param {{limit?: number}} [opts]
 */
export function selectEvidence(docs, signals, opts = {}) {
  const limit = Math.max(1, Math.min(6, opts.limit ?? 3));
  const all = [];
  for (const doc of docs ?? []) all.push(...resumeEvidence(doc));
  if (!all.length) {
    // A caller may pass raw resume text; be forgiving rather than empty-handed.
    for (const doc of docs ?? []) {
      for (const line of fallbackLines(doc?.text ?? "")) {
        all.push({ kind: "experience", context: "", title: "", dates: "", stack: "", text: cleanBullet(line), key: doc.key ?? "", label: doc.label ?? "" });
      }
    }
  }

  const skillWeights = skillWeightedTokens(signals?.skills);
  const responsibilityTokens = significantTokens(
    [...(signals?.responsibilities ?? []), ...(signals?.requirements ?? [])].join(" "),
    26,
  );
  const ranked = all
    .map((item) => ({ ...item, score: evidenceScore(item, signals ?? {}, skillWeights, responsibilityTokens) }))
    .sort((a, b) => b.score - a.score || a.text.length - b.text.length);

  const seen = new Set();
  const unique = [];
  for (const item of ranked) {
    const key = item.text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 90);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }

  const chosen = [];
  const take = (item) => {
    if (!item || chosen.length >= limit) return false;
    if (chosen.some((existing) => existing.text === item.text)) return false;
    chosen.push({ ...item, sentence: evidenceSentence(item) });
    return true;
  };

  // A balanced story beats four bullets from one employer: one work proof and
  // one project proof first, then the best remaining matches.
  if (limit >= 2) {
    take(unique.find((item) => item.kind === "experience"));
    take(unique.find((item) => item.kind === "project"));
  }
  for (const item of unique) {
    if (chosen.length >= limit) break;
    take(item);
  }

  return chosen.map((item) => ({
    ...item,
    short: shortSentence(item.sentence, 150),
    metric: item.text.match(/\d+(?:[.,]\d+)?\s*%|\b\d+(?:\.\d+)?x\b|\bp95\b|\b\d[\d,]*\+\b|\b\d+(?:\.\d+)?s\b/i)?.[0] ?? "",
  }));
}

/** Matched skills that also appear in the résumés — the honest overlap. */
export function overlapSkills(docs, signals) {
  const resumeText = (docs ?? []).map((doc) => `${doc.text ?? ""} ${(doc.skills?.names ?? []).join(" ")}`).join(" ");
  const resumeSkills = new Set(matchSkills(resumeText).map((skill) => skill.name));
  return (signals?.skillNames ?? []).filter((name) => resumeSkills.has(name));
}

/** Union of skills across the selected résumés, best-represented first. */
export function resumeSkillNames(docs) {
  const counts = new Map();
  for (const doc of docs ?? []) {
    const text = `${doc.text ?? ""} ${(doc.skills?.names ?? []).join(" ")}`;
    for (const skill of matchSkills(text)) counts.set(skill.name, (counts.get(skill.name) ?? 0) + skill.score);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([name]) => name);
}

/** The first education block found across the selected résumés. */
export function resumeEducation(docs) {
  for (const doc of docs ?? []) {
    if (doc.education?.degree || doc.education?.school) return doc.education;
  }
  return { degree: "", school: "", cgpa: "", dates: "", graduating: "" };
}
