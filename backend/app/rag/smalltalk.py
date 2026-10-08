"""
Conversational messages ("Thanks!", "Hi", "Got it") should not go through
document retrieval: there is nothing to retrieve, so the RAG prompt answers
"the provided policies don't cover this". This module recognises them early
and returns a short, friendly reply instead.

Deliberately conservative: a message only counts as small talk if it contains
nothing else. "Thanks, how many leave days do I get?" is NOT small talk and
still goes to the normal RAG pipeline.
"""

import re

THANKS_REPLY = "You're welcome! Let me know if you have any other questions about Helix policies."
GREETING_REPLY = "Hello! I can help you find answers in Helix Solutions policies, guidelines, and internal documentation. What would you like to know?"
GOODBYE_REPLY = "Goodbye! Come back any time you have a question about company policies."
ACK_REPLY = "Great! Let me know if there's anything else I can help with."
CAPABILITY_REPLY = (
    "I'm Helix Policy Copilot. I answer questions using Helix Solutions' policies, "
    "guidelines, and internal documentation, and I show the sources I used. "
    "Try asking about leave, expenses, security, or engineering standards."
)

_IDENTITY = re.compile(
    r"(who are you|what are you|what can you do|what do you do|how can you help( me)?|help|help me)"
)
_GREETING = re.compile(
    r"(hi|hello|hey|hiya|howdy|yo|greetings|good (morning|afternoon|evening))( there| team| copilot)?"
)
_ACK = re.compile(
    r"(ok|okay|k|kk|alright|all right|cool|great|perfect|nice|awesome|sounds good|got it|"
    r"understood|i see|makes sense|noted|fine|good)( thanks| thank you)?"
)
_THANKS = re.compile(r"\b(thanks|thank you|thank u|thankyou|thx|ty|cheers|much appreciated|appreciate (it|that|the help))\b")
_GOODBYE = re.compile(r"\b(bye|goodbye|see you|see ya|take care|talk later|ttyl)\b")

# Words that signal a real question: never treat the message as small talk.
_QUESTION_WORDS = {
    "what", "when", "where", "who", "whom", "whose", "why", "which", "how",
    "can", "could", "should", "would", "does", "do", "did", "is", "are", "will",
}

# Words allowed alongside "thanks"/"bye" without turning it into a real request.
_FILLER = {
    "a", "an", "the", "so", "very", "much", "lot", "lots", "for", "your", "you", "you're", "that", "it",
    "this", "these", "those", "my", "me", "i", "i'm", "i'll", "got", "get", "have", "had", "help", "helping",
    "info", "information", "answer", "answers", "reply", "response", "great", "good", "nice", "awesome",
    "perfect", "again", "really", "truly", "all", "everything", "guys", "team", "copilot", "helix", "please",
    "now", "was", "is", "been", "be", "clear", "useful", "helpful", "cool", "ok", "okay", "appreciated",
    "appreciate", "well", "done", "job", "fine", "alright", "sure", "yes", "yep", "yeah", "that's", "enough",
    "will", "check", "later", "day", "have", "to", "with", "and", "just", "what", "needed", "exactly",
}


def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^a-z\s']", " ", text)  # drop punctuation, digits, emoji
    return re.sub(r"\s+", " ", text).strip()


def _leftover_words(norm: str, phrase: re.Pattern) -> list[str]:
    stripped = phrase.sub(" ", norm)
    return [w for w in stripped.split() if w not in _FILLER]


def small_talk_reply(text: str) -> str | None:
    """Return a canned reply for conversational messages, or None for real questions."""
    raw = (text or "").strip()
    if not raw or len(raw) > 120:
        return None

    norm = _normalize(raw)
    if not norm:
        return None

    if _IDENTITY.fullmatch(norm):
        return CAPABILITY_REPLY

    if "?" in raw:
        return None
    words = norm.split()
    if any(w in _QUESTION_WORDS for w in words):
        return None

    if _GREETING.fullmatch(norm):
        return GREETING_REPLY
    if _ACK.fullmatch(norm):
        return ACK_REPLY
    if _GOODBYE.search(norm) and len(_leftover_words(norm, _GOODBYE)) <= 1:
        return GOODBYE_REPLY
    if _THANKS.search(norm) and len(_leftover_words(norm, _THANKS)) <= 1:
        return THANKS_REPLY

    return None