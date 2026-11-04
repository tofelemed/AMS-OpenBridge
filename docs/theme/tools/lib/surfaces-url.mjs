// Every URL-driven view: URLSearchParams reads and writes, setParams object forms, query strings in in-app links.
export function createUrl(ctx, api) {
  const { ts, checker, at, text, stripExpr, stringsOfType, constInit, symOf, enclosingFn, walkLive } = ctx;
  const isUSP = e => {
    try { return checker.getTypeAtLocation(e).symbol?.name === 'URLSearchParams'; } catch { return false; }
  };
  const lit = e => {
    const s = stripExpr(e);
    if (!s) return null;
    if (ts.isStringLiteralLike(s)) return s.text;
    if (ts.isIdentifier(s)) {
      const i = stripExpr(constInit(s));
      if (i && ts.isStringLiteralLike(i)) return i.text;
    }
    return null;
  };
  // Strings of a const table used as an allow-list: ['a','b'], new Set([...]), Object.keys(O), or an object literal.
  const tableStrings = id => {
    const init = stripExpr(id && ts.isIdentifier(id) ? constInit(id) : id);
    if (!init) return [];
    if (ts.isArrayLiteralExpression(init)) return init.elements.map(lit).filter(Boolean);
    if (ts.isNewExpression(init) && init.arguments?.[0]) return tableStrings(init.arguments[0]);
    if (ts.isObjectLiteralExpression(init)) return init.properties.map(p => p.name && (ts.isIdentifier(p.name) || ts.isStringLiteralLike(p.name)) ? p.name.text : null).filter(Boolean);
    if (ts.isCallExpression(init) && /Object\.keys/.test(init.expression.getText())) return tableStrings(init.arguments[0]);
    return [];
  };
  const EQ = kind => [ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken, ts.SyntaxKind.EqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsToken].includes(kind);
  const OR = kind => [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(kind);

  function refUse(ref, vals) {
    const p = ref.parent;
    const add = e => { const v = lit(e); if (v != null) vals.add(v); };
    if (ts.isBinaryExpression(p) && EQ(p.operatorToken.kind)) add(p.left === ref ? p.right : p.left);
    if (ts.isSwitchStatement(p) && p.expression === ref) for (const c of p.caseBlock.clauses) if (ts.isCaseClause(c)) add(c.expression);
    if (ts.isCallExpression(p) && ts.isPropertyAccessExpression(p.expression) && /^(includes|has)$/.test(p.expression.name.text) && p.arguments[0] === ref) {
      for (const s of tableStrings(p.expression.expression)) vals.add(s);
    }
    if (ts.isElementAccessExpression(p) && p.argumentExpression === ref) for (const s of tableStrings(p.expression)) vals.add(s);
  }
  function varValues(nameId, vals) {
    for (const s of stringsOfType(nameId)) vals.add(s);
    const sym = symOf(nameId);
    const scope = enclosingFn(nameId) ?? nameId.getSourceFile();
    const visit = n => {
      if (ts.isIdentifier(n) && n !== nameId && symOf(n) === sym) {
        refUse(n, vals);
        let c = n;
        for (let i = 0; c.parent && i < 5; i++) {
          const p = c.parent;
          const flows = ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p)
            || (ts.isBinaryExpression(p) && OR(p.operatorToken.kind))
            || (ts.isConditionalExpression(p) && p.condition !== c);
          if (ts.isVariableDeclaration(p)) { for (const s of stringsOfType(p.name)) vals.add(s); break; }
          if (!flows) break;
          c = p;
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(scope);
  }
  function readValues(call) {
    const vals = new Set();
    const add = e => { const v = lit(e); if (v != null) vals.add(v); };
    let n = call;
    for (let i = 0; i < 10; i++) {
      const p = n.parent;
      if (!p) break;
      if (ts.isParenthesizedExpression(p) || ts.isAsExpression(p) || ts.isNonNullExpression(p)) { n = p; continue; }
      if (ts.isPropertyAccessExpression(p) && ts.isCallExpression(p.parent)) { n = p.parent; continue; }
      if (ts.isBinaryExpression(p)) {
        const other = p.left === n ? p.right : p.left;
        if (EQ(p.operatorToken.kind)) {
          add(other);
          if (ts.isConditionalExpression(p.parent) && p.parent.condition === p) { add(p.parent.whenTrue); add(p.parent.whenFalse); }
          break;
        }
        if (OR(p.operatorToken.kind)) { add(other); n = p; continue; }
        break;
      }
      if (ts.isConditionalExpression(p)) { add(p.whenTrue); add(p.whenFalse); n = p; continue; }
      if (ts.isCallExpression(p) && p.arguments.includes(n)) {
        for (const s of stringsOfType(p)) vals.add(s);
        if (ts.isPropertyAccessExpression(p.expression) && /^(includes|has)$/.test(p.expression.name.text)) {
          for (const s of tableStrings(p.expression.expression)) vals.add(s);
        }
        // windowKindOf(v, served = WINDOW_KINDS): the helper's default allow-list.
        const callee = ts.isIdentifier(p.expression) ? symOf(p.expression)?.declarations?.[0] : null;
        for (const q of ctx.fnOf(callee)?.parameters ?? []) if (q.initializer) for (const s of tableStrings(q.initializer)) vals.add(s);
        n = p; continue;
      }
      if (ts.isVariableDeclaration(p)) {
        if (ts.isIdentifier(p.name)) varValues(p.name, vals);
        break;
      }
      break;
    }
    return [...vals];
  }
  const writeValues = e => {
    if (!e) return [];
    const v = lit(e);
    if (v != null) return [v];
    return stringsOfType(stripExpr(e));
  };

  const internal = s => /^\/(cpm|trend|admin|login)(\/|\?|$)/.test(s);
  const firstRoute = root => {
    let target = null;
    const visit = n => {
      if (target) return;
      if (ts.isStringLiteralLike(n) && internal(n.text)) target = n.text.split('?')[0];
      if (ts.isTemplateExpression(n) && internal(n.head.text)) target = n.head.text.split('?')[0];
      if (!target) ts.forEachChild(n, visit);
    };
    visit(root);
    return target;
  };
  // Who a write belongs to: null = the current page, a path = a link helper for that route, 'api' = a fetch query string.
  function linkTarget(recv, node) {
    if (ctx.rel(node.getSourceFile()).startsWith('api/')) return 'api';
    if (ts.isNewExpression(recv)) return fromScratch(node);
    if (!ts.isIdentifier(recv)) return null;
    const d = symOf(recv)?.declarations?.[0];
    const init = d && ts.isVariableDeclaration(d) ? stripExpr(d.initializer) : null;
    if (!init || !ts.isNewExpression(init)) return null;
    const arg = stripExpr(init.arguments?.[0]);
    if (arg && !ts.isObjectLiteralExpression(arg)) return null; // a copy of the current search
    return fromScratch(node);
  }
  function fromScratch(node) {
    const fn = enclosingFn(node);
    if (!fn) return 'api';
    const direct = firstRoute(fn);
    if (direct) return direct;
    const name = ownerFn(node)?.name;
    if (!name) return 'api';
    let via = null;
    const visit = n => {
      if (!via && ts.isTemplateExpression(n) && internal(n.head.text) && n.getText().includes(`${name}(`)) via = n.head.text.split('?')[0];
      if (!via) ts.forEachChild(n, visit);
    };
    visit(node.getSourceFile());
    return via ?? 'api';
  }
  const forOfKeys = keyNode => {
    if (!ts.isIdentifier(keyNode)) return [];
    const d = symOf(keyNode)?.declarations?.[0];
    const list = d?.parent?.parent;
    return list && ts.isForOfStatement(list) ? tableStrings(stripExpr(list.expression)) : [];
  };
  // useWindowKind('kind'): the key is the helper's parameter, so each call site supplies it.
  function paramKeys(keyNode) {
    if (!ts.isIdentifier(keyNode)) return null;
    const d = symOf(keyNode)?.declarations?.[0];
    if (!d || !ts.isParameter(d)) return null;
    const fn = d.parent;
    const idx = fn.parameters.indexOf(d);
    const nameId = fn.name ?? (ts.isVariableDeclaration(fn.parent) ? fn.parent.name : null);
    if (!nameId || !ts.isIdentifier(nameId)) return null;
    const dflt = lit(d.initializer);
    const sites = [];
    const sym = symOf(nameId);
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && symOf(n.expression) === sym) {
          const k = n.arguments[idx] ? lit(n.arguments[idx]) : dflt;
          if (k) sites.push({ key: k, node: n });
        }
        return true;
      });
    }
    const extra = fn.parameters.flatMap(p => (p.initializer ? tableStrings(p.initializer) : []));
    return sites.length ? { sites, values: extra } : null;
  }

  function collect() {
    const reads = []; const writes = []; const links = []; const dynamic = []; const routeRefs = []; const nonSearch = [];
    let apiQueryWrites = 0;
    const pushWrite = (key, node, value, recv, op = 'set', anchor = node) => {
      const target = recv ? linkTarget(recv, node) : null;
      if (target === 'api') { apiQueryWrites++; return; }
      writes.push({ key, op, at: at(node), values: value, target, _n: anchor });
    };
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
          const m = n.expression.name.text;
          const recv = n.expression.expression;
          if (/^(get|getAll|has|set|append|delete)$/.test(m) && n.arguments[0] && isUSP(recv)) {
            const keyNode = stripExpr(n.arguments[0]);
            const k = lit(keyNode);
            let keys = k != null ? [k] : stringsOfType(keyNode);
            if (!keys.length) keys = forOfKeys(keyNode);
            if (!keys.length) {
              const viaParam = paramKeys(keyNode);
              if (viaParam) {
                for (const site of viaParam.sites) {
                  if (/^(get|getAll|has)$/.test(m)) reads.push({ key: site.key, at: at(n), expr: `${text(n.parent, 70)} (key from ${at(site.node)})`, values: [...new Set([...readValues(n), ...viaParam.values])], _n: site.node });
                  else pushWrite(site.key, n, viaParam.values, recv, m, site.node);
                }
                return true;
              }
              dynamic.push({ op: m, at: at(n), keyExpr: text(keyNode, 60), owner: ownerFn(n), entriesOf: entriesParam(keyNode), _n: n });
            }
            for (const key of keys) {
              if (/^(get|getAll|has)$/.test(m)) reads.push({ key, at: at(n), expr: text(n.parent, 90), values: readValues(n), _n: n });
              else pushWrite(key, n, m === 'delete' ? [] : writeValues(n.arguments[1]), recv, m);
            }
          }
        }
        // setParams({ ... }) and new URLSearchParams({ ... })
        if ((ts.isCallExpression(n) && isSetParams(n.expression)) || (ts.isNewExpression(n) && n.expression.getText() === 'URLSearchParams')) {
          const obj = stripExpr(n.arguments?.[0]);
          if (obj && ts.isObjectLiteralExpression(obj)) {
            const recv = ts.isNewExpression(n) ? n : null;
            for (const p of obj.properties) if (p.name) pushWrite(p.name.getText(), p, ts.isPropertyAssignment(p) ? writeValues(p.initializer) : [], recv);
          }
        }
        if (ts.isStringLiteralLike(n) || ts.isTemplateExpression(n)) {
          if (ts.isTemplateSpan(n.parent) || ts.isTemplateExpression(n.parent)) return true;
          const head = ts.isTemplateExpression(n) ? n.head.text : n.text;
          if (internal(head)) {
            const url = api.urlOf(n);
            const [p, q] = url.split('?');
            routeRefs.push({ path: p.replace(/\/$/, '') || '/', at: at(n), raw: url, _n: n });
            for (const [k, v] of [...new URLSearchParams(q ?? '')]) {
              if (/^[\w.-]+$/.test(k)) links.push({ key: k, target: p, value: /[{}]/.test(v) ? null : v, at: at(n), _n: n });
            }
          }
        }
        // location.state and location.hash are URL-adjacent view state.
        if (ts.isPropertyAccessExpression(n) && /^(state|hash)$/.test(n.name.text) && /^(location|loc)$/.test(n.expression.getText())) {
          nonSearch.push({ kind: `location.${n.name.text}`, at: at(n), expr: text(n.parent, 90), _n: n });
        }
        if (ts.isCallExpression(n) && n.expression.getText() === 'useParams') nonSearch.push({ kind: 'useParams', at: at(n), expr: text(n.parent, 90), _n: n });
        return true;
      });
    }
    // Object.entries helpers such as go({ view: 'x', gate: null }) and build('/cpm/x', { loop }): keys come from the call sites.
    for (const d of dynamic) {
      if (!d.entriesOf) continue;
      const { sym, index, pathIndex } = d.entriesOf;
      for (const sf of ctx.liveFiles) {
        walkLive(sf, n => {
          if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && symOf(n.expression) === sym) {
            const obj = stripExpr(n.arguments[index]);
            const target = pathIndex >= 0 ? lit(n.arguments[pathIndex]) : null;
            if (obj && ts.isObjectLiteralExpression(obj)) {
              for (const p of obj.properties) {
                if (p.name) writes.push({ key: p.name.getText(), op: 'set', at: at(p), values: ts.isPropertyAssignment(p) ? writeValues(p.initializer) : [], target, _n: p, viaHelper: n.expression.text });
              }
            }
          }
          return true;
        });
      }
      d.resolved = true;
    }
    return { reads, writes, links, dynamic, routeRefs, nonSearch, apiQueryWrites };
  }
  // for (const [k, v] of Object.entries(param)) inside a named helper.
  function entriesParam(keyNode) {
    if (!ts.isIdentifier(keyNode)) return null;
    const d = symOf(keyNode)?.declarations?.[0];
    const fo = d && ts.isBindingElement(d) ? d.parent.parent.parent?.parent : null;
    if (!fo || !ts.isForOfStatement(fo)) return null;
    const call = stripExpr(fo.expression);
    if (!ts.isCallExpression(call) || call.expression.getText() !== 'Object.entries') return null;
    const arg = stripExpr(call.arguments[0]);
    if (!ts.isIdentifier(arg)) return null;
    const pd = symOf(arg)?.declarations?.[0];
    if (!pd || !ts.isParameter(pd)) return null;
    const fn = pd.parent;
    const nameId = fn.name ?? (ts.isVariableDeclaration(fn.parent) ? fn.parent.name : null);
    if (!nameId || !ts.isIdentifier(nameId)) return null;
    return { sym: symOf(nameId), index: fn.parameters.indexOf(pd), pathIndex: fn.parameters.findIndex(p => p.name.getText() === 'path') };
  }
  function isSetParams(e) {
    if (!ts.isIdentifier(e)) return false;
    const d = symOf(e)?.declarations?.[0];
    return !!d && ts.isBindingElement(d) && /useSearchParams/.test(d.parent.parent.initializer?.getText() ?? '');
  }
  function ownerFn(n) {
    for (let p = n.parent; p; p = p.parent) {
      if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) return { name: p.name.text };
      if (ts.isFunctionDeclaration(p) && p.name) return { name: p.name.text };
    }
    return null;
  }
  return { collect };
}
