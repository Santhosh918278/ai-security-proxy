/**
 * FIREWALL — pattern-based detection
 * -----------------------------------
 * These functions look at a piece of text (either the user's prompt,
 * or a chunk of the AI's streaming reply) and report back whether
 * anything suspicious was found, WITH an explanation (explainability).
 *
 * Each detector returns either `null` (nothing found) or an object:
 *   { type, severity, matchedText, reason }
 */

// --- PII detection ---
const CARD_NUMBER_REGEX = /\b(?:\d[ -]*?){13,16}\b/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const PHONE_REGEX = /\b(?:\+?\d{1,3}[- ]?)?\d{10}\b/;

function detectPII(text) {
  const cardMatch = text.match(CARD_NUMBER_REGEX);
  if (cardMatch) {
    return {
      type: "pii",
      severity: "high",
      matchedText: cardMatch[0],
      reason: "Detected what appears to be a credit/debit card number.",
    };
  }

  const emailMatch = text.match(EMAIL_REGEX);
  if (emailMatch) {
    return {
      type: "pii",
      severity: "medium",
      matchedText: emailMatch[0],
      reason: "Detected an email address.",
    };
  }

  const phoneMatch = text.match(PHONE_REGEX);
  if (phoneMatch) {
    return {
      type: "pii",
      severity: "medium",
      matchedText: phoneMatch[0],
      reason: "Detected what appears to be a phone number.",
    };
  }

  return null;
}

// --- Blocklist detection (words come from the 'policies' table in Postgres) ---
function detectBlocklist(text, blockedWords = []) {
  const lowerText = text.toLowerCase();
  for (const word of blockedWords) {
    if (lowerText.includes(word.toLowerCase())) {
      return {
        type: "blocklist",
        severity: "low",
        matchedText: word,
        reason: `Message contains a blocked word: "${word}".`,
      };
    }
  }
  return null;
}

// --- Prompt injection detection ---
const INJECTION_PATTERNS = [
  /ignore (all|any|the)? ?previous instructions/i,
  /disregard (all|any|the)? ?(prior|previous) (instructions|rules)/i,
  /you are now (in )?(dan|developer) mode/i,
  /reveal (your|the) system prompt/i,
  /act as if you have no (restrictions|rules|guidelines)/i,
  /pretend (you are|to be) an ai (with no|without) (filters|restrictions)/i,
  /bypass (your|all) (safety|security) (measures|filters)/i,
];

function detectInjection(text) {
  for (const pattern of INJECTION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return {
        type: "injection",
        severity: "high",
        matchedText: match[0],
        reason: "Message matches a known prompt-injection pattern.",
      };
    }
  }
  return null;
}

/**
 * Runs all pattern-based checks and returns the FIRST violation found,
 * or null if the text is clean. Order matters: PII and injection are
 * checked before the lower-severity blocklist.
 */
function firewallCheck(text, blockedWords = []) {
  return (
    detectPII(text) ||
    detectInjection(text) ||
    detectBlocklist(text, blockedWords) ||
    null
  );
}

module.exports = { detectPII, detectBlocklist, detectInjection, firewallCheck };
