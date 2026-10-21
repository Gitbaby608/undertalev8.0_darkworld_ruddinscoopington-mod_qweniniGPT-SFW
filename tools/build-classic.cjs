// Build src/boot-classic.js: a single classic-script bundle of the whole modular
// game (src/*.js), so index.html works when opened via file:// where browsers block
// ES modules. Purely textual transform — no parser deps:
//   1. concatenate files in dependency order (matches ESM evaluation order)
//   2. wrap each module body in its own block { ... } so same-named locals across
//      modules (DPR, spr, ...) never collide in the shared outer scope
//   3. strip `import ... from '...';` lines and rewrite every IMPORTED identifier to
//      the owning module's renamed declaration `<sym>$<module>` (exported names are
//      always renamed; cross-module `let` rebinds like glF/spr then alias correctly)
//   4. drop `export` modifiers
//   5. hoist mask.js's composeMsk() above patterns.js's late banner baking so the
//      ATK* warning sprites never receive solid GL masks (they must stay transparent)
// Run: node tools/build-classic.cjs && node --check src/boot-classic.js
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['util.js', 'data.js', 'state.js', 'sprites.js', 'mask.js', 'particles.js',
  'npc.js', 'patterns.js', 'fx.js', 'audio.js', 'draw.js', 'glfx.js', 'game.js', 'main.js'];

// Read sources; keep raw text (for import parsing) and a body with imports stripped.
const raw = {}, mods = {};
for (const f of FILES) {
  const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
  raw[f] = src;
  mods[f] = src.split('\n').filter(l => !/^import\s[^\n]*?;\s*$/.test(l)).join('\n');
}

// Block-scoped modules can't share live bindings like ESM does. npc.js exports
// `let spr = () => {}` that draw.js rebinds via bindSpr(spr) to break an import
// cycle; in the bundle, draw.js's rebinding only touches its own imported alias
// and never reaches npc.js's local — NPCs would render nothing. Fix: rewrite
// npc.js's stub so it lazily delegates to draw.js's real blitter at CALL time
// (the reference is only evaluated inside function bodies → no TDZ hazard).
mods['npc.js'] = mods['npc.js'].replace('export let spr = () => {};',
  "export let spr = (id, cx, cy) => spr$draw(id, cx, cy);");

// mask.js bakes GL character masks at module-eval time from SPR/BSPR; patterns.js
// later bakes the seven ATK0..ATK6 banner sprites via txtWarn(). In the bundle,
// mask.js runs BEFORE those banners exist, so they'd get no mask entry at all —
// harmless for rendering (MSK lookups just miss), but composeMsk() must still be
// callable from patterns.js, which fixupMask() below guarantees by hoisting it.

// Exported top-level names per module (these get `<name>$<file>` declarations).
const exported = {}; // file -> Set(names)
const NAME = '[A-Za-z_$][\\w$]*';
for (const f of FILES) {
  const set = new Set();
  // `export const A = ..., B = ...;` — collect every declared name in the statement.
  for (const m of raw[f].matchAll(new RegExp('^export\\s+(?:async\\s+function|function|class|const|let|var)\\s+([^;{]*)', 'gm'))) {
    let decl = m[1];
    // For function/class forms, only the first identifier is the name; for var/let/const,
    // every top-level comma-separated declarator binds a name. NB: test `decl` itself —
    // m[0] includes the leading "export ", so testing it would misclassify
    // `export function mkSpr(...)` (its decl starts with "mkSpr(") as a var statement.
    if (/^(?:async\s+)?(?:function|class)/.test(decl)) {
      const fm = decl.match(new RegExp('^' + NAME));
      if (fm) set.add(fm[0]);
      continue;
    }
    // Split declarators on commas at depth 0 so `{...}` / `(...)` / `[...]` internals are ignored.
    let depth = 0, last = 0, parts = [];
    for (let i = 0; i < decl.length; i++) {
      const c = decl[i];
      if (c === '{' || c === '(' || c === '[') depth++;
      else if (c === '}' || c === ')' || c === ']') depth--;
      else if (c === ',' && depth === 0) { parts.push(decl.slice(last, i)); last = i + 1; }
    }
    parts.push(decl.slice(last));
    for (const p of parts) {
      const nm = p.trim().match(new RegExp('^' + NAME));
      if (nm) set.add(nm[0]);
    }
  }
  for (const m of raw[f].matchAll(/^export\s*\{([^}]*)\}/gm))
    for (const part of m[1].split(',')) {
      const t = part.trim().match(/^([A-Za-z_$][\w$]*)/);
      if (t) set.add(t[1]);
    }
  exported[f] = set;
}

// Imports per module: local binding name -> { sym (exported name), owner file }.
const imports = {};
for (const f of FILES) {
  const map = new Map();
  for (const m of raw[f].matchAll(/^import\s+(?:\{([^}]*)\}|([A-Za-z_$][\w$]*))(?:\s*,\s*\{([^}]*)\})?\s+from\s+'\.\/([\w.]+\.js)'/gm)) {
    const braces = (m[1] || '') + ',' + (m[3] || '');
    const owner = m[4];
    if (m[2]) map.set(m[2], { sym: m[2], owner });
    for (const part of braces.split(',')) {
      const t = part.trim();
      if (!t) continue;
      const am = t.match(/^([A-Za-z_$][\w$]*)(?:\s+as\s+([A-Za-z_$][\w$]*))?$/);
      if (!am) throw new Error('unparsed import in ' + f + ': ' + t);
      map.set(am[2] || am[1], { sym: am[1], owner });
    }
  }
  imports[f] = map;
}
// Sanity: imported symbols must be exported by their owner module.
for (const f of FILES)
  for (const [local, info] of imports[f])
    if (!exported[info.owner].has(info.sym))
      throw new Error(`${local} imported by ${f}: '${info.sym}' not exported by ${info.owner}`);

// Rewrite identifiers everywhere except inside string/template/comment spans.
function rewrite(code, selfFile) {
  let out = '';
  const n = code.length;
  const idRe = /[A-Za-z_$][\w$]*/y;
  let i = 0;
  while (i < n) {
    const c = code[i], c2 = code[i + 1];
    if (c === '/' && c2 === '/') { const e = code.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && c2 === '*') { const e = code.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < n) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === c) { j++; break; }
        if (c !== '`' && code[j] === '\n') { j++; break; } // tolerate unterminated strings
        j++;
      }
      out += code.slice(i, j); i = j; continue;
    }
    idRe.lastIndex = i;
    const m = idRe.exec(code);
    if (m) {
      const prev = code[i - 1];
      const end = m.index + m[0].length;
      if (prev === '.') { out += code.slice(i, end); i = end; continue; } // property access
      const name = m[0];
      // Skip the identifier that immediately follows a declaration keyword — it's the
      // binding being declared (e.g. `function mkSpr(...)`, `const spr = ...`), not a use.
      // Lookbehind is safe here: `\w\s` can never match a string/comment quote or slash,
      // so trailing whitespace means we really are right after the keyword + spaces.
      const before = code.slice(Math.max(0, i - 16), i);
      if (/(?:\b(?:async\s+)?function\s+$|\bclass\s+$|\b(?:const|let|var)\s+$)/.test(before)) {
        out += name; i = end; continue;
      }
      const imp = imports[selfFile].get(name);
      // An exported decl IN THIS FILE shadows the import locally (e.g. npc.js declares
      // `spr` AND exports it): keep the bare name so intra-module uses hit the local.
      if (imp && !(imp.owner === selfFile && exported[selfFile].has(imp.sym))) {
        out += imp.sym + '$' + imp.owner.slice(0, -3);
      } else {
        out += name;
      }
      i = end; continue;
    }
    out += c; i++;
  }
  return out;
}

// Rename exported declarations, drop export modifiers. Uses rewrite() itself so
// string/template/comment spans are never touched, and so EVERY declarator in a
// multi-declarator statement (`export const A = ..., B = ...;`) gets renamed —
// not just the first one.
function stripExports(code, fname) {
  const suf = '$' + fname.slice(0, -3);
  const ex = exported[fname];
  // Drop `export ` keywords so nothing is left to strip.
  // `const W = ..., $ = ...` — the regex above would capture "W = ..." with spaces and
  // never rename it. Match only the keyword here; rewrite() below renames every
  // declarator in the statement (its decl-name guard sees `const `/`, ` before names).
  code = code.replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '');
  code = code.replace(/^export\s*\{[^}]*\}\s*;?\s*$/gm, '');
  // Temporarily add self-import entries for this module's exported names. Skip any
  // name that a plain regex would capture but rewrite() can never rename (names with
  // spaces — e.g. a mis-split declarator list): fail loudly instead of emitting a
  // dangling `name $file` reference.
  const saved = imports[fname];
  imports[fname] = new Map([...saved]);
  for (const name of ex) {
    if (!new RegExp('^' + NAME + '$').test(name)) throw new Error(`bad export name in ${fname}: '${name}'`);
    // Owner = util.js-style filename WITHOUT the .js suffix, so rewrite() emits the
    // exact `<sym>$<mod>` declaration name (it strips `.slice(0,-3)` from owner).
    if (!imports[fname].has(name)) imports[fname].set(name, { sym: name, owner: fname.slice(0, -3) });
  }
  code = rewrite(code, fname);
  // Safety net: any exported name left as a bare top-level DECLARATION (rewrite's
  // decl guard skipped it) gets renamed here, with `=`/`,`-terminated lookahead so
  // ordinary uses like `W * BGR` are never touched.
  for (const name of ex) {
    code = code.replace(new RegExp('^(\\s*)(' + name.replace(/[$]/g, '\\$') + ')\\s*=(?=[^=])', 'gm'),
      '$1' + name + suf + ' =');
    code = code.replace(new RegExp('^(\\s*)(' + name.replace(/[$]/g, '\\$') + '),', 'gm'),
      '$1' + name + suf + ',');
  }
  imports[fname] = saved;
  return code;
}

// Hoist mask.js's composeMsk definition up next to MC creation so patterns.js can call
// it after baking translucent banners (they must not get solid character masks).
function fixupMask(code) {
  const defStart = code.indexOf('export function composeMsk');
  if (defStart < 0) throw new Error('composeMsk not found in mask.js');
  const defEnd = code.indexOf('\n}', defStart);
  if (defEnd < 0) throw new Error('composeMsk end not found');
  const def = code.slice(defStart, defEnd + 2);
  code = code.slice(0, defStart) + code.slice(defEnd + 2);
  const anchor = code.indexOf("MC.width = W; MC.height = H;");
  if (anchor < 0) throw new Error('MC anchor not found');
  const lineEnd = code.indexOf('\n', anchor);
  return code.slice(0, lineEnd + 1) + def + '\n' + code.slice(lineEnd + 1);
}
mods['mask.js'] = fixupMask(mods['mask.js']);

// patterns.js: purge stray mask blobs for late-baked translucent sprites, then rebuild MC.
mods['patterns.js'] = mods['patterns.js'].replace(
  "PATTERNS.forEach(p => txtWarn(p.warn, p.name));",
  "PATTERNS.forEach(p => txtWarn(p.warn, p.name));\n" +
  "// Banners/warnings are translucent overlays baked after mask.js ran: delete any\n" +
  "// stray mask blobs so they render crisp with no glowing box behind them.\n" +
  "PATTERNS.forEach(p => { delete MSK[p.warn]; });\n" +
  "['warn', 'warnFork', 'warnStar', 'txt0', 'txt1', 'txt2', 'bub', 'bg'].forEach(id => delete MSK[id]);\n" +
  "composeMsk();");

// Exported const/let/var DECLARATIONS that rewrite() cannot rename: its decl-guard
// only skips the name directly after `const|let|var`; subsequent comma-continuation
// declarators (`export const A = x, B = y;`) and arrow-function params (`export const
// f = (id, ...) => ...`) get rewritten as USES into `<name>$<mod>` instead. Patch the
// declaration sites so the renamed uses resolve. Runs on raw module text BEFORE
// stripExports (which strips the leading `export ` keyword via ^-anchored regexes, so
// indentation must be preserved).
{
  const sufOf = f => '$' + f.slice(0, -3);
  for (const f of FILES) {
    for (const name of exported[f]) {
      if (!new RegExp('^' + NAME + '$').test(name)) continue;
      const esc = name.replace(/[$]/g, '\\$');
      // multi-declarator continuation: `... , H = 460;` → `, H$util = 460;`
      mods[f] = mods[f].replace(new RegExp('^(\\s*(?:export\\s+)?(?:const|let|var)\\s+[\\w$]+[^=\\n]*=[^=][^;\\n]*,)\\s*(' + esc + ')\\s*=(?!=)', 'gm'),
        (mm, pre, nm) => pre + ' ' + nm + sufOf(f) + '=');
      // arrow/function PARAMETER named exactly like the export: `(id, w, h, drawFn)` →
      // `(mkSpr$spri, w, h, drawFn)` inside ITS OWN declaration only. NB: exported
      // function names are rewritten at their CALL sites but NOT inside their own
      // `function NAME(` header (the decl guard skips it), so this substitution is
      // safe even for multi-line function bodies.
      mods[f] = mods[f].replace(new RegExp('^((?:export\\s+)?(?:const|let|var)\\s+' + esc + '\\s*=\\s*(?:async\\s+)?\\()', 'm'),
        (mm, pre) => pre + name + sufOf(f));
      mods[f] = mods[f].replace(new RegExp('^(export\\s+(?:async\\s+)?function\\s+)' + esc + '\\s*\\(', 'm'),
        (mm, pre) => pre + name + sufOf(f) + '(');
    }
  }
}

// mkSpr()'s body uses computed member access (`SPR[id]`, `NOMASK.add(id)`), which the
// identifier rewriter never touches (property names after `.` stay bare). The bundle's
// declarations are renamed `SPR$sprites` / `NOMASK$sprites`, so patch the bodies here.
for (const f of ['sprites.js', 'mask.js']) {
  mods[f] = mods[f].replace(/\bSPR\[id\]/g, 'SPR$sprites[id]')
                   .replace(/\bNOMASK\.add\(id\)/g, 'NOMASK$sprites.add(id)');
}

// Assemble: one IIFE, each module wrapped in its own block scope.
let out = `// GENERATED by tools/build-classic.cjs — DO NOT EDIT.
// Classic-script build of the entire game (src/*.js) for file:// usage, where browsers
// block <script type="module">. Contains the SAME battle logic as the modules:
// one action per turn (busy lock), fully visible frame-driven enemy attacks with
// telegraph markers, and the seven unique named attack patterns with custom sprites.
(function () {
'use strict';
`;
for (const f of FILES) {
  out += `\n// ==================== src/${f} ====================\n{\n`;
  out += stripExports(mods[f], f).trim() + '\n}\n';
}
out += `})();\n`;

fs.writeFileSync(path.join(ROOT, 'src', 'boot-classic.js'), out);
console.log('built src/boot-classic.js,', out.split('\n').length, 'lines');
