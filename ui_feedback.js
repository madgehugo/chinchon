/* =========================================================
   ui_feedback.js: the feedback sheet (a bug report or an idea for the developer)
   ---------------------------------------------------------
   Opened from Settings and from Help. The report goes through the online game
   server (sendFeedback in net.js; the server passes it on, see server/feedback.js),
   so the buttons are hidden when there is no server. A bug report also carries a
   few details (feedbackDetails below), which the sheet shows before sending.
   Loads after ui_online.js; render() in ui.js calls renderFeedback() from here.

   Whether the sheet is open is kept here, not in `state` (like the row of reaction
   emoji in ui_online.js): it has nothing to do with the game, and an online game's
   views from the server must never close it.
   ========================================================= */

"use strict";

const FEEDBACK_MAX = 1000;       // characters in a report (MAX_TEXT in server/feedback.js; the textarea's maxlength)
let feedbackOpen = false;        // is the feedback sheet open?
let feedbackCleared = false;     // has the form been emptied for the report just sent?

function setFeedbackOpen(open) {
  feedbackOpen = open;
  if (open) {
    state.showSettings = state.showHelp = false;       // it opens in place of the panel it came from
    // A finished report is forgotten (the sheet starts fresh); one on its way stays
    if (online.feedback.status !== "sending") online.feedback = { status: "idle", error: null, waiting: null };
    // Wake a sleeping server while the player types (net.js closes this connection again)
    if (!online.socket && !online.code) { warmUpServer(); online.feedbackSocket = online.socket; }
  } else {
    closeFeedbackSocket();
  }
  render();
}

// What a bug report says about the game and the device: no cards and no names. The fields
// are the ones server/feedback.js accepts (DETAIL_FIELDS). NATIVE_APP is from start.js,
// which loads later but has run by the time anybody opens the sheet.
function feedbackDetails() {
  return {
    userAgent: navigator.userAgent,                    // the browser, its version and the system
    screen: `${window.innerWidth}x${window.innerHeight}`,
    app: NATIVE_APP ? "store" : matchMedia("(display-mode: standalone)").matches ? "installed" : "browser",
    lang: currentLang,
    online: online.playing,
    players: state.numPlayers,
    deck: DECK_SIZE,
    cpuMode: state.cpuMode,
    reshuffles: state.maxReshuffles,
    reentries: state.maxReentries,
    rounds: state.roundLimit,
    layoff: state.layoffMode,
    round: state.deals,
    turn: state.turns,
    phase: state.phase,
  };
}

// Redraw the sheet (and show or hide the buttons that open it). The typed text and the
// dropdown live in the form itself; this only shows what follows from them.
function renderFeedback() {
  const available = Boolean(serverUrl());
  document.getElementById("feedback-open").hidden = !available;
  document.getElementById("help-feedback").hidden = !available;
  document.getElementById("feedback-sheet").hidden = !feedbackOpen;
  const fb = online.feedback;
  // Once a report has gone, the form empties, once (if it failed, the text stays, to try
  // again). Done even with the sheet closed: the answer may come after it was closed.
  if (fb.status === "sent" && !feedbackCleared) {
    document.getElementById("feedback-text").value = "";
    document.getElementById("feedback-contact").value = "";
  }
  feedbackCleared = fb.status === "sent";
  if (!feedbackOpen) return;

  const bug = document.getElementById("feedback-kind").value === "bug";
  const text = document.getElementById("feedback-text").value;
  document.getElementById("feedback-details-box").hidden = !bug;
  // The details as they will be sent: field names and values, as the developer reads them
  if (bug) {
    document.getElementById("feedback-details").textContent =
      Object.entries(feedbackDetails()).map(([field, value]) => `${field}: ${value}`).join("\n");
  }
  document.getElementById("feedback-count").textContent = t("fb.count", { n: text.length, max: FEEDBACK_MAX });
  document.getElementById("feedback-send").disabled = fb.status === "sending" || !text.trim();

  const status = document.getElementById("feedback-status");
  status.textContent = fb.status === "sent" ? t("fb.thanks")
    : fb.status === "sending" ? t(online.waking ? "online.waking" : "fb.sending") : "";
  status.hidden = !status.textContent;
  const error = document.getElementById("feedback-error");
  error.hidden = fb.status !== "failed";
  error.textContent = fb.status === "failed" ? t(fb.error || "feedback.err.failed") : "";
}

document.getElementById("feedback-open").addEventListener("click", () => setFeedbackOpen(true));
document.getElementById("help-feedback").addEventListener("click", () => setFeedbackOpen(true));
document.getElementById("feedback-close").addEventListener("click", () => setFeedbackOpen(false));
document.getElementById("feedback-sheet").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) setFeedbackOpen(false);   // a click on the dark background
});

// Typing: only the sheet needs redrawing (not the whole table on every key). Typing again
// after a report was sent, or failed, starts a new one.
function feedbackEdited() {
  if (online.feedback.status === "sent" || online.feedback.status === "failed") {
    online.feedback = { status: "idle", error: null, waiting: null };
  }
  renderFeedback();
}
document.getElementById("feedback-text").addEventListener("input", feedbackEdited);
document.getElementById("feedback-contact").addEventListener("input", feedbackEdited);
document.getElementById("feedback-kind").addEventListener("change", feedbackEdited);

document.getElementById("feedback-send").addEventListener("click", () => {
  const kind = document.getElementById("feedback-kind").value;
  const textBox = document.getElementById("feedback-text");
  if (!textBox.value.trim()) return;
  sendFeedback({                                       // (net.js)
    kind,
    text: textBox.value,
    contact: document.getElementById("feedback-contact").value,
    details: kind === "bug" ? feedbackDetails() : {},
  });
});
