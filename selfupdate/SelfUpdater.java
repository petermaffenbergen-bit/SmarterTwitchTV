package com.fgl27.twitch;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Checks this build's own GitHub repository for a newer release when the app starts,
 * and offers to download and install it. Added by the private build workflow.
 *
 * The repository and the tag of this build are written to assets at build time:
 *   selfupdate_repo.txt  e.g. "owner/SmarterTwitchTV"
 *   selfupdate_tag.txt   e.g. "2026.11.03.2015-820f5f1"
 */
final class SelfUpdater {

    private static final String TAG = "STTV_SelfUpdater";
    private static boolean checked = false;

    private SelfUpdater() {}

    static void checkLater(final Activity activity) {
        if (checked) return;
        checked = true;
        // Give the app time to load before asking anything.
        new Handler(Looper.getMainLooper()).postDelayed(() -> new Thread(() -> check(activity)).start(), 10000);
    }

    private static void check(final Activity activity) {
        try {
            final String repo = readAsset(activity, "selfupdate_repo.txt");
            final String myTag = readAsset(activity, "selfupdate_tag.txt");
            if (repo == null || myTag == null) return;

            HttpURLConnection c = (HttpURLConnection) new URL("https://api.github.com/repos/" + repo + "/releases/latest").openConnection();
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            c.setRequestProperty("Accept", "application/vnd.github+json");
            c.setRequestProperty("User-Agent", "Twitch-TV-SelfUpdater");
            if (c.getResponseCode() != 200) {
                c.disconnect();
                return;
            }
            String body;
            try (InputStream in = c.getInputStream()) {
                body = readAll(in);
            } finally {
                c.disconnect();
            }

            JSONObject release = new JSONObject(body);
            final String latestTag = release.optString("tag_name", "");
            if (latestTag.isEmpty() || latestTag.equals(myTag)) {
                Log.i(TAG, "up to date: " + myTag);
                return;
            }
            // Tags start with a date (YYYY.MM.DD.HHMM), so a plain comparison tells newer from older.
            if (latestTag.compareTo(myTag) < 0) return;

            String apkUrl = null;
            JSONArray assets = release.optJSONArray("assets");
            if (assets != null) {
                for (int i = 0; i < assets.length(); i++) {
                    JSONObject a = assets.getJSONObject(i);
                    if (a.optString("name", "").endsWith(".apk")) {
                        apkUrl = a.optString("browser_download_url", null);
                        break;
                    }
                }
            }
            if (apkUrl == null) return;

            final String url = apkUrl;
            activity.runOnUiThread(() -> ask(activity, latestTag, url));
        } catch (Throwable e) {
            Log.w(TAG, "update check failed", e);
        }
    }

    private static void ask(final Activity activity, String latestTag, final String url) {
        if (activity.isFinishing()) return;
        new AlertDialog.Builder(activity, AlertDialog.THEME_DEVICE_DEFAULT_DARK)
            .setTitle("Update verfügbar")
            .setMessage("Eine neue Version ist da (" + latestTag + ").\nJetzt herunterladen und installieren?")
            .setPositiveButton("Aktualisieren", (d, w) -> startUpdate(activity, url))
            .setNegativeButton("Später", null)
            .show();
    }

    private static void startUpdate(final Activity activity, final String url) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !activity.getPackageManager().canRequestPackageInstalls()) {
            Toast.makeText(activity, "Bitte erlaube der App, Apps zu installieren, und starte sie dann neu.", Toast.LENGTH_LONG).show();
            try {
                activity.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + activity.getPackageName())));
            } catch (Exception unsupported) {
                activity.startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS));
            }
            checked = false;
            return;
        }
        Toast.makeText(activity, "Update wird heruntergeladen…", Toast.LENGTH_LONG).show();
        new Thread(() -> {
            final String file = Tools.DownloadAPK(url, activity.getApplicationContext());
            activity.runOnUiThread(() -> {
                if (file == null || !Tools.installPackage(activity, file)) {
                    Toast.makeText(activity, "Update fehlgeschlagen. Beim nächsten Start erneut versuchen.", Toast.LENGTH_LONG).show();
                }
            });
        }).start();
    }

    private static String readAsset(Activity activity, String name) {
        try (InputStream in = activity.getAssets().open(name)) {
            String s = readAll(in).trim();
            return s.isEmpty() ? null : s;
        } catch (Exception e) {
            return null;
        }
    }

    private static String readAll(InputStream in) throws java.io.IOException {
        StringBuilder sb = new StringBuilder();
        BufferedReader r = new BufferedReader(new InputStreamReader(in, "UTF-8"));
        String line;
        while ((line = r.readLine()) != null) sb.append(line).append('\n');
        return sb.toString();
    }
}
