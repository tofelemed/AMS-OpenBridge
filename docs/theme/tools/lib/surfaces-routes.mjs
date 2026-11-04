// Routes, redirects and guards from App.tsx and Administration.tsx, plus the nav and admin tab tables.
const WRAPPERS = /^(RequireAuth|RequirePermission|AppShell|React\.Suspense|Suspense|Navigate|Routes|Route)$/;

export function createRoutes(ctx, api) {
  const { ts, at, text, walkLive, constEval, constInit, stripExpr, fileByRel, topOf, symOf } = ctx;
  const attrs = el => el.attributes.properties.filter(ts.isJsxAttribute);
  const attr = (el, name) => attrs(el).find(a => a.name.getText() === name);
  const attrVal = a => (!a ? null : !a.initializer ? 'true' : ts.isStringLiteral(a.initializer) ? a.initializer.text : a.initializer.expression);
  const isOpen = n => ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n);

  function strList(e) {
    const n = stripExpr(e);
    return n && ts.isArrayLiteralExpression(n) ? n.elements.map(x => x.text) : [];
  }

  function analyse(expr) {
    const r = { leaf: null, leafNode: null, permission: null, anyOf: [], redirectTo: null, auth: false, guard: null, sliceRedirect: false, legacyComponent: null };
    const stripped = stripExpr(expr);
    if (ts.isConditionalExpression(stripped)) {
      const settled = constEval(stripped.condition);
      if (settled !== undefined) {
        const dead = analyse(settled ? stripped.whenFalse : stripped.whenTrue);
        r.sliceRedirect = true;
        r.legacyComponent = dead.leaf;
        r.legacyPermission = dead.permission;
      } else {
        const c = stripped.condition;
        const init = ts.isIdentifier(c) ? constInit(c) : null;
        r.guard = text(init ?? c, 80);
      }
    }
    walkLive(expr, n => {
      if (ts.isJsxAttribute(n) && n.name.getText() === 'fallback') return false;
      if (!isOpen(n)) return true;
      const tag = n.tagName.getText();
      if (tag === 'RequireAuth') r.auth = true;
      if (tag === 'RequirePermission') {
        r.permission = attrVal(attr(n, 'permission'));
        const any = attrVal(attr(n, 'anyOf'));
        if (any && typeof any !== 'string') r.anyOf = strList(any);
      }
      if (tag === 'Navigate') {
        const to = attrVal(attr(n, 'to'));
        const lit = to && typeof to !== 'string' && ts.isIdentifier(to) && stripExpr(constInit(to));
        const v = typeof to === 'string' ? to : lit && ts.isStringLiteralLike(lit) ? lit.text : lit ? text(lit, 60) : to ? text(to, 60) : null;
        r.redirectTo = r.redirectTo ?? v;
      }
      if (!WRAPPERS.test(tag) && !r.leaf) { r.leaf = tag; r.leafNode = n.tagName; }
      return true;
    });
    return r;
  }

  function collect() {
    const out = [];
    const scan = (rel, prefix) => {
      const sf = fileByRel.get(rel);
      walkLive(sf, n => {
        if (!isOpen(n) || n.tagName.getText() !== 'Route') return true;
        const p = attrVal(attr(n, 'path'));
        const isIndex = !!attr(n, 'index');
        if (typeof p !== 'string' && !isIndex) return true;
        const full = isIndex ? prefix.replace(/\/$/, '') || '/' : p === '*' ? `${prefix}(unmatched)` : p.startsWith('/') ? p : `${prefix}${p}`;
        const a = analyse(attrVal(attr(n, 'element')));
        if (p === '/*') return true; // the shell wrapper; its nested routes are walked as children
        out.push({
          path: full,
          at: at(n),
          params: [...full.matchAll(/:(\w+)/g)].map(m => m[1]).concat(full.endsWith('*') ? ['*'] : []),
          component: a.leaf,
          componentAt: a.leafNode ? declAt(a.leafNode) : null,
          permission: a.permission,
          anyOf: a.anyOf,
          guard: a.guard,
          redirectTo: a.redirectTo,
          kind: a.sliceRedirect ? 'slice-redirect' : a.leaf ? 'page' : 'redirect',
          legacyComponent: a.legacyComponent ?? undefined,
          legacyPermission: a.legacyPermission ?? undefined,
          _tag: a.leafNode,
        });
        return true;
      });
    };
    scan('App.tsx', '');
    scan('components/Administration/Administration.tsx', '/admin/');
    return out;
  }
  const declAt = tagNode => {
    const d = symOf(tagNode)?.declarations?.[0];
    return d ? at(d) : null;
  };

  const collectNav = () => {
    const items = [];
    const nav = fileByRel.get('components/nav/navItems.ts');
    const visit = n => {
      if (ts.isObjectLiteralExpression(n)) {
        const path = api.prop(n, 'path'); const label = api.prop(n, 'label');
        if (path && label && ts.isStringLiteralLike(path)) {
          items.push({ path: path.text, label: label.text, group: api.prop(n, 'group')?.text ?? null, permission: api.prop(n, 'permission')?.text ?? null,
            anyOf: strList(api.prop(n, 'anyOf')), at: at(n) });
        }
      }
      if (ts.isCallExpression(n) && n.expression.getText() === 'cpm' && n.arguments.length >= 2 && ts.isStringLiteralLike(n.arguments[0])) {
        items.push({ path: n.arguments[0].text, label: n.arguments[1].text, group: 'Loop Performance', permission: n.arguments[3]?.text ?? 'analytics.view', anyOf: [], at: at(n) });
      }
      ts.forEachChild(n, visit);
    };
    visit(nav);
    const tabs = [];
    const admin = fileByRel.get('components/Administration/Administration.tsx');
    const vt = n => {
      if (ts.isVariableDeclaration(n) && n.name.getText() === 'TABS') {
        for (const e of stripExpr(n.initializer).elements) {
          tabs.push({ path: api.prop(e, 'path').text, label: api.prop(e, 'label').text, permission: api.prop(e, 'permission')?.text ?? null, at: at(e) });
        }
      }
      ts.forEachChild(n, vt);
    };
    vt(admin);
    return { items, tabs };
  };

  /** Root declarations per live route: the closure from each root gives item -> routes attribution. */
  function attribute(routes) {
    const tops = new Map();
    for (const r of routes) {
      if (r.kind !== 'page' || !r._tag) continue;
      const d = symOf(r._tag)?.declarations?.[0];
      if (d) tops.set(r.path, topOf(d));
    }
    const stop = new Set(tops.values());
    const declRoutes = new Map();
    const reach = {};
    for (const [path, top] of tops) {
      const seen = ctx.closure([top], new Set([...stop].filter(t => t !== top)));
      reach[path] = seen;
      for (const t of seen) {
        if (!declRoutes.has(t)) declRoutes.set(t, new Set());
        declRoutes.get(t).add(path);
      }
    }
    // Chrome mounted for every page: reachable from AppShell or the providers around the router.
    const app = fileByRel.get('App.tsx');
    const shellRoots = [];
    ts.forEachChild(app, n => {
      if (!ts.isVariableStatement(n)) return;
      for (const d of n.declarationList.declarations) {
        if (/^(AppShell|RouteErrorBoundary|RequireAuth|RequirePermission)$/.test(d.name.getText())) shellRoots.push(d);
      }
    });
    for (const nm of ['components/shared/SessionTimeoutDialog.tsx', 'components/shared/ConnectivityBanner.tsx', 'components/shared/dialogService.tsx']) {
      ts.forEachChild(fileByRel.get(nm), n => {
        if (ts.isVariableStatement(n)) shellRoots.push(...n.declarationList.declarations);
        if (ts.isFunctionDeclaration(n)) shellRoots.push(n);
      });
    }
    const shell = ctx.closure(shellRoots, new Set(tops.values()));
    ts.forEachChild(app, n => {
      if (ts.isVariableStatement(n)) for (const d of n.declarationList.declarations) if (d.name.getText() === 'App') shell.add(d);
    });
    reach['(shell)'] = shell;
    for (const t of shell) {
      if (!declRoutes.has(t)) declRoutes.set(t, new Set());
      declRoutes.get(t).add('(shell)');
    }
    return { declRoutes, reach, stopTops: tops };
  }

  return { collect, collectNav, attribute };
}
