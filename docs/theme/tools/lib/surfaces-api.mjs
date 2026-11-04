// API call resolution: URL normalisation, wrapper substitution, query and mutation hook mapping, handler effects.
const AXIOS = /^(authedAxios|axios|http)$/;
const TERMINAL = /^(apiFetch|apiJson|fetch)$/;
const READ_ONLY_POST = new Set(['/api/v1/cpm/method-runs/evidence/batch', '/api/bindings/resolve/batch']);
const NON_MUTATING_PROPS = /^(data|isLoading|isFetching|isError|error|isPending|isSuccess|status|refetch|hasNextPage|fetchNextPage)$/;

export function createApi(ctx) {
  const { ts, symOf, constInit, stripExpr, fnOf, text, at, isUpper, isSrc } = ctx;

  function urlOf(node, env, depth = 0) {
    const n = stripExpr(node);
    if (!n || depth > 8) return '{?}';
    if (ts.isStringLiteralLike(n)) return n.text;
    if (ts.isTemplateExpression(n)) {
      return n.head.text + n.templateSpans.map(s => urlOf(s.expression, env, depth + 1) + s.literal.text).join('');
    }
    if (ts.isIdentifier(n)) {
      if (env?.has(n.text)) return urlOf(env.get(n.text).node, env.get(n.text).env, depth + 1);
      const init = stripExpr(constInit(n));
      if (init && (ts.isStringLiteralLike(init) || ts.isTemplateExpression(init) || ts.isBinaryExpression(init))) return urlOf(init, env, depth + 1);
      return `{${n.text}}`;
    }
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      if (op === ts.SyntaxKind.PlusToken) return urlOf(n.left, env, depth + 1) + urlOf(n.right, env, depth + 1);
      if (op === ts.SyntaxKind.QuestionQuestionToken || op === ts.SyntaxKind.BarBarToken) {
        return /import\.meta/.test(n.left.getText()) ? urlOf(n.right, env, depth + 1) : urlOf(n.left, env, depth + 1);
      }
    }
    if (ts.isConditionalExpression(n)) {
      const a = stripExpr(n.whenTrue); const b = stripExpr(n.whenFalse);
      if (ts.isStringLiteralLike(a) && ts.isStringLiteralLike(b) && a.text && b.text) return `{${a.text}|${b.text}}`;
      return `{opt:${text(n.condition, 30).replace(/[{}?]/g, '')}}`; // an optional suffix, dropped from the path below
    }
    if (ts.isCallExpression(n)) {
      const c = n.expression.getText();
      if (/encodeURIComponent|String$/.test(c) && n.arguments[0]) return `{${text(n.arguments[0], 30)}}`;
      if (c.endsWith('.toString')) return `{${n.expression.expression.getText()}}`;
      return `{${text(n, 30)}}`;
    }
    if (ts.isPropertyAccessExpression(n)) {
      const init = constInit(n.name);
      if (init) return urlOf(init, env, depth + 1);
      return `{${n.name.text}}`;
    }
    return `{${text(n, 30)}}`;
  }

  function methodOf(init, env) {
    const obj = stripExpr(init);
    if (!obj) return 'GET';
    if (ts.isCallExpression(obj)) {
      const verb = obj.arguments.map(stripExpr).find(a => ts.isStringLiteralLike(a) && /^(POST|PUT|PATCH|DELETE)$/i.test(a.text));
      return verb ? verb.text.toUpperCase() : '?';
    }
    if (!ts.isObjectLiteralExpression(obj)) {
      if (ts.isIdentifier(obj) && env?.has(obj.text)) return methodOf(env.get(obj.text).node, env.get(obj.text).env);
      return ts.isIdentifier(obj) && /signal/i.test(obj.text) ? 'GET' : '?';
    }
    for (const p of obj.properties) {
      if (p.name?.getText() !== 'method') continue;
      const v = ts.isShorthandPropertyAssignment(p) ? p.name : stripExpr(p.initializer);
      if (ts.isStringLiteralLike(v)) return v.text.toUpperCase();
      if (ts.isIdentifier(v) && env?.has(v.text)) {
        const b = stripExpr(env.get(v.text).node);
        if (ts.isStringLiteralLike(b)) return b.text.toUpperCase();
      }
      return '?';
    }
    return 'GET';
  }

  function apiCallAt(call, env) {
    const c = call.expression;
    let method; let urlNode; let via;
    if (ts.isIdentifier(c) && TERMINAL.test(c.text)) {
      via = c.text; urlNode = call.arguments[0]; method = methodOf(call.arguments[1], env);
    } else if (ts.isPropertyAccessExpression(c) && AXIOS.test(c.expression.getText()) && /^(get|post|put|patch|delete)$/.test(c.name.text)) {
      via = c.getText(); urlNode = call.arguments[0]; method = c.name.text.toUpperCase();
    } else return null;
    const url = urlOf(urlNode, env);
    return { method, url, endpoint: `${method} ${url.replace(/\{opt:[^}]*\}/g, '').split('?')[0]}`, at: at(call), via };
  }
  const mutating = a => a.method !== 'GET' && a.method !== 'HEAD' && !READ_ONLY_POST.has(a.url.split('?')[0]);
  const mutatingEndpoint = ep => { const [method, url] = ep.split(' '); return mutating({ method, url }); };

  const argEnv = (fn, call, callerEnv) => {
    const env = new Map();
    fn.parameters?.forEach((p, i) => {
      if (ts.isIdentifier(p.name) && call?.arguments?.[i]) env.set(p.name.text, { node: call.arguments[i], env: callerEnv });
    });
    return env;
  };
  const skipFile = d => /^(store\/|api\/apiFetch\.ts|api\/http\.ts)/.test(ctx.rel(d.getSourceFile()));

  /** Every mutationFn under a node (a hook body or a single useMutation call). */
  function mutationFnsIn(root, acc = []) {
    const visit = n => {
      if (ts.isCallExpression(n) && n.expression.getText() === 'useMutation') {
        const opts = stripExpr(n.arguments[0]);
        if (opts && ts.isObjectLiteralExpression(opts)) {
          for (const p of opts.properties) {
            if (p.name?.getText() === 'mutationFn') acc.push(ts.isShorthandPropertyAssignment(p) ? p.name : p.initializer);
          }
        }
      }
      ts.forEachChild(n, visit);
    };
    visit(root);
    return acc;
  }

  /** Everything a handler or queryFn can do, following local functions and non-component helpers. */
  function effects(root) {
    const out = { api: [], navigates: [], setters: [], refs: new Set(), confirms: [] };
    const seen = new Set();
    const followHook = (init, env, stack, member) => {
      if (!ts.isCallExpression(init)) return;
      const callee = init.expression;
      if (callee.getText() === 'useMutation') { for (const f of mutationFnsIn(init)) visit(f, env, stack); return; }
      const name = ts.isIdentifier(callee) ? callee : ts.isPropertyAccessExpression(callee) ? callee.name : null;
      if (!name || !/^use[A-Z]/.test(name.text) || name.text === 'useState') return;
      const d = symOf(name)?.declarations?.[0];
      if (!d || !isSrc(d.getSourceFile())) return;
      // actions.validate.mutate(): only the mutation the hook binds to that name.
      let scope = d;
      if (member) {
        const v = n => {
          if (ts.isVariableDeclaration(n) && n.name.getText() === member && n.initializer?.getText().includes('useMutation')) scope = n;
          ts.forEachChild(n, v);
        };
        v(d);
      }
      for (const f of mutationFnsIn(scope)) visit(f, env, stack);
    };
    const followMutation = (recv, env, stack) => {
      const r = stripExpr(recv);
      const base = ts.isPropertyAccessExpression(r) ? r.expression : r;
      if (!ts.isIdentifier(base)) return;
      const d = symOf(base)?.declarations?.[0];
      const init = d && (ts.isVariableDeclaration(d) ? d.initializer : ts.isBindingElement(d) ? d.parent.parent.initializer : null);
      const member = ts.isPropertyAccessExpression(r) ? r.name.text : undefined;
      if (init) followHook(stripExpr(init), env, stack, member);
    };
    // Dispatch tables and factories: { validate: onValidate }, createBatcher({ batch: getX }).
    const followValue = (d, env, stack) => {
      if (!d || !ts.isVariableDeclaration(d) || !d.initializer || !isSrc(d.getSourceFile()) || skipFile(d) || stack.includes(d) || stack.length >= 8) return;
      const i = stripExpr(d.initializer);
      const isFactory = ts.isCallExpression(i) && ts.isSourceFile(d.parent.parent.parent) && !/^use[A-Z]/.test(i.expression.getText());
      if (ts.isObjectLiteralExpression(i) || isFactory) visit(i, env, [...stack, d]);
    };
    const followFn = (id, call, env, stack) => {
      const d = symOf(id)?.declarations?.[0];
      const fn = fnOf(d);
      if (!fn) followValue(d, env, stack);
      if (!d || !fn || isUpper(id.text) || skipFile(d) || !isSrc(d.getSourceFile()) || stack.includes(fn) || stack.length >= 8) return false;
      const inner = call ? argEnv(fn, call, env) : new Map();
      for (const p of fn.parameters ?? []) if (p.initializer) visit(p.initializer, inner, [...stack, fn]);
      visit(fn.body ?? fn, inner, [...stack, fn]);
      return true;
    };
    const visit = (n, env, stack) => {
      if (!n) return;
      if (ts.isCallExpression(n)) {
        const a = apiCallAt(n, env);
        if (a) out.api.push(a);
        const c = n.expression;
        const nm = ts.isIdentifier(c) ? c.text : ts.isPropertyAccessExpression(c) ? c.name.text : '';
        if (nm === 'navigate' && n.arguments[0]) out.navigates.push(text(n.arguments[0], 80));
        if (/^set[A-Z]/.test(nm) && ts.isIdentifier(c)) out.setters.push({ name: nm, arg: n.arguments[0] ? text(n.arguments[0], 40) : '' });
        if (/^(mutate|mutateAsync)$/.test(nm) && ts.isPropertyAccessExpression(c)) followMutation(c.expression, env, stack);
        if (/^(confirm|prompt)$/.test(nm) && ts.isIdentifier(c)) out.confirms.push(n);
        const id = ts.isIdentifier(c) ? c : ts.isPropertyAccessExpression(c) ? c.name : null;
        if (id && !TERMINAL.test(id.text)) followFn(id, n, env, stack);
      }
      if (ts.isIdentifier(n)) {
        out.refs.add(n.text);
        const p = n.parent;
        const isCallee = ts.isCallExpression(p) && p.expression === n;
        const isName = ts.isPropertyAccessExpression(p) && p.name === n;
        const calleeProp = isName && ts.isCallExpression(p.parent) && p.parent.expression === p;
        if (!seen.has(n) && !isCallee && !calleeProp && !TERMINAL.test(n.text)) {
          seen.add(n);
          if (!followFn(n, null, env, stack)) {
            const d = symOf(n)?.declarations?.[0];
            if (d && ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent)) {
              const prop = d.propertyName?.getText() ?? d.name.getText();
              const init = d.parent.parent.initializer;
              if (init && !NON_MUTATING_PROPS.test(prop)) followHook(stripExpr(init), env, stack);
            }
          }
        }
      }
      ts.forEachChild(n, c => visit(c, env, stack));
    };
    visit(root, new Map(), []);
    out.api = [...new Map(out.api.map(a => [`${a.endpoint}|${a.at}`, a])).values()];
    return out;
  }

  const prop = (obj, name) => {
    const o = stripExpr(obj);
    if (!o || !ts.isObjectLiteralExpression(o)) return null;
    for (const p of o.properties) {
      if (p.name?.getText() === name) return ts.isShorthandPropertyAssignment(p) ? p.name : p.initializer;
    }
    return null;
  };
  return { apiCallAt, effects, mutating, mutatingEndpoint, prop, urlOf, mutationFnsIn };
}
