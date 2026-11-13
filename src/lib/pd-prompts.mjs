import { PROFILE } from "./pd-config.mjs";

const NAME = PROFILE.name;

export const SYSTEM = `You ghostwrite job-search messages for ${NAME}, a recent Computer Science graduate from VIT, India. Write in first person as ${NAME}.

Hard rules:
1. Use only facts that appear in <resume>. Never invent employers, projects, numbers, tools, dates or links. If a needed fact is missing, leave it out.
2. Use <context> (job description, company notes, person info) to decide which resume facts to feature. Never invent company details. If context is thin, keep company-specific lines general and honest.
3. Follow the <template> structure, order and tone. Replace every [placeholder] with real content or drop the clause. No leftover brackets.
4. Plain text only. No markdown, no bold, no emojis.
5. Sound like a polite, direct human. No filler openers ("I hope this finds you well") and no words like passionate, leverage, synergy, delve.
6. Keep it short. Feature at most two resume facts, and quote a number only if it matters for the role.`;

const clip = (s, n) => {
  s = (s || "").trim();
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + " ...";
};

export function ctxBlock(d, fields) {
  const limits = { jd: 5000, company_info: 1200, person_info: 1500 };
  const rows = [];
  for (const [key, label] of fields) {
    const v = clip(d[key], limits[key] || 300);
    if (v) rows.push(`${label}: ${v}`);
  }
  return rows.join("\n") || "(none given)";
}

export const emailPrompt = (resume, template, ctx) => `<resume>
${resume}
</resume>

<context>
${ctx}
</context>

<template>
${template}
</template>

Task: write the email. Do NOT write "Best regards" or a signature; they are added automatically. The resume PDF is attached, so refer to it as attached.
Output exactly this format and nothing else:
SUBJECT: <subject line>
BODY:
<email body, ending with the thank-you line>`;

export const linkedinPrompt = (resume, tpl, ctx, limit) => `<resume>
${resume}
</resume>

<context>
${ctx}
</context>

<template>
Stage: ${tpl.label} (${tpl.stage})
${tpl.body}
</template>

Guidance for this stage: ${tpl.guidance}

Task: write the final LinkedIn message. Maximum ${limit} characters including spaces. Output only the message, ready to copy and send.`;

export const formPrompt = (resume, ctx, questions, limit) => `<resume>
${resume}
</resume>

<context>
${ctx}
</context>

<questions>
${questions}
</questions>

Task: answer every question as ${NAME} filling a job application form.
- At most ${limit} words per answer. Answer directly in the first sentence.
- For questions about experience, skills, strengths or projects, back the answer with one or two concrete facts from the resume. Rephrase, never paste bullets.
- Yes/No questions: start with Yes or No, then one short sentence.
- For logistics the resume does not state (salary or CTC expectations, notice period, start date, relocation, work authorization, references, personal details), output exactly: [FILL: needs your input]
- "Why this company/role" questions: use <context> if present, otherwise answer about the role type without inventing company facts.
Output format, nothing else:
###1
<answer>
###2
<answer>`;

export const coverPrompt = (resume, tplBody, ctx) => `<resume>
${resume}
</resume>

<context>
${ctx}
</context>

<template>
${tplBody}
</template>

Task: write the body paragraphs of the cover letter, following the template (4 short paragraphs, about 180 to 230 words total).
Output only the paragraphs separated by blank lines. No greeting, no closing, no signature.`;

export const signature = () =>
  `Best regards,\n${PROFILE.name}\n${PROFILE.location}\n${PROFILE.phone}\n${PROFILE.email}\nLinkedIn: ${PROFILE.linkedin}\nGitHub: ${PROFILE.github}`;
