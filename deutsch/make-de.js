// Erzeugt app/languages/de_DE.js aus der aktuellen englischen Sprachdatei
// und der Übersetzungstabelle de.json, und trägt Deutsch in die App ein.
//
//   node make-de.js <Pfad zum SmarterTwitchTV-Ordner> <Pfad zu de.json>
//   node make-de.js --list <en_US.js>     (listet alle Texte, für die Übersetzung)
//
// Texte, die in de.json fehlen (z. B. neue Texte des Entwicklers), bleiben englisch.
'use strict';
const fs = require('fs');
const path = require('path');

// Zerlegt JavaScript-Quelltext in Code, Kommentare und Text-Literale.
function tokenize(src) {
    const out = [];
    let i = 0,
        start = 0;
    const flush = (end) => {
        if (end > start) out.push({type: 'code', text: src.slice(start, end)});
    };
    while (i < src.length) {
        const c = src[i],
            n = src[i + 1];
        if (c === '/' && n === '/') {
            const e = src.indexOf('\n', i);
            i = e === -1 ? src.length : e;
            continue;
        }
        if (c === '/' && n === '*') {
            const e = src.indexOf('*/', i + 2);
            i = e === -1 ? src.length : e + 2;
            continue;
        }
        if (c === "'" || c === '"') {
            flush(i);
            let j = i + 1;
            while (j < src.length && src[j] !== c) {
                if (src[j] === '\\') j++;
                if (src[j] === '\n') throw new Error('Zeilenumbruch in Text bei ' + j);
                j++;
            }
            out.push({type: 'str', quote: c, raw: src.slice(i, j + 1)});
            i = j + 1;
            start = i;
            continue;
        }
        if (c === '`') throw new Error('Template-Literal nicht unterstützt');
        i++;
    }
    flush(src.length);
    return out;
}

function decode(raw) {
    // Literal mit ' oder " -> echter Text
    return raw.slice(1, -1).replace(/\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|.)/g, (m, e) => {
        if (e[0] === 'u' && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16));
        if (e[0] === 'x' && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16));
        return {n: '\n', t: '\t', r: '\r'}[e] || e;
    });
}

function encode(text, quote) {
    return quote + text.replace(/\\/g, '\\\\').replace(new RegExp(quote, 'g'), '\\' + quote).replace(/\n/g, '\\n') + quote;
}

function list(enFile) {
    const seen = new Set();
    for (const t of tokenize(fs.readFileSync(enFile, 'utf8'))) {
        if (t.type !== 'str') continue;
        const s = decode(t.raw);
        if (!seen.has(s)) {
            seen.add(s);
            console.log(JSON.stringify(s));
        }
    }
}

function mustReplace(file, from, to) {
    const src = fs.readFileSync(file, 'utf8');
    if (src.includes(to)) return; // schon eingetragen
    if (!src.includes(from)) throw new Error('Stelle nicht gefunden in ' + file + ': ' + from);
    fs.writeFileSync(file, src.replace(from, to));
}

function build(root, dictFile) {
    const dict = JSON.parse(fs.readFileSync(dictFile, 'utf8'));
    const enFile = path.join(root, 'app/languages/en_US.js');
    let used = 0,
        missing = 0;
    let out = tokenize(fs.readFileSync(enFile, 'utf8'))
        .map((t) => {
            if (t.type === 'code') return t.text;
            const s = decode(t.raw);
            if (Object.prototype.hasOwnProperty.call(dict, s) && dict[s] !== s) {
                used++;
                return encode(dict[s], t.quote);
            }
            if (/[a-z]{3}/i.test(s)) missing++;
            return t.raw;
        })
        .join('');

    // Kommentare wurden beim Zerlegen entfernt; Funktionsname und Datumsformat anpassen.
    if (!out.includes('function en_USLang()')) throw new Error('en_USLang nicht gefunden');
    out = out.replace('function en_USLang()', 'function de_DELang()');
    out = out.replace(/Main_IsDayFirst = false;/, 'Main_IsDayFirst = true;');
    out =
        '/*\n * Deutsch (de_DE), automatisch erzeugt aus en_US.js und de.json.\n' +
        ' * Teil von SmartTwitchTV <https://github.com/fgl27/SmartTwitchTV>, GNU General Public License v3.\n */\n' +
        out;
    fs.writeFileSync(path.join(root, 'app/languages/de_DE.js'), out);

    // Deutsch in der App eintragen
    const settings = path.join(root, 'app/specific/Settings.js');
    // Hinten anhängen, damit sich die gespeicherte Auswahl anderer Sprachen nicht verschiebt
    mustReplace(settings, "'Українська - Ukrainian [UK-UA]'\n", "'Українська - Ukrainian [UK-UA]',\n            'Deutsch [DE]'\n");
    mustReplace(settings, "'tr_TR', 'uk_UA']", "'tr_TR', 'uk_UA', 'de_DE']");
    mustReplace(
        settings,
        "if (Main_A_includes_B(app_lang, 'pt_')) pt_BRLang();",
        "if (Main_A_includes_B(app_lang, 'de_')) de_DELang();\n    else if (Main_A_includes_B(app_lang, 'pt_')) pt_BRLang();"
    );
    const index = path.join(root, 'app/index.html');
    mustReplace(
        index,
        '<script src="languages/en_US.js" defer></script>',
        '<script src="languages/en_US.js" defer></script>\n        <script src="languages/de_DE.js" defer></script>'
    );

    console.log('Deutsch: ' + used + ' Texte übersetzt, ' + missing + ' bleiben englisch.');
}

if (process.argv[2] === '--list') list(process.argv[3]);
else build(process.argv[2], process.argv[3]);
