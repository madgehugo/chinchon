"use strict";

/* =========================================================
   server/feedback.js: players' bug reports and ideas, passed on to the developer
   ---------------------------------------------------------
   A page sends { type: "feedback", kind, text, contact, details } (ui_feedback.js
   and sendFeedback in net.js). server.js checks the limits, cleanReport() below
   keeps only what a report may hold, and forward() passes it on:

     - with FEEDBACK_GITHUB_TOKEN and FEEDBACK_REPO set (on Render), as a new issue
       in that GitHub repository, through GitHub's web API. Use a PRIVATE repo
       (reports may hold an email address) and a "fine-grained" token that may only
       write issues in that one repo. GitHub then emails the repo's owner as usual.
     - otherwise (running on your own computer, the tests), printed to the console.

   The server keeps no copy. Everything in a report is typed or sent by a page,
   so it is never trusted: it is checked here, and in the issue it sits inside
   code blocks, where GitHub shows it as plain text (no links, no @mentions).
   ========================================================= */

const KINDS = ["bug", "idea", "other"];   // what a report is about (the sheet's dropdown)
const MAX_TEXT = 1000;                    // characters in the message (the textarea's maxlength too)
const MAX_CONTACT = 100;                  // characters in the optional "how to reply" line
const MAX_DETAIL = 300;                   // characters in one detail (a browser's user agent is ~150)
// The details a bug report may carry (feedbackDetails in ui_feedback.js); anything else is dropped
const DETAIL_FIELDS = ["userAgent", "screen", "app", "lang", "online", "players", "deck", "cpuMode",
                       "reshuffles", "reentries", "rounds", "layoff", "round", "turn", "phase"];
const TITLE_LENGTH = 60;                  // characters of the message used as the issue's title
const GITHUB_WAIT_MS = 10 * 1000;         // give up on GitHub after this long (the page is told it failed)

// Text as a report may hold it: NFC (one form for accented letters), no control characters
// except new lines and tabs, trimmed. null if it is not text, or longer than `max` characters.
// ([^\P{Cc}\n\t] reads "not (a non-control character, a new line or a tab)", that is: a
// control character other than those two. Array.from counts characters, not the UTF-16
// halves an emoji is stored as.)
function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const clean = value.normalize("NFC").replace(/\r\n?/g, "\n").replace(/[^\P{Cc}\n\t]/gu, "").trim();
  return Array.from(clean).length <= max ? clean : null;
}

// The report as it will be passed on, or null if it is not a valid one
function cleanReport(m) {
  if (!KINDS.includes(m.kind)) return null;
  const text = cleanText(m.text, MAX_TEXT);
  if (!text) return null;
  const contact = m.contact === undefined || m.contact === null ? "" : cleanText(m.contact, MAX_CONTACT);
  if (contact === null) return null;
  // Details: only the known fields, each a short text (cut down), a number or true/false
  const details = {};
  if (m.details && typeof m.details === "object") {
    for (const field of DETAIL_FIELDS) {
      const value = m.details[field];
      if (typeof value === "string") details[field] = Array.from(cleanText(value, Infinity)).slice(0, MAX_DETAIL).join("");
      else if (typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) || value === null) details[field] = value;
    }
  }
  return { kind: m.kind, text, contact, details };
}

// A code block around `text` that nothing inside it can end: its fence of backticks is
// longer than any run of backticks in the text
function codeBlock(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map(run => run.length));
  const fence = "`".repeat(Math.max(3, longest + 1));
  return `${fence}\n${text}\n${fence}`;
}

// The issue for a report: { title, body } (Markdown, which is what GitHub shows issues in)
function issueFor(report) {
  const firstLine = report.text.replace(/\s+/g, " ");
  const title = `[${report.kind}] ${Array.from(firstLine).slice(0, TITLE_LENGTH).join("")}`;
  const parts = [`**Kind:** ${report.kind}`, "**Message:**", codeBlock(report.text)];
  if (report.contact) parts.push("**Reply to:**", codeBlock(report.contact));
  const details = Object.entries(report.details).map(([field, value]) => `${field}: ${value}`);
  if (details.length) parts.push("**Details:**", codeBlock(details.join("\n")));
  return { title, body: parts.join("\n\n") };
}

// Pass a (clean) report on. Returns a promise (a value that arrives later) that fails if it
// could not be delivered, so server.js can tell the page.
async function forward(report) {
  const token = process.env.FEEDBACK_GITHUB_TOKEN, repo = process.env.FEEDBACK_REPO;
  if (!token || !repo) {
    console.log("feedback:", JSON.stringify(report));
    return;
  }
  // fetch: Node's built-in way to make a web request (as in browsers). AbortSignal.timeout
  // gives up after GITHUB_WAIT_MS; `await` waits for the answer.
  const response = await fetch(`https://api.github.com/repos/${repo}/issues`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "chinchon-server",
    },
    body: JSON.stringify(issueFor(report)),
    signal: AbortSignal.timeout(GITHUB_WAIT_MS),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status}: ${await response.text()}`);
}

module.exports = { cleanReport, issueFor, forward, MAX_TEXT };
