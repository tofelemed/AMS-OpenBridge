// Data surfaces: react-query hooks and their endpoints, mutations, direct calls, polling, toasts, permission checks.
const QUERY = /^(useQuery|useInfiniteQuery|useSuspenseQuery)$/;

export function createData(ctx, api, jsx) {
  const { ts, at, text, walkLive, stripExpr, symOf, topOf, ownerOf } = ctx;

  // Call sites by callee symbol, so a hook's interval parameter can be read at its callers.
  let callIndex = null;
  const callsOf = sym => {
    if (!callIndex) {
      callIndex = new Map();
      for (const sf of ctx.liveFiles) {
        walkLive(sf, n => {
          if (ts.isCallExpression(n)) {
            const id = ts.isIdentifier(n.expression) ? n.expression : ts.isPropertyAccessExpression(n.expression) ? n.expression.name : null;
            const s = id && symOf(id);
            if (s) { if (!callIndex.has(s)) callIndex.set(s, []); callIndex.get(s).push(n); }
          }
          return true;
        });
      }
    }
    return callIndex.get(sym) ?? [];
  };

  function evalNum(node, seen = new Set()) {
    const n = stripExpr(node);
    if (!n || seen.has(n)) return [];
    seen.add(n);
    if (ts.isNumericLiteral(n)) return [Number(n.text)];
    if (n.kind === ts.SyntaxKind.FalseKeyword) return [false];
    if (n.kind === ts.SyntaxKind.TrueKeyword) return [true];
    if (ts.isBinaryExpression(n)) {
      const l = evalNum(n.left, seen); const r = evalNum(n.right, seen);
      const k = n.operatorToken.kind;
      if (k === ts.SyntaxKind.AsteriskToken && l.length === 1 && r.length === 1) return [l[0] * r[0]];
      if (k === ts.SyntaxKind.PlusToken && l.length === 1 && r.length === 1) return [l[0] + r[0]];
      if (k === ts.SyntaxKind.AmpersandAmpersandToken) return r.length ? [false, ...r] : [];
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return [...l, ...r];
      return [];
    }
    if (ts.isConditionalExpression(n)) return [...evalNum(n.whenTrue, seen), ...evalNum(n.whenFalse, seen)];
    if (ts.isArrowFunction(n) || ts.isFunctionExpression(n)) {
      if (!ts.isBlock(n.body)) return evalNum(n.body, seen);
      const vals = [];
      const v = c => { if (ts.isReturnStatement(c) && c.expression) vals.push(...evalNum(c.expression, seen)); if (!ts.isFunctionLike(c)) ts.forEachChild(c, v); };
      ts.forEachChild(n.body, v);
      return vals;
    }
    if (ts.isIdentifier(n)) {
      const d = symOf(n)?.declarations?.[0];
      if (d && ts.isVariableDeclaration(d) && d.initializer) return evalNum(d.initializer, seen);
      if (d && ts.isParameter(d)) {
        const fn = d.parent;
        const idx = fn.parameters.indexOf(d);
        const fnName = fn.name ?? (ts.isVariableDeclaration(fn.parent) ? fn.parent.name : null);
        const vals = d.initializer ? evalNum(d.initializer, seen) : [];
        if (fnName && ts.isIdentifier(fnName)) {
          for (const c of callsOf(symOf(fnName))) if (c.arguments[idx]) vals.push(...evalNum(c.arguments[idx], seen));
        }
        return vals;
      }
      if (d && ts.isBindingElement(d)) return d.initializer ? evalNum(d.initializer, seen) : [];
    }
    return [];
  }

  function keyInfo(key) {
    if (!key) return { key: null };
    const n = stripExpr(key);
    const out = { key: text(n, 120) };
    if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
      const d = symOf(n.expression.name)?.declarations?.[0];
      if (d && ts.isPropertyAssignment(d)) out.keyDef = text(d.initializer, 120);
    } else if (ts.isPropertyAccessExpression(n)) {
      const d = symOf(n.name)?.declarations?.[0];
      if (d && ts.isPropertyAssignment(d)) out.keyDef = text(d.initializer, 120);
    }
    return out;
  }

  function collectQueries() {
    const out = [];
    const addOne = (call, opts, hook) => {
      const fn = api.prop(opts, 'queryFn');
      const eff = fn ? api.effects(fn) : { api: [] };
      out.push({ hook, ...keyInfo(api.prop(opts, 'queryKey')), queryFn: fn ? text(fn, 90) : null,
        endpoints: [...new Set(eff.api.map(a => a.endpoint))], urls: [...new Set(eff.api.map(a => a.url))],
        enabled: api.prop(opts, 'enabled') ? text(api.prop(opts, 'enabled'), 70) : undefined,
        refetchInterval: api.prop(opts, 'refetchInterval') ? evalNum(api.prop(opts, 'refetchInterval')) : undefined,
        staleTime: api.prop(opts, 'staleTime') ? evalNum(api.prop(opts, 'staleTime'))[0] : undefined,
        kind: call.expression.getText(), at: at(call), _n: call });
    };
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (!ts.isCallExpression(n) || !ts.isIdentifier(n.expression)) return true;
        const nm = n.expression.text;
        if (QUERY.test(nm)) addOne(n, n.arguments[0], ownerOf(n));
        if (nm === 'useQueries') {
          const v = c => { if (ts.isObjectLiteralExpression(c) && api.prop(c, 'queryFn')) addOne(n, c, ownerOf(n)); ts.forEachChild(c, v); };
          v(n.arguments[0]);
        }
        return true;
      });
    }
    return out;
  }

  function collectMutations() {
    const out = [];
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (!ts.isCallExpression(n) || n.expression.getText() !== 'useMutation') return true;
        const fn = api.prop(n.arguments[0], 'mutationFn');
        const eff = fn ? api.effects(fn) : { api: [] };
        out.push({ hook: ownerOf(n), mutationFn: fn ? text(fn, 90) : null, endpoints: [...new Set(eff.api.map(a => a.endpoint))], at: at(n), _n: n });
        return true;
      });
    }
    return out;
  }

  /** Calls outside react-query: raw apiFetch in pages, or api/ helpers invoked from effects and handlers. */
  function collectDirect() {
    const out = [];
    const insideRq = n => {
      for (let p = n.parent; p; p = p.parent) if (ts.isPropertyAssignment(p) && /^(queryFn|mutationFn)$/.test(p.name.getText())) return true;
      return false;
    };
    for (const sf of ctx.liveFiles) {
      const r = ctx.rel(sf);
      const inApi = r.startsWith('api/');
      walkLive(sf, n => {
        if (!ts.isCallExpression(n)) return true;
        const direct = api.apiCallAt(n);
        if (direct) {
          if (!inApi) out.push({ owner: ownerOf(n), endpoint: direct.endpoint, url: direct.url, at: at(n), viaQuery: insideRq(n), _n: n });
          return true;
        }
        if (inApi) return true;
        const c = n.expression;
        const id = ts.isIdentifier(c) ? c : ts.isPropertyAccessExpression(c) ? c.name : null;
        const d = id && symOf(id)?.declarations?.[0];
        if (d && ctx.rel(d.getSourceFile()).startsWith('api/') && !insideRq(n)) {
          for (const a of api.effects(n).api) out.push({ owner: ownerOf(n), endpoint: a.endpoint, url: a.url, at: at(n), viaQuery: false, via: text(c, 50), _n: n });
        }
        return true;
      });
    }
    return out;
  }

  function collectPolling() {
    const out = [];
    const keyOf = n => {
      for (let p = n.parent; p; p = p.parent) {
        if (ts.isObjectLiteralExpression(p) && api.prop(p, 'queryKey')) return text(api.prop(p, 'queryKey'), 90);
      }
      return null;
    };
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        const nm = (ts.isPropertyAssignment(n) || ts.isShorthandPropertyAssignment(n)) ? n.name.getText() : null;
        if (nm === 'refetchInterval' || nm === 'refetchIntervalInBackground') {
          const v = ts.isShorthandPropertyAssignment(n) ? n.name : n.initializer;
          out.push({ kind: nm, interval: [...new Set(evalNum(v))], raw: text(v, 80), queryKey: keyOf(n), owner: ownerOf(n), at: at(n), _n: n });
        }
        if (ts.isCallExpression(n) && /^(window\.)?setInterval$/.test(n.expression.getText())) {
          out.push({ kind: 'setInterval', interval: [...new Set(evalNum(n.arguments[1]))], raw: n.arguments[1] ? text(n.arguments[1], 60) : null, handler: text(n.arguments[0], 80), owner: ownerOf(n), at: at(n), _n: n });
        }
        return true;
      });
    }
    return out;
  }

  function collectToasts() {
    const out = [];
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (!ts.isCallExpression(n)) return true;
        const c = n.expression;
        const isT = (ts.isIdentifier(c) && c.text === 'toast') || (ts.isPropertyAccessExpression(c) && c.expression.getText() === 'toast');
        if (!isT) return true;
        const kind = ts.isIdentifier(c) ? 'default' : c.name.text;
        const a0 = n.arguments[0];
        const vals = a0 ? jsx.alts(a0) : [];
        out.push({ kind, text: vals.join(' | ') || null, static: !vals.some(v => v.includes(jsx.DYN)), raw: vals.length && !vals.some(v => !v.includes(jsx.DYN)) ? text(a0, 90) : undefined, owner: ownerOf(n), at: at(n), _n: n });
        return true;
      });
    }
    return out;
  }

  function usesOf(name, scope) {
    const out = [];
    const v = n => {
      if (ts.isIdentifier(n) && n.text === name && !ts.isVariableDeclaration(n.parent)) {
        for (let p = n.parent, i = 0; p && i < 8; p = p.parent, i++) {
          if (ts.isJsxAttribute(p)) { out.push({ how: `attr ${p.name.getText()}`, target: `<${jsx.tagOf(jsx.elOfAttr(p))}> ${jsx.labelOf(jsx.elOfAttr(p)).label ?? ''}`.trim(), at: at(n) }); break; }
          if (ts.isConditionalExpression(p) || (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)) {
            const branch = ts.isConditionalExpression(p) ? p.whenTrue : p.right;
            out.push({ how: 'renders', target: jsx.summarise(branch) ?? text(p, 80), at: at(n) }); break;
          }
          if (ts.isPropertyAssignment(p)) { out.push({ how: `option ${p.name.getText()}`, target: text(p.parent, 70), at: at(n) }); break; }
          if (ts.isIfStatement(p)) { out.push({ how: 'if', target: text(p.thenStatement, 70), at: at(n) }); break; }
        }
      }
      ts.forEachChild(n, v);
    };
    v(scope);
    return out.slice(0, 12);
  }

  function collectPermissions() {
    const out = [];
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (ts.isCallExpression(n)) {
          const c = n.expression;
          const nm = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
          if (nm === 'hasPermission' && n.arguments[0]) {
            const a = stripExpr(n.arguments[0]);
            let binding = null;
            for (let p = n.parent, i = 0; p && i < 5; p = p.parent, i++) {
              if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name)) { binding = p.name.text; break; }
              if (ts.isJsxExpression(p) || ts.isBlock(p)) break;
            }
            const scope = topOf(n);
            const gates = binding ? usesOf(binding, scope) : usesInline(n);
            out.push({ kind: 'hasPermission', permission: ts.isStringLiteralLike(a) ? a.text : null, expr: ts.isStringLiteralLike(a) ? undefined : text(a, 50), binding: binding ?? undefined, gates, owner: ownerOf(n), at: at(n), _n: n });
          }
        }
        if ((ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) && n.tagName.getText() === 'RequirePermission') {
          const el = ts.isJsxOpeningElement(n) ? n.parent : n;
          const p = jsx.attrExpr(jsx.attrOf(el, 'permission'));
          const any = jsx.attrExpr(jsx.attrOf(el, 'anyOf'));
          const child = ts.isJsxElement(el) ? el.children.find(jsx.isEl) : null;
          out.push({ kind: 'RequirePermission', permission: p?.text ?? null, anyOf: any ? text(any, 120) : undefined, gates: [{ how: 'route element', target: child ? `<${jsx.tagOf(child)}>` : null, at: at(n) }], at: at(n), _n: n });
        }
        if (ts.isPropertyAssignment(n) && n.name.getText() === 'permission' && ts.isStringLiteralLike(stripExpr(n.initializer))) {
          const o = n.parent;
          out.push({ kind: 'table-permission', permission: stripExpr(n.initializer).text, gates: [{ how: 'visibility of table entry', target: text(api.prop(o, 'label') ?? o, 60), at: at(n) }], at: at(n), _n: n });
        }
        if (ts.isPropertyAccessExpression(n) && /^(capabilityState|capability_state|capabilityReason)$/.test(n.name.text)) {
          const p = n.parent;
          if (ts.isBinaryExpression(p) || ts.isConditionalExpression(p)) {
            let gate = null;
            for (let q = p; q && !gate; q = q.parent) {
              if (ts.isBinaryExpression(q) && q.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) gate = jsx.summarise(q.right);
              if (ts.isConditionalExpression(q)) gate = jsx.summarise(q.whenTrue);
              if (ts.isIfStatement(q)) gate = text(q.thenStatement, 70);
              if (ts.isBlock(q)) break;
            }
            out.push({ kind: 'capability', permission: null, expr: text(p, 100), gates: gate ? [{ how: 'capability state', target: gate, at: at(n) }] : [], owner: ownerOf(n), at: at(n), _n: n });
          }
        }
        return true;
      });
    }
    return out;
  }
  function usesInline(n) {
    for (let p = n.parent, i = 0; p && i < 6; p = p.parent, i++) {
      if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && p.left.getText().includes('hasPermission')) return [{ how: 'renders', target: jsx.summarise(p.right), at: at(n) }];
      if (ts.isConditionalExpression(p)) return [{ how: 'renders', target: jsx.summarise(p.whenTrue), at: at(n) }];
      if (ts.isJsxAttribute(p)) return [{ how: `attr ${p.name.getText()}`, target: `<${jsx.tagOf(jsx.elOfAttr(p))}>`, at: at(n) }];
      if (ts.isPropertyAssignment(p)) return [{ how: `option ${p.name.getText()}`, target: text(p.parent, 70), at: at(n) }];
      if (ts.isVariableDeclaration(p)) return [{ how: 'value', target: text(p, 80), at: at(n) }];
      if (ts.isReturnStatement(p) || ts.isIfStatement(p)) return [{ how: 'filter or branch', target: text(p, 80), at: at(n) }];
    }
    return [];
  }
  return { collectQueries, collectMutations, collectDirect, collectPolling, collectToasts, collectPermissions };
}
