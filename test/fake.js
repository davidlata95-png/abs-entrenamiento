// Simulación mínima de Apps Script para probar Codigo.gs en Node
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
function makeSheet(name) {
  const rows = [];
  const sh = {
    name, rows,
    getLastRow: () => rows.length,
    getLastColumn: () => Math.max(0, ...rows.map(r => r.length)),
    appendRow: r => rows.push(r.slice()),
    setFrozenRows: () => {},
    deleteRow: i => rows.splice(i - 1, 1),
    getRange: (a, c, nr, nc) => {
      if (typeof a === 'string') { const m = a.match(/([A-Z])(\d+)/); c = m[1].charCodeAt(0) - 64; a = +m[2]; nr = 1; nc = 1; }
      nr = nr || 1; nc = nc || 1;
      return {
        getValues: () => Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => ((rows[a - 1 + i] || [])[c - 1 + j]) ?? '')),
        getValue: () => ((rows[a - 1] || [])[c - 1]) ?? '',
        setValue: v => { while (rows.length < a) rows.push([]); rows[a - 1][c - 1] = v; },
        setValues: vals => vals.forEach((r, i) => { while (rows.length < a + i) rows.push([]); r.forEach((v, j) => rows[a - 1 + i][c - 1 + j] = v); }),
      };
    },
  };
  return sh;
}
function load() {
  const sheets = {};
  const ss = { getSheetByName: n => sheets[n] || null, insertSheet: n => (sheets[n] = makeSheet(n)) };
  ['Registro', 'Comentarios', 'App'].forEach(n => ss.insertSheet(n));
  const ctx = {
    console,
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: 'json' }, createTextOutput: t => ({ setMimeType() { return this; }, text: t }) },
    PropertiesService: (() => { const P = {}; const sp = { getProperty: k => P[k] ?? null, setProperty: (k, v) => { P[k] = v; } }; return { getScriptProperties: () => sp }; })(),
    Utilities: {
      DigestAlgorithm: { SHA_256: 1 }, Charset: { UTF_8: 1 },
      computeDigest: (_, s) => Array.from(crypto.createHash('sha256').update(s).digest()).map(b => b > 127 ? b - 256 : b),
    },
  };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/Codigo.gs', 'utf8') + '\n;this.doPost=doPost;this.doGet=doGet;', ctx);
  const post = body => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const get = params => JSON.parse(ctx.doGet({ parameter: params }).text);
  return { post, get, sheets };
}
module.exports = { load };
