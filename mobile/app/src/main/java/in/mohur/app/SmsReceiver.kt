package `in`.mohur.app

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import kotlin.concurrent.thread

/** Woken by Android for each SMS, even when the app is closed. */
class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(ctx: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val parts = Telephony.Sms.Intents.getMessagesFromIntent(intent)?.filterNotNull().orEmpty()
        val now = System.currentTimeMillis()
        val store = Store.get(ctx)
        // A long message arrives in pieces, all in one broadcast.
        val queued = parts.groupBy { it.originatingAddress.orEmpty() }.map { (sender, p) ->
            store.offer(sender, p.joinToString("") { it.messageBody.orEmpty() }, p.first().timestampMillis, now)
        }.any { it }
        if (!queued) return

        // Queued on disk first, then a retry job as a safety net, then the fast path.
        SyncJob.scheduleNow(ctx)
        val done = goAsync()
        thread(name = "mohur-sms") {
            try {
                Sync.flush(ctx)
            } catch (e: Unpaired) {
                Sync.forget(ctx)
            } catch (e: Exception) {
                store.lastError = Sync.explain(e)
            } finally {
                done?.finish()
            }
        }
    }
}
