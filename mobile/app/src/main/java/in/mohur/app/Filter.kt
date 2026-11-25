package `in`.mohur.app

import java.security.MessageDigest

/**
 * Decides, on the phone, whether a message may leave it. Mirrors the server's own rules, and is
 * the stricter of the two: whatever the server asks for, secrets and personal numbers stay here.
 */
object Filter {
    private val HEADER = Regex("^(?:[A-Z]{2}-)?([A-Z][A-Z0-9]{2,10})(?:-([STPG]))?$")
    private val CREDIT = Regex("\\b(?:credit(?:ed)?|received|deposited)\\b", RegexOption.IGNORE_CASE)
    private val SECRET = Regex("\\b(?:otp|one[- ]time|password|passcode|pin|verification code|cvv)\\b", RegexOption.IGNORE_CASE)
    /** "Never share your OTP or PIN" is advice, not a secret. */
    private val ADVICE = Regex("\\b(?:never|do not|don'?t)\\s+(?:ever\\s+)?share[^.\\n]*", RegexOption.IGNORE_CASE)

    fun header(sender: String): String? = HEADER.matchEntire(sender.trim().uppercase())?.takeIf { it.groupValues[2] != "P" }?.groupValues?.get(1)

    fun shouldForward(sender: String, body: String, allowed: Set<String>): Boolean {
        val h = header(sender) ?: return false
        return h in allowed && CREDIT.containsMatchIn(body) && !SECRET.containsMatchIn(ADVICE.replace(body, " "))
    }

    fun id(sender: String, body: String, sentAt: Long) = sha256("$sender\n$sentAt\n$body")

    fun sha256(s: String): String =
        MessageDigest.getInstance("SHA-256").digest(s.toByteArray()).joinToString("") { "%02x".format(it) }
}
