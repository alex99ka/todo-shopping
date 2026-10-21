package com.alex99ka.todoshop

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.SpannableString
import android.text.style.ForegroundColorSpan
import android.text.style.StrikethroughSpan
import android.text.style.StyleSpan
import android.view.View
import android.widget.RemoteViews
import es.antonborri.home_widget.HomeWidgetBackgroundIntent
import es.antonborri.home_widget.HomeWidgetLaunchIntent
import es.antonborri.home_widget.HomeWidgetPlugin
import es.antonborri.home_widget.HomeWidgetProvider
import org.json.JSONArray
import org.json.JSONObject

// The home screen widget: one list at a time (‹ › flip through all of them,
// shopping and tasks), its open items (a tap crosses one off without opening
// the app) and + (the app opens on that list to add one item, then closes).
// The app writes "lists" (lib/lists/widget.dart) whenever it runs, and its
// background callback after every tap here, so the data stays fresh.

private const val ROWS = 10 // row0..row9 in widget_summary.xml
private const val ROW_DP = 52 // WidgetRow's height
private const val CHROME_DP = 100 // padding, the title bar and the footer
private const val TICK_MS = 500L // a crossed-off item shows its ✓ this long
private const val FLIP = "com.alex99ka.todoshop.widget.FLIP"
private const val CHECK = "com.alex99ka.todoshop.widget.CHECK"
private const val CURRENT = "widget_current"

class SummaryWidget : HomeWidgetProvider() {
    override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray, data: SharedPreferences) {
        for (id in ids) manager.updateAppWidget(id, render(context, data, rowsFor(manager, id)))
    }

    // Resized: as many rows as now fit.
    override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
        manager.updateAppWidget(id, render(context, HomeWidgetPlugin.getData(context), rowsFor(manager, id)))
    }

    override fun onReceive(context: Context, intent: Intent) {
        val data = HomeWidgetPlugin.getData(context)
        when (intent.action) {
            FLIP -> {
                val lists = lists(data)
                if (lists.length() > 0) {
                    val i = (index(data, lists) + intent.getIntExtra("step", 1) + lists.length()) % lists.length()
                    data.edit().putString(CURRENT, lists.getJSONObject(i).getString("id")).apply()
                }
                redraw(context, data)
                ask(context, "todoshopping://refresh")
            }
            CHECK -> {
                val list = intent.getStringExtra("list") ?: return
                val item = intent.getStringExtra("item") ?: return
                // The app's background code writes it to Firestore; the widget
                // shows a ✓ at once, and drops the row half a second later.
                ask(context, "todoshopping://check?list=${Uri.encode(list)}&item=${Uri.encode(item)}")
                redraw(context, data, ticked = item)
                val pending = goAsync()
                Handler(Looper.getMainLooper()).postDelayed({
                    try {
                        drop(data, list, item)
                        redraw(context, data)
                    } finally {
                        pending.finish()
                    }
                }, TICK_MS)
            }
            else -> super.onReceive(context, intent)
        }
    }

    private fun ask(context: Context, uri: String) =
        HomeWidgetBackgroundIntent.getBroadcast(context, Uri.parse(uri)).send()

    private fun drop(data: SharedPreferences, list: String, item: String) {
        val lists = lists(data)
        for (l in 0 until lists.length()) {
            val o = lists.getJSONObject(l)
            if (o.getString("id") != list) continue
            val items = o.optJSONArray("items") ?: JSONArray()
            val kept = JSONArray()
            for (k in 0 until items.length()) if (items.getJSONObject(k).getString("id") != item) kept.put(items.get(k))
            o.put("items", kept)
        }
        data.edit().putString("lists", JSONObject().put("lists", lists).toString()).apply()
    }

    private fun redraw(context: Context, data: SharedPreferences, ticked: String? = null) {
        val manager = AppWidgetManager.getInstance(context)
        val ids = manager.getAppWidgetIds(ComponentName(context, SummaryWidget::class.java))
        for (id in ids) manager.updateAppWidget(id, render(context, data, rowsFor(manager, id), ticked))
    }

    // Portrait height (launchers report it as the max); 4 rows when unknown.
    private fun rowsFor(manager: AppWidgetManager, id: Int): Int {
        val h = manager.getAppWidgetOptions(id).getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT)
        return if (h <= 0) 4 else ((h - CHROME_DP) / ROW_DP).coerceIn(1, ROWS)
    }

    private fun lists(data: SharedPreferences): JSONArray =
        runCatching { JSONObject(data.getString("lists", null) ?: "{}").optJSONArray("lists") }.getOrNull() ?: JSONArray()

    private fun index(data: SharedPreferences, lists: JSONArray): Int {
        val current = data.getString(CURRENT, null)
        for (i in 0 until lists.length()) if (lists.getJSONObject(i).getString("id") == current) return i
        return 0
    }

    private fun self(context: Context, action: String, code: Int, extras: Intent.() -> Unit): PendingIntent {
        val intent = Intent(context, SummaryWidget::class.java).setAction(action).apply(extras)
        return PendingIntent.getBroadcast(context, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    private fun open(context: Context, uri: String) =
        HomeWidgetLaunchIntent.getActivity(context, MainActivity::class.java, Uri.parse(uri))

    private fun render(context: Context, data: SharedPreferences, rows: Int, ticked: String? = null): RemoteViews {
        val views = RemoteViews(context.packageName, R.layout.widget_summary)
        val lists = lists(data)
        if (lists.length() == 0) {
            views.setTextViewText(R.id.title, "משימות וקניות")
            views.setTextViewText(R.id.footer, "פותחים את האפליקציה פעם אחת")
            views.setViewVisibility(R.id.footer, View.VISIBLE)
            for (r in 0 until ROWS) views.setViewVisibility(row(context, r), View.GONE)
            views.setOnClickPendingIntent(R.id.title, open(context, "todoshopping://open"))
            return views
        }
        val list = lists.getJSONObject(index(data, lists))
        val id = list.getString("id")
        val shopping = list.optBoolean("shopping")
        val items = list.optJSONArray("items") ?: JSONArray()
        views.setTextViewText(R.id.title, (if (shopping) "🧺 " else "☑ ") + list.optString("name"))
        views.setOnClickPendingIntent(R.id.title, open(context, "todoshopping://open?list=${Uri.encode(id)}"))
        views.setOnClickPendingIntent(R.id.add, open(context, "todoshopping://add?list=${Uri.encode(id)}"))
        views.setOnClickPendingIntent(R.id.prev, self(context, FLIP, 1) { putExtra("step", -1) })
        views.setOnClickPendingIntent(R.id.next, self(context, FLIP, 2) { putExtra("step", 1) })
        val multi = lists.length() > 1
        views.setViewVisibility(R.id.prev, if (multi) View.VISIBLE else View.INVISIBLE)
        views.setViewVisibility(R.id.next, if (multi) View.VISIBLE else View.INVISIBLE)
        for (r in 0 until ROWS) {
            val v = row(context, r)
            if (r < rows && r < items.length()) {
                val item = items.getJSONObject(r)
                val itemId = item.getString("id")
                val note = item.optString("note")
                val text = item.optString("name") + if (note.isNotEmpty()) "  ·  $note" else ""
                views.setTextViewText(v, if (itemId == ticked) tickedText(text) else "○  $text")
                views.setViewVisibility(v, View.VISIBLE)
                views.setOnClickPendingIntent(v, self(context, CHECK, 100 + r) {
                    putExtra("list", id)
                    putExtra("item", itemId)
                    setData(Uri.parse("todoshopping://check/$id/$itemId")) // a distinct intent per item
                })
            } else {
                views.setViewVisibility(v, View.GONE)
            }
        }
        val footer = when {
            items.length() > rows -> "ועוד ${items.length() - rows}"
            items.length() == 0 -> if (shopping) "הכול בסל" else "אין משימות פתוחות"
            else -> ""
        }
        views.setTextViewText(R.id.footer, footer)
        views.setViewVisibility(R.id.footer, if (footer.isEmpty()) View.GONE else View.VISIBLE)
        return views
    }

    // "✓  name" in brown, the name struck through and greyed.
    private fun tickedText(text: String): CharSequence {
        val s = SpannableString("✓  $text")
        s.setSpan(ForegroundColorSpan(0xFF8F6A48.toInt()), 0, 1, 0)
        s.setSpan(StyleSpan(Typeface.BOLD), 0, 1, 0)
        s.setSpan(StrikethroughSpan(), 3, s.length, 0)
        s.setSpan(ForegroundColorSpan(0xFF6E6157.toInt()), 3, s.length, 0)
        return s
    }

    private fun row(context: Context, r: Int) =
        context.resources.getIdentifier("row$r", "id", context.packageName)
}
