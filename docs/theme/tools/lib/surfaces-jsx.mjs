// JSX surfaces: labels, click targets, overlays and their openers, collapsibles, conditional regions.
const KINDS = [[/Drawer/, 'drawer'], [/Modal|Dialog/, 'dialog'], [/Popover|Popup|Flyout/, 'popover'],
  [/Menu|Dropdown/, 'menu'], [/Toggletip|Tooltip/, 'tooltip'], [/Palette/, 'command-palette']];
const ROLE_KIND = { dialog: 'dialog', alertdialog: 'dialog', menu: 'menu', tooltip: 'tooltip', listbox: 'popover' };
const CLASS_KIND = [[/drawer/i, 'drawer'], [/modal/i, 'dialog'], [/popover|flyout/i, 'popover'], [/dropdown/i, 'menu'], [/tooltip|toggletip/i, 'tooltip'], [/cmdk(?![_-])/, 'command-palette']];
const COLLAPSE = /Accordion|Collapsible|Expander/;
const DYN = '{…}';

export function createJsx(ctx, api) {
  const { ts, at, text, walkLive, stripExpr, constInit, symOf, topOf, enclosingFn, ownerOf, isUpper } = ctx;
  const isEl = n => ts.isJsxElement(n) || ts.isJsxSelfClosingElement(n);
  const isJsx = n => isEl(n) || ts.isJsxFragment(n);
  const openOf = el => (ts.isJsxElement(el) ? el.openingElement : el);
  const tagOf = el => (ts.isJsxFragment(el) ? '<>' : openOf(el).tagName.getText());
  const attrOf = (el, name) => openOf(el).attributes.properties.find(a => ts.isJsxAttribute(a) && a.name.getText() === name);
  const attrExpr = a => (!a?.initializer ? null : ts.isStringLiteral(a.initializer) ? a.initializer : a.initializer.expression);
  const elOfAttr = a => { const o = a.parent.parent; return ts.isJsxOpeningElement(o) ? o.parent : o; };
  const uniq = xs => [...new Set(xs)];

  // Alternatives a node can render as text. Dynamic pieces become a placeholder.
  function alts(node, depth = 0) {
    const n = stripExpr(node);
    if (!n || depth > 6) return [''];
    if (ts.isJsxText(n)) { const t = n.text.replace(/\s+/g, ' ').trim(); return [t]; }
    if (ts.isStringLiteralLike(n)) return [n.text];
    if (ts.isTemplateExpression(n)) return [n.head.text + n.templateSpans.map(s => DYN + s.literal.text).join('')];
    if (ts.isNumericLiteral(n)) return [n.text];
    if (ts.isJsxExpression(n)) return n.expression ? alts(n.expression, depth + 1) : [''];
    if (ts.isConditionalExpression(n)) return uniq([...alts(n.whenTrue, depth + 1), ...alts(n.whenFalse, depth + 1)]);
    if (ts.isBinaryExpression(n)) {
      const k = n.operatorToken.kind;
      if (k === ts.SyntaxKind.AmpersandAmpersandToken) return alts(n.right, depth + 1);
      if (k === ts.SyntaxKind.BarBarToken || k === ts.SyntaxKind.QuestionQuestionToken) return uniq([...alts(n.left, depth + 1), ...alts(n.right, depth + 1)]);
    }
    if (ts.isIdentifier(n)) {
      const i = stripExpr(constInit(n));
      if (i && ts.isStringLiteralLike(i)) return [i.text];
      return [DYN];
    }
    if (isJsx(n)) return childAlts(n, depth + 1);
    if (ts.isElementAccessExpression(n) && ts.isIdentifier(n.expression)) {
      const t = stripExpr(constInit(n.expression));
      if (t && ts.isObjectLiteralExpression(t)) {
        const vals = t.properties.filter(ts.isPropertyAssignment).map(p => stripExpr(p.initializer)).filter(ts.isStringLiteralLike).map(p => p.text);
        if (vals.length) return uniq(vals);
      }
    }
    if (ts.isPropertyAccessExpression(n)) return tableAlts(n);
    return [DYN];
  }
  // {a.label} inside rows.map(a => ...): the label strings of the table or of the function that builds it.
  function tableAlts(n) {
    const member = n.name.text;
    if (!ts.isIdentifier(n.expression)) return [DYN];
    const d = symOf(n.expression)?.declarations?.[0];
    if (!d || !ts.isParameter(d)) return [DYN];
    const call = d.parent.parent;
    if (!ts.isCallExpression(call) || !ts.isPropertyAccessExpression(call.expression) || !/^(map|flatMap|filter)$/.test(call.expression.name.text)) return [DYN];
    let source = stripExpr(call.expression.expression);
    if (ts.isIdentifier(source)) source = stripExpr(constInit(source)) ?? source;
    if (ts.isCallExpression(source)) {
      const id = ts.isIdentifier(source.expression) ? source.expression : ts.isPropertyAccessExpression(source.expression) ? source.expression.name : null;
      source = (id && symOf(id)?.declarations?.[0]) ?? source;
    }
    const vals = [];
    const v = c => {
      if (ts.isPropertyAssignment(c) && c.name.getText() === member && ts.isStringLiteralLike(stripExpr(c.initializer))) vals.push(stripExpr(c.initializer).text);
      ts.forEachChild(c, v);
    };
    v(source);
    return vals.length ? uniq(vals) : [DYN];
  }
  function childAlts(el, depth) {
    if (ts.isJsxSelfClosingElement(el)) return [''];
    if (/^Obi[A-Z]/.test(tagOf(el)) || NO_CHILD_LABEL.test(tagOf(el))) return [''];
    let acc = [''];
    for (const c of el.children) {
      const parts = alts(c, depth);
      if (parts.length === 1 && parts[0] === '') continue;
      acc = acc.flatMap(a => parts.map(p => [a, p].filter(Boolean).join(' ').trim())).slice(0, 8);
    }
    return acc;
  }
  const LABEL_ATTRS = ['aria-label', 'label', 'text', 'title', 'caption', 'name', 'placeholder'];
  const NO_CHILD_LABEL = /^(select|input|textarea|ObcTextInputField|ObcSelect|ObcDropdown)$/;
  function labelOf(el) {
    if (!el) return { label: null, alts: [], static: false };
    const kids = isEl(el) && !NO_CHILD_LABEL.test(tagOf(el)) ? childAlts(el, 0).filter(s => s && s !== DYN) : [];
    if (kids.length) return { label: kids.join(' | '), alts: kids, static: !kids.some(k => k.includes(DYN)) };
    for (const a of LABEL_ATTRS) {
      const attr = attrOf(el, a);
      const e = attrExpr(attr);
      if (!e) continue;
      const vals = alts(e).filter(s => s && s !== DYN);
      if (vals.length) return { label: vals.join(' | '), alts: vals, static: !vals.some(k => k.includes(DYN)) };
    }
    return { label: null, alts: [], static: false };
  }
  const summarise = e => {
    const n = stripExpr(e);
    if (!n) return null;
    if (isEl(n)) { const l = labelOf(n).label; return `<${tagOf(n)}>${l ? ` ${l.slice(0, 70)}` : ''}`; }
    if (ts.isJsxFragment(n)) { const c = n.children.find(isEl); return c ? `<>${summarise(c)}` : '<>'; }
    if (ts.isStringLiteralLike(n)) return JSON.stringify(n.text.slice(0, 60));
    if (ts.isConditionalExpression(n) || ts.isBinaryExpression(n)) return `nested: ${text(n, 70)}`;
    return text(n, 70);
  };
  const hasJsx = e => {
    const n = stripExpr(e);
    if (!n) return false;
    if (isJsx(n)) return true;
    if (ts.isConditionalExpression(n)) return hasJsx(n.whenTrue) || hasJsx(n.whenFalse);
    if (ts.isBinaryExpression(n)) return hasJsx(n.right) || hasJsx(n.left);
    return false;
  };

  /** Controls that change a state setter: the opener of whatever renders on that state. */
  function openersOfSetter(top, setter) {
    const found = [];
    const via = (node) => {
      for (let p = node.parent; p && p !== top; p = p.parent) {
        if (ts.isJsxAttribute(p) && /^on[A-Z]/.test(p.name.getText())) {
          const el = elOfAttr(p); const l = labelOf(el);
          found.push({ control: tagOf(el), label: l.label, event: p.name.getText(), at: at(p) });
          return;
        }
        if (ts.isPropertyAssignment(p) && /^on[A-Z]/.test(p.name.getText())) {
          const lab = p.parent.properties.find(x => /^(label|title|text)$/.test(x.name?.getText()));
          found.push({ control: 'action-prop', label: lab?.initializer ? alts(lab.initializer).join(' | ') : null, event: p.name.getText(), at: at(p) });
          return;
        }
        if (ts.isVariableDeclaration(p) && ts.isIdentifier(p.name) && enclosingFn(p)) { refsOf(top, p.name.text).forEach(via); return; }
      }
      found.push({ control: '(effect)', label: null, at: at(node) });
    };
    const closes = c => { const a = stripExpr(c.arguments[0]); return a && (a.kind === ts.SyntaxKind.FalseKeyword || a.kind === ts.SyntaxKind.NullKeyword || a.getText() === 'undefined' || a.getText() === "''"); };
    const visit = n => {
      if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === setter && !closes(n)) via(n);
      if (ts.isJsxAttribute(n) && attrExpr(n)?.getText() === setter) found.push({ control: tagOf(elOfAttr(n)), label: labelOf(elOfAttr(n)).label, event: n.name.getText(), at: at(n) });
      ts.forEachChild(n, visit);
    };
    visit(top);
    return found;
  }
  function refsOf(top, name) {
    const out = [];
    const v = n => { if (ts.isIdentifier(n) && n.text === name && !ts.isVariableDeclaration(n.parent)) out.push(n); ts.forEachChild(n, v); };
    v(top);
    return out;
  }
  function openersFor(expr, top) {
    if (!expr) return [];
    const out = [];
    const ids = new Set();
    const v = n => { if (ts.isIdentifier(n) && !(ts.isPropertyAccessExpression(n.parent) && n.parent.name === n)) ids.add(n); ts.forEachChild(n, v); };
    v(expr);
    const done = new Set();
    for (const id of ids) {
      if (done.has(id.text) || /^(true|false|undefined|null)$/.test(id.text)) continue;
      done.add(id.text);
      const d = symOf(id)?.declarations?.[0];
      if (!d) continue;
      if (ts.isBindingElement(d) && ts.isArrayBindingPattern(d.parent) && /useState/.test(d.parent.parent.initializer?.getText() ?? '')) {
        const setter = d.parent.elements[1]?.name?.getText();
        if (setter) out.push(...openersOfSetter(top, setter));
      } else if (ts.isParameter(d) || (ts.isBindingElement(d) && ts.isParameter(d.parent.parent))) {
        out.push({ control: '(prop)', label: id.text, at: at(id) });
      } else if (ts.isVariableDeclaration(d) && /\.get\(/.test(d.initializer?.getText() ?? '')) {
        out.push({ control: '(url)', label: text(d.initializer, 60), at: at(d) });
      } else if (ts.isVariableDeclaration(d) && d.initializer) {
        out.push({ control: '(derived)', label: text(d.initializer, 60), at: at(d) });
      }
    }
    return out.slice(0, 12);
  }
  function guardOf(el) {
    for (let p = el.parent, i = 0; p && i < 8; p = p.parent, i++) {
      if (ts.isJsxExpression(p) || ts.isParenthesizedExpression(p)) continue;
      if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) return p.left;
      if (ts.isConditionalExpression(p)) return p.condition;
      break;
    }
    return null;
  }

  function overlayTitle(el) {
    for (const a of ['aria-label', 'title', 'heading', 'label']) {
      const e = attrExpr(attrOf(el, a));
      if (e) return alts(e).join(' | ');
    }
    const l = labelOf(el).label;
    return l ? l.slice(0, 60) : null;
  }
  function collectOverlays() {
    const items = []; const defs = new Map(); const titles = [];
    const nativeKind = n => {
      const tag = n.tagName.getText();
      if (tag === 'dialog') return 'dialog';
      const el = ts.isJsxOpeningElement(n) ? n.parent : n;
      const role = attrExpr(attrOf(el, 'role'));
      if (role && ts.isStringLiteralLike(role) && ROLE_KIND[role.text]) return ROLE_KIND[role.text];
      if (attrOf(el, 'aria-modal')) return 'dialog';
      if (attrOf(el, 'popover')) return 'popover';
      const cls = attrExpr(attrOf(el, 'className'));
      if (cls && /^[a-z]/.test(tag)) {
        const t = cls.getText();
        for (const [re, k] of CLASS_KIND) if (re.test(t)) return k;
      }
      return null;
    };
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) return true;
        const k = nativeKind(n);
        if (k) { const top = topOf(n); if (ctx.isUpper(ctx.nameOf(top))) defs.set(top, k); }
        return true;
      });
    }
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (ts.isPropertyAssignment(n) && n.name.getText() === 'tooltip' && ts.isObjectLiteralExpression(stripExpr(n.initializer))) {
          items.push({ kind: 'chart-tooltip', component: 'echarts option', at: at(n), owner: ownerOf(n), openers: [{ control: '(hover on chart)', label: null, at: at(n) }], _n: n });
        }
        if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
          const el = ts.isJsxOpeningElement(n) ? n.parent : n;
          const tag = n.tagName.getText();
          const sym = ts.isIdentifier(n.tagName) ? symOf(n.tagName) : null;
          const defTop = sym?.declarations?.[0] ? topOf(sym.declarations[0]) : null;
          let kind = defTop && defs.get(defTop);
          if (!kind && /^[A-Z]/.test(tag)) for (const [re, k] of KINDS) if (re.test(tag)) { kind = k; break; }
          const native = nativeKind(n);
          if (kind || native) {
            const top = topOf(n);
            const openAttr = ['open', 'isOpen', 'visible', 'show'].map(a => attrExpr(attrOf(el, a))).find(Boolean);
            const guard = guardOf(el) ?? openAttr ?? null;
            items.push({ kind: kind ?? native, component: tag, native: !!native, at: at(n), owner: ownerOf(n), guard: guard ? text(guard, 90) : 'always rendered by its parent',
              title: overlayTitle(el), definition: native && defTop == null ? true : undefined, openers: openersFor(guard, top), _n: n });
          }
          for (const nm of ['title', 'tooltip', 'hint', 'tip', 'help', 'data-tooltip']) {
            const a = attrOf(el, nm);
            if (!a) continue;
            const domLike = /^[a-z]/.test(tag) || /^Obc|^Link$|^NavLink$/.test(tag);
            if (nm === 'title' && !domLike) continue;
            const e = attrExpr(a);
            const vals = e ? alts(e) : [];
            titles.push({ attr: nm, element: tag, at: at(a), text: vals.join(' | ') || null, static: !vals.some(v => v.includes(DYN)), _n: a });
          }
          if (tag === 'title' && ts.isJsxOpeningElement(n)) titles.push({ attr: 'svg-title', element: 'title', at: at(n), text: labelOf(el).label, static: true, _n: n });
        }
        if (ts.isCallExpression(n) && ts.isIdentifier(n.expression) && /^(confirm|prompt)$/.test(n.expression.text) && n.arguments[0]) {
          const d = symOf(n.expression)?.declarations?.[0];
          if (!d || !ts.isVariableDeclaration(d) || !/use(Confirm|Prompt)/.test(d.initializer?.getText() ?? '')) return true;
          const top = topOf(n);
          const t = api.prop(n.arguments[0], 'title'); const c = api.prop(n.arguments[0], 'confirmLabel');
          const fn = ownerLocal(n, top);
          items.push({ kind: 'dialog', component: `${n.expression.text}()`, at: at(n), owner: ownerOf(n), title: t ? alts(t).join(' | ') : null, confirmLabel: c ? alts(c).join(' | ') : null,
            guard: 'imperative', openers: fn ? openersOfRef(top, fn) : [], _n: n });
        }
        return true;
      });
    }
    return { items, titles, defs };
  }
  // The local function around a confirm()/prompt(): its name is what the JSX handlers reference.
  const ownerLocal = (n, top) => {
    for (let p = n.parent; p && p !== top; p = p.parent) {
      if (ts.isJsxAttribute(p)) return null;
      if ((ts.isArrowFunction(p) || ts.isFunctionExpression(p)) && ts.isVariableDeclaration(p.parent) && ts.isIdentifier(p.parent.name)) return p.parent.name.text;
      if (ts.isFunctionDeclaration(p) && p.name && p !== top) return p.name.text;
    }
    return null;
  };
  function openersOfRef(top, name) {
    const out = [];
    for (const r of refsOf(top, name)) {
      for (let p = r.parent; p && p !== top; p = p.parent) {
        if (ts.isJsxAttribute(p) && /^on[A-Z]/.test(p.name.getText())) { out.push({ control: tagOf(elOfAttr(p)), label: labelOf(elOfAttr(p)).label, at: at(p) }); break; }
      }
    }
    return out;
  }

  function collectCollapsibles() {
    const out = [];
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (!ts.isJsxOpeningElement(n) && !ts.isJsxSelfClosingElement(n)) return true;
        const el = ts.isJsxOpeningElement(n) ? n.parent : n;
        const tag = n.tagName.getText();
        const expanded = attrOf(el, 'aria-expanded');
        if (tag === 'details' || COLLAPSE.test(tag) || expanded) {
          const named = attrExpr(attrOf(el, 'title')) ?? attrExpr(attrOf(el, 'heading')) ?? attrExpr(attrOf(el, 'label'));
          let label = named ? alts(named).join(' | ') : labelOf(el).label;
          if (tag === 'details' && ts.isJsxElement(el)) {
            const s = el.children.find(c => isEl(c) && tagOf(c) === 'summary');
            if (s) label = labelOf(s).label;
          }
          const ctl = attrExpr(expanded);
          out.push({ kind: tag === 'details' ? 'details' : COLLAPSE.test(tag) ? 'component' : 'aria-expanded', element: tag, at: at(n), label: expanded ? labelOf(el).label : label,
            open: ctl ? text(ctl, 60) : attrOf(el, 'open') ? text(attrOf(el, 'open'), 60) : attrOf(el, 'defaultOpen') ? text(attrOf(el, 'defaultOpen'), 60) : null, owner: ownerOf(n), _n: n });
        }
        return true;
      });
    }
    return out;
  }

  function collectClicks() {
    const out = [];
    for (const sf of ctx.liveFiles) {
      walkLive(sf, n => {
        if (ts.isJsxAttribute(n) && n.name.getText() === 'onClick') {
          const el = elOfAttr(n); const l = labelOf(el); const e = attrExpr(n);
          out.push({ element: tagOf(el), label: l.label, labelStatic: l.static, ariaLabel: attrExpr(attrOf(el, 'aria-label')) ? alts(attrExpr(attrOf(el, 'aria-label'))).join(' | ') : undefined,
            handler: e ? text(e, 110) : null, at: at(n), owner: ownerOf(n), _n: n, _h: e });
        }
        if (ts.isPropertyAssignment(n) && n.name.getText() === 'onClick' && ts.isObjectLiteralExpression(n.parent)) {
          const lab = n.parent.properties.find(x => /^(label|title|text)$/.test(x.name?.getText()) && x.initializer);
          out.push({ element: 'action-prop', label: lab ? alts(lab.initializer).join(' | ') : null, labelStatic: !!lab && !alts(lab.initializer).some(v => v.includes(DYN)),
            handler: text(n.initializer, 110), at: at(n), owner: ownerOf(n), _n: n, _h: n.initializer });
        }
        return true;
      });
    }
    return out;
  }

  /** Conditional JSX regions and early returns in components, with JSX nesting depth. */
  function collectRegions(pageRoots) {
    const out = [];
    for (const sf of ctx.liveFiles) {
      const r = ctx.rel(sf);
      if (!r.endsWith('.tsx')) continue;
      walkLive(sf, n => {
        const isCond = ts.isConditionalExpression(n) && (hasJsx(n.whenTrue) || hasJsx(n.whenFalse));
        const isAnd = ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && hasJsx(n.right);
        const inJsxExpr = !!n.parent && (ts.isJsxExpression(n.parent) || ts.isParenthesizedExpression(n.parent) || ts.isReturnStatement(n.parent));
        if ((isCond || isAnd) && inJsxExpr) {
          const top = topOf(n);
          if (!ctx.isUpper(ctx.nameOf(top))) return true;
          let depth = 0;
          for (let p = n.parent; p; p = p.parent) if (isEl(p)) depth++;
          out.push({ owner: ownerOf(n), at: at(n), depth, pageRoot: pageRoots.has(top), condition: text(isCond ? n.condition : n.left, 110),
            shows: summarise(isCond ? n.whenTrue : n.right), otherwise: isCond ? summarise(n.whenFalse) : null, _n: n });
          return true;
        }
        if (ts.isIfStatement(n) && !n.elseStatement) {
          const ret = ts.isReturnStatement(n.thenStatement) ? n.thenStatement : ts.isBlock(n.thenStatement) ? n.thenStatement.statements.find(ts.isReturnStatement) : null;
          if (ret?.expression && hasJsx(ret.expression) && ctx.isUpper(ctx.nameOf(topOf(n)))) {
            out.push({ owner: ownerOf(n), at: at(n), depth: 0, pageRoot: pageRoots.has(topOf(n)), condition: text(n.expression, 110), shows: summarise(ret.expression), otherwise: 'rest of the component', earlyReturn: true, _n: n });
          }
        }
        return true;
      });
    }
    return out;
  }

  return { labelOf, alts, attrOf, attrExpr, elOfAttr, tagOf, isEl, summarise, collectOverlays, collectCollapsibles, collectClicks, collectRegions, DYN };
}
