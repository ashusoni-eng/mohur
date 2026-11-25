package `in`.mohur.app

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import kotlin.concurrent.thread

/** Retries when the network returns, and checks in every 15 minutes. Survives reboots. */
class SyncJob : JobService() {
    override fun onStartJob(params: JobParameters): Boolean {
        thread(name = "mohur-sync") {
            val ok = Sync.round(this)
            jobFinished(params, !ok && params.jobId == ONCE)
        }
        return true
    }

    override fun onStopJob(params: JobParameters) = true

    companion object {
        private const val PERIODIC = 1
        private const val ONCE = 2
        private fun js(ctx: Context) = ctx.getSystemService(JobScheduler::class.java)
        private fun job(ctx: Context, id: Int) = JobInfo.Builder(id, ComponentName(ctx, SyncJob::class.java)).setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)

        fun schedulePeriodic(ctx: Context) {
            if (js(ctx).allPendingJobs.any { it.id == PERIODIC }) return
            js(ctx).schedule(job(ctx, PERIODIC).setPeriodic(15 * 60_000L).setPersisted(true).build())
        }

        fun scheduleNow(ctx: Context) {
            val b = job(ctx, ONCE).setBackoffCriteria(10_000, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
            // Expedited jobs run even in Doze, but cannot be persisted.
            if (Build.VERSION.SDK_INT >= 31) b.setExpedited(true) else b.setPersisted(true)
            js(ctx).schedule(b.build())
        }

        fun cancel(ctx: Context) = js(ctx).cancelAll()
    }
}
