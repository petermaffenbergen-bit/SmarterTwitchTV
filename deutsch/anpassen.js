// Passt den Code des Entwicklers für den eigenen Fork an:
//  - Oberfläche, Bilder und Versionsdatei kommen von der eigenen GitHub-Pages-Seite
//  - Update-Link der Oberfläche zeigt auf die eigenen Releases
//  - Debug-Protokolle (offener Port 8977 im Heimnetz) standardmäßig aus
//
//   node anpassen.js <Pfad zum SmarterTwitchTV-Ordner> <besitzer/repo>
'use strict';
const fs = require('fs');
const path = require('path');

const root = process.argv[2];
const repo = process.argv[3];
if (!root || !/^[^/]+\/[^/]+$/.test(repo || '')) throw new Error('Aufruf: node anpassen.js <ordner> <besitzer/repo>');
const [owner, name] = repo.split('/');
const OLD_PAGES = 'https://yofardev.github.io/SmarterTwitchTV/';
const NEW_PAGES = 'https://' + owner.toLowerCase() + '.github.io/' + name + '/';

function walk(dir, exts, out) {
    for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (!['node_modules', 'build', '.git', 'thirdparty'].includes(e.name)) walk(p, exts, out);
        } else if (exts.includes(path.extname(e.name))) out.push(p);
    }
    return out;
}

// 1. Eigene Pages-Adresse statt der des Entwicklers (Web-Teil und App-Teil)
let changed = 0;
for (const f of walk(path.join(root, 'app'), ['.js', '.html'], []).concat(walk(path.join(root, 'apk/app/src/main'), ['.java'], []))) {
    const src = fs.readFileSync(f, 'utf8');
    if (src.includes(OLD_PAGES)) {
        fs.writeFileSync(f, src.split(OLD_PAGES).join(NEW_PAGES));
        changed++;
    }
}
const phoneCfg = path.join(root, 'app/general/PhoneChatConfig.js');
if (fs.existsSync(phoneCfg)) {
    const p = fs.readFileSync(phoneCfg, 'utf8');
    fs.writeFileSync(phoneCfg, p.split("'https://yofardev.github.io'").join("'https://" + owner.toLowerCase() + ".github.io'"));
}
const constants = fs.readFileSync(path.join(root, 'apk/app/src/main/java/com/fgl27/twitch/Constants.java'), 'utf8');
if (!constants.includes(NEW_PAGES + 'release/index.html')) throw new Error('Seitenadresse in Constants.java nicht ersetzt');
console.log('Pages-Adresse ersetzt in ' + changed + ' Dateien -> ' + NEW_PAGES);

// 2. Update-Link der Oberfläche auf die eigenen Releases
const versionFile = path.join(root, 'app/general/version.js');
let version = fs.readFileSync(versionFile, 'utf8');
const apkUrl = /ApkUrl: '[^']*'/;
if (!apkUrl.test(version)) throw new Error('ApkUrl in version.js nicht gefunden');
version = version.replace(apkUrl, "ApkUrl: 'https://github.com/" + repo + "/releases/latest/download/Twitch.apk'");
fs.writeFileSync(versionFile, version);

// 3. Debug-Protokolle standardmäßig aus
const settingsFile = path.join(root, 'app/specific/Settings.js');
let settings = fs.readFileSync(settingsFile, 'utf8');
const debugDefault = /(debug_logs: \{\s*values: \['no', 'yes'\],\s*defaultValue: )2/;
if (debugDefault.test(settings)) {
    settings = settings.replace(debugDefault, '$11');
    fs.writeFileSync(settingsFile, settings);
    console.log('Debug-Protokolle standardmäßig aus');
} else {
    console.log('Hinweis: Standardwert der Debug-Protokolle nicht gefunden, unverändert');
}
const activity = path.join(root, 'apk/app/src/main/java/com/fgl27/twitch/PlayerActivity.java');
let act = fs.readFileSync(activity, 'utf8');
if (act.includes('getBoolean(Constants.PREF_DEBUG_LOGS, true)')) {
    fs.writeFileSync(activity, act.replace('getBoolean(Constants.PREF_DEBUG_LOGS, true)', 'getBoolean(Constants.PREF_DEBUG_LOGS, false)'));
}
