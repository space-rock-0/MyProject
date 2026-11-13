/**
 * Shared shapes between the outreach routes and the UI. Types only — no rules
 * live here (the rules are in the .mjs modules the tests import).
 */

export type OutreachChannel = "email" | "linkedin" | "forms";

export type ResumeKey = "ai" | "fde" | "ml" | "sde";

export type RecipientType = "hr" | "recruiter" | "hiring-manager" | "employee" | "referral" | "other";

export type TemplateFile = { id: string; name: string; chars: number };

export type ResumeOption = { key: ResumeKey; label: string; md: boolean; pdf: string | null };

export type RecipientTypeOption = { id: RecipientType; label: string };

export type OutreachCatalog = {
  drive: string | null;
  templates: { email: TemplateFile[]; linkedin: TemplateFile[] };
  resumes: ResumeOption[];
  missing: string[];
  recipientTypes: RecipientTypeOption[];
  candidate: { name: string; email: string; links: string[] };
  gmail: { configured: boolean; source: "env" | "file" | "none"; missing: string[]; fileError: string | null };
  applications: Array<{ n: string; company: string; role: string; url: string; report: string }>;
};

export type OutreachQuestion = { id: string; question: string; why: string };

/** Where a draft came from: the candidate's own CLI, or the local composer. */
export type OutreachEngine = "ai" | "local";

export type OutreachResult =
  | {
      channel: "email";
      engine: OutreachEngine;
      subject: string;
      body: string;
      questions: OutreachQuestion[];
      warning?: string;
    }
  | {
      channel: "linkedin";
      engine: OutreachEngine;
      connectNote: string;
      message: string;
      limit: 200 | 300;
      questions: OutreachQuestion[];
      warning?: string;
    }
  | {
      channel: "forms";
      engine: OutreachEngine;
      answers: Array<{ question: string; answer: string }>;
      questions: OutreachQuestion[];
      warning?: string;
    };

export type OutreachRequest = {
  channel: OutreachChannel;
  engine?: OutreachEngine;
  cliId?: string;
  company?: string;
  role?: string;
  jd?: string;
  jobUrl?: string;
  report?: string;
  recipientName?: string;
  recipientEmail?: string;
  recipientProfile?: string;
  recipientType?: RecipientType;
  template?: string;
  resumes?: ResumeKey[];
  attachResume?: ResumeKey;
  formText?: string;
  questions?: string[];
  answers?: Record<string, string>;
  notes?: string;
  limit?: 200 | 300;
};
