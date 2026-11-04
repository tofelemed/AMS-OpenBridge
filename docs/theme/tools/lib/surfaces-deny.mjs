// Deny-list: labels on controls whose handler reaches a mutating API, plus evidence for the seed labels.
const SEEDS = ['Save', 'Submit', 'Apply', 'Acknowledge', 'Shelve', 'Unshelve', 'Run', 'Re-run', 'Evaluate', 'Recompute', 'Reconstruct',
  'Republish', 'Re-project', 'Import', 'Test', 'Delete', 'Deploy', 'Approve', 'Reject', 'Activate', 'Update loop', 'Sign out', 'New draft',
  'New version', 'Set', 'Reset to inherited', 'Rollback', 'Verify', 'Link to this episode', 'Save note'];
const FN_ATTR = /^on[A-Z]|save|submit|confirm|commit|apply|action/i;
const EXPLICIT = ['confirmLabel', 'submitLabel', 'actionLabel', 'saveLabel', 'primaryLabel', 'okLabel'];
const NEVER = /^(cancel|close|back|dismiss|ok)$/i;
const OBJ_HANDLER = /^on(Click|Confirm|Submit|Select|Press)$/;

export function createDeny(ctx, api, jsx) {
  const { ts, at, walkLive, stripExpr, symOf, topOf } = ctx;
  const memo = new Map();
  const eff = e => { if (!memo.has(e)) memo.set(e, api.effects(e)); return memo.get(e); };
  const fnLike = e => {
    const n = stripExpr(e);
    return !!n && (ts.isArrowFunction(n) || ts.isFunctionExpression(n) || ts.isIdentifier(n) || ts.isPropertyAccessExpression(n) || ts.isElementAccessExpression(n));
  };
  const nativeish = tag => /^[a-z]/.test(tag) || /^Obc/.test(tag);
  const cleanAlts = xs => {
    const out = [];
    for (const raw of xs) {
      // A dynamic label keeps its static head; one with no usable head identifies nothing, so it is dropped.
      const head = raw.includes(jsx.DYN) ? raw.split(jsx.DYN)[0] : raw;
      const v = head.replace(/\s+/g, ' ').replace(/[\s·:…]+$/, '').trim();
      if (/[A-Za-z]{2}/.test(v) && v.length <= 60 && !NEVER.test(v)) out.push(v);
    }
    return out;
  };
  const descendants = (el, pred, acc = []) => {
    const v = n => { if (jsx.isEl(n) && pred(n)) acc.push(n); ts.forEachChild(n, v); };
    v(el);
    return acc;
  };

  const findImport = n => {
    let hit = null;
    const v = c => { if (ts.isCallExpression(c) && c.expression.kind === ts.SyntaxKind.ImportKeyword) hit = c; if (!hit) ts.forEachChild(c, v); };
    v(n);
    return hit;
  };
  // A mutating handler handed to a custom component: find the control inside that fires the prop.
  function propTrace(el, propName, depth = 0, seen = new Set()) {
    if (depth > 3) return [];
    const open = jsx.isEl(el) ? (ts.isJsxElement(el) ? el.openingElement : el) : null;
    if (!open || !ts.isIdentifier(open.tagName)) return [];
    const d = symOf(open.tagName)?.declarations?.[0];
    if (!d || !ctx.isSrc(d.getSourceFile())) return [];
    let top = topOf(d);
    // React.lazy(() => import('./Panel')): trace into the module's default export.
    const lazy = ts.isVariableDeclaration(top) && top.initializer ? findImport(top.initializer) : null;
    if (lazy) {
      const def = ctx.moduleDefault(ctx.checker.getSymbolAtLocation(lazy.arguments[0]))?.declarations?.[0];
      if (def) top = topOf(def);
    }
    if (seen.has(top)) return [];
    seen.add(top);
    const found = [];
    const visit = n => {
      if (ts.isJsxAttribute(n) && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression) {
        const e = n.initializer.expression;
        if (fnLike(e) && (eff(e).refs.has(propName))) {
          const inner = jsx.elOfAttr(n);
          const tag = jsx.tagOf(inner);
          if (nativeish(tag)) {
            const l = jsx.labelOf(inner);
            found.push({ el: inner, alts: l.alts, at: at(inner) });
          } else {
            found.push(...propTrace(inner, n.name.getText(), depth + 1, seen));
            const l = jsx.labelOf(inner);
            if (l.alts.length) found.push({ el: inner, alts: l.alts, at: at(inner) });
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(top);
    return found;
  }

  function collect() {
    const evidence = []; const controls = []; const unresolved = [];
    const emit = (alts, node, why) => {
      for (const label of cleanAlts(alts)) {
        const [file, line] = at(node).split(/:(?=\d+$)/);
        evidence.push({ label, file, line: Number(line), why });
      }
    };
    const handle = (holder, el, attrName, expr) => {
      const e = eff(expr);
      const muts = e.api.filter(api.mutating);
      if (!muts.length) return;
      const ep = [...new Set(muts.map(m => m.endpoint))];
      const tag = el ? jsx.tagOf(el) : 'action-prop';
      let got = 0;
      if (el) {
        for (const nm of EXPLICIT) {
          const v = jsx.attrExpr(jsx.attrOf(el, nm));
          if (v) { emit(jsx.alts(v), v, ep[0]); got++; }
        }
        if (tag === 'form') {
          const subs = descendants(el, c => /^(submit)$/.test(jsx.attrExpr(jsx.attrOf(c, 'type'))?.text ?? ''));
          for (const s of subs) { emit(jsx.labelOf(s).alts, s, ep[0]); got++; }
        } else if (nativeish(tag) || attrName === 'onClick') {
          let l = jsx.labelOf(el);
          if (!l.alts.length) {
            for (let p = el.parent, i = 0; p && i < 4; p = p.parent, i++) {
              if (jsx.isEl(p) && jsx.tagOf(p) === 'label') { l = jsx.labelOf(p); break; }
            }
          }
          if (l.alts.length) { emit(l.alts, el, ep[0]); got++; }
        }
        if (!nativeish(tag)) {
          for (const f of propTrace(el, attrName)) { emit(f.alts, f.el, ep[0]); got++; }
        }
      }
      for (const c of e.confirms) {
        const cl = c.arguments[0] && api.prop(c.arguments[0], 'confirmLabel');
        if (cl) { emit(jsx.alts(cl), cl, ep[0]); got++; }
      }
      controls.push({ element: tag, attr: attrName, at: at(holder), endpoints: ep, resolved: got > 0, _n: holder });
      if (!got) unresolved.push({ element: tag, attr: attrName, at: at(holder), endpoints: ep, handler: ctx.text(expr, 90) });
    };
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (ts.isJsxAttribute(n) && FN_ATTR.test(n.name.getText())) {
          const v = jsx.attrExpr(n);
          if (v && fnLike(v)) handle(n, jsx.elOfAttr(n), n.name.getText(), v);
        }
        if (ts.isPropertyAssignment(n) && OBJ_HANDLER.test(n.name.getText()) && ts.isObjectLiteralExpression(n.parent) && fnLike(n.initializer)) {
          const e = eff(n.initializer);
          if (e.api.some(api.mutating)) {
            const ep = [...new Set(e.api.filter(api.mutating).map(m => m.endpoint))];
            const lab = n.parent.properties.find(x => /^(label|title|text)$/.test(x.name?.getText()) && x.initializer);
            let got = 0;
            if (lab) { emit(jsx.alts(lab.initializer), lab, ep[0]); got++; }
            // reconstruct={{ onClick }} on a custom component: the control lives inside that component.
            let holder = n.parent.parent;
            while (holder && (ts.isConditionalExpression(holder) || ts.isParenthesizedExpression(holder) || ts.isBinaryExpression(holder))) holder = holder.parent;
            if (holder && ts.isJsxExpression(holder) && ts.isJsxAttribute(holder.parent)) {
              for (const f of propTrace(jsx.elOfAttr(holder.parent), holder.parent.name.getText())) { emit(f.alts, f.el, ep[0]); got++; }
            }
            controls.push({ element: 'action-prop', attr: n.name.getText(), at: at(n), endpoints: ep, resolved: got > 0, _n: n });
            if (!got) unresolved.push({ element: 'action-prop', attr: n.name.getText(), at: at(n), endpoints: ep, handler: ctx.text(n.initializer, 90) });
          }
        }
        return true;
      });
    }
    return { evidence, controls, unresolved };
  }

  // Seed evidence: the first sites where a live control or label carries the word.
  function seedEvidence(clicks, sources) {
    const out = [];
    for (const seed of SEEDS) {
      const re = new RegExp(`(^|[^A-Za-z])${seed.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}([^A-Za-z]|$)`, 'i');
      const hits = clicks.filter(c => c.label && re.test(c.label)).slice(0, 3);
      for (const h of hits) { const [file, line] = h.at.split(/:(?=\d+$)/); out.push({ label: seed, file, line: Number(line) }); }
      if (hits.length) continue;
      let found = 0;
      for (const [file, lines] of sources) {
        if (found >= 2) break;
        const litRe = new RegExp(`(>|['"\`])\\s*${seed.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`);
        const i = lines.findIndex(l => litRe.test(l));
        if (i >= 0) { out.push({ label: seed, file, line: i + 1 }); found++; }
      }
      if (!found) out.push({ label: seed, file: null, line: null });
    }
    return out;
  }
  return { collect, seedEvidence, SEEDS };
}
