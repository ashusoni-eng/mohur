package `in`.mohur.app

import android.app.Application

class App : Application() {
    override fun onCreate() {
        super.onCreate()
        if (Store.get(this).pairing != null) SyncJob.schedulePeriodic(this)
    }
}
