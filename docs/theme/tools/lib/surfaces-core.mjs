// Shared compiler state for source-surfaces.mjs: program, checker, citing, slice pruning, declaration graph.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

export function createContext(repo) {
  const app = path.join(repo, 'src/frontend-ob');
  const src = path.join(app, 'src').replaceAll('\\', '/');
  const ts = createRequire(path.join(app, 'package.json'))('typescript');
  const cfgPath = path.join(app, 'tsconfig.json');
  const parsed = ts.parseJsonConfigFileContent(ts.readConfigFile(cfgPath, ts.sys.readFile).config, ts.sys, app);
  const program = ts.createProgram({ rootNames: parsed.fileNames, options: { ...parsed.options, noEmit: true } });
  const checker = program.getTypeChecker();
  const inv = JSON.parse(fs.readFileSync(path.join(repo, 'docs/theme/data/source-inventory.json'), 'utf8')).perFile;
  const liveRel = new Set(Object.entries(inv).filter(([, v]) => v.group !== 'legacy').map(([k]) => k));
  const rel = sf => path.posix.relative(src, (sf.fileName ?? sf).replaceAll('\\', '/'));
  const liveFiles = program.getSourceFiles().filter(sf => liveRel.has(rel(sf)));
  const fileByRel = new Map(program.getSourceFiles().map(sf => [rel(sf), sf]));
  const isSrc = sf => sf.fileName.replaceAll('\\', '/').startsWith(src + '/');

  const at = n => {
    const sf = n.getSourceFile();
    return `${rel(sf)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`;
  };
  const text = (n, max = 160) => {
    const t = n.getText().replace(/\s+/g, ' ').trim();
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
  };
  const unalias = s => (s && s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s);
  const symOf = id => {
    try {
      if (id.parent && ts.isShorthandPropertyAssignment(id.parent) && id.parent.name === id) {
        return unalias(checker.getShorthandAssignmentValueSymbol(id.parent));
      }
      return unalias(checker.getSymbolAtLocation(id));
    } catch { return undefined; }
  };
  const isTypeDecl = d => ts.isInterfaceDeclaration(d) || ts.isTypeAliasDeclaration(d)
    || ts.isPropertySignature(d) || ts.isMethodSignature(d) || ts.isTypeParameterDeclaration(d);

  // Top-level owner of a node: the variable declarator, function, class or plain statement directly under the file.
  const topOf = node => {
    let n = node;
    let decl = null;
    while (n && n.parent && !ts.isSourceFile(n.parent)) {
      if (ts.isVariableDeclaration(n) && n.parent?.parent?.parent && ts.isSourceFile(n.parent.parent.parent)) decl = n;
      n = n.parent;
    }
    return decl ?? n;
  };
  const nameOf = top => {
    if (!top) return null;
    if (top.name && ts.isIdentifier(top.name)) return top.name.text;
    if (ts.isExportAssignment(top)) return 'default';
    return null;
  };

  // CPA_SLICE_ONLY pruning. Returns true/false when a condition is settled by the slice, otherwise undefined.
  const sliceTabs = (() => {
    const s = fileByRel.get('productSlice.ts');
    const out = { admin: new Set(), nav: new Set() };
    ts.forEachChild(s, n => {
      if (!ts.isVariableStatement(n)) return;
      for (const d of n.declarationList.declarations) {
        const arr = d.initializer?.arguments?.[0];
        if (!arr || !ts.isArrayLiteralExpression(arr)) continue;
        const vals = arr.elements.map(e => e.text);
        if (d.name.text === 'SLICE_ADMIN_TABS') out.admin = new Set(vals);
        if (d.name.text === 'SLICE_NAV') out.nav = new Set(vals);
      }
    });
    return out;
  })();
  const constEval = e => {
    if (!e) return undefined;
    if (ts.isParenthesizedExpression(e)) return constEval(e.expression);
    if (ts.isIdentifier(e) && e.text === 'CPA_SLICE_ONLY') return true;
    if (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
      const v = constEval(e.operand);
      return v === undefined ? undefined : !v;
    }
    if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && e.arguments[0] && ts.isStringLiteralLike(e.arguments[0])) {
      if (e.expression.text === 'isSliceAdminTab') return sliceTabs.admin.has(e.arguments[0].text);
      if (e.expression.text === 'isSliceNavPath') return sliceTabs.nav.has(e.arguments[0].text);
    }
    if (ts.isBinaryExpression(e)) {
      const op = e.operatorToken.kind;
      const l = constEval(e.left);
      if (op === ts.SyntaxKind.AmpersandAmpersandToken) return l === false ? false : (l === true ? constEval(e.right) : undefined);
      if (op === ts.SyntaxKind.BarBarToken) return l === true ? true : (l === false ? constEval(e.right) : undefined);
    }
    return undefined;
  };
  // Children of n that survive the slice. Everything else is dead code under CPA_SLICE_ONLY=true.
  const liveChildren = n => {
    if (ts.isConditionalExpression(n)) {
      const c = constEval(n.condition);
      if (c !== undefined) return [c ? n.whenTrue : n.whenFalse];
    }
    if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && constEval(n.left) === false) return [];
    if (ts.isIfStatement(n)) {
      const c = constEval(n.expression);
      if (c === true) return [n.thenStatement];
      if (c === false) return n.elseStatement ? [n.elseStatement] : [];
    }
    const out = [];
    ts.forEachChild(n, c => { out.push(c); });
    return out;
  };
  const walkLive = (n, fn) => {
    if (fn(n) === false) return;
    for (const c of liveChildren(n)) walkLive(c, fn);
  };

  // Declaration graph: top-level declaration -> top-level declarations it references, slice pruned.
  const edgeMemo = new Map();
  const moduleDefault = mod => unalias(checker.getExportsOfModule(mod).find(s => s.name === 'default'));
  const edgesOf = top => {
    if (edgeMemo.has(top)) return edgeMemo.get(top);
    const out = new Set();
    edgeMemo.set(top, out);
    const add = sym => {
      for (const d of sym?.declarations ?? []) {
        if (ts.isSourceFile(d) || !isSrc(d.getSourceFile()) || isTypeDecl(d)) continue;
        const t = topOf(d);
        if (t !== top && !ts.isImportDeclaration(t)) out.add(t);
      }
    };
    walkLive(top, n => {
      if (ts.isTypeNode(n) && !ts.isExpressionWithTypeArguments(n)) return false;
      if (ts.isCallExpression(n) && n.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const mod = checker.getSymbolAtLocation(n.arguments[0]);
        if (mod) add(moduleDefault(mod));
      }
      if (ts.isIdentifier(n)) add(symOf(n));
      return true;
    });
    return out;
  };
  const closure = (roots, stop = new Set()) => {
    const seen = new Set();
    const stack = [...roots];
    while (stack.length) {
      const t = stack.pop();
      if (seen.has(t)) continue;
      seen.add(t);
      for (const e of edgesOf(t)) if (!seen.has(e) && !stop.has(e)) stack.push(e);
    }
    return seen;
  };

  // Const resolution helpers shared by the url, api and polling collectors.
  const constInit = id => {
    const sym = symOf(id);
    const d = sym?.valueDeclaration ?? sym?.declarations?.[0];
    return d && ts.isVariableDeclaration(d) ? d.initializer : undefined;
  };
  const stripExpr = e => {
    let n = e;
    while (n && (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isSatisfiesExpression(n))) n = n.expression;
    return n;
  };
  const stringsOfType = node => {
    try {
      const t = checker.getTypeAtLocation(node);
      const parts = t.isUnion() ? t.types : [t];
      const lits = parts.filter(p => p.isStringLiteral()).map(p => p.value);
      const others = parts.filter(p => !p.isStringLiteral() && !(p.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined)));
      return others.length === 0 ? lits : [];
    } catch { return []; }
  };
  const fnOf = decl => {
    if (!decl) return null;
    if (ts.isFunctionDeclaration(decl) || ts.isMethodDeclaration(decl) || ts.isArrowFunction(decl) || ts.isFunctionExpression(decl)) return decl;
    if (ts.isVariableDeclaration(decl) || ts.isPropertyAssignment(decl)) {
      let i = stripExpr(decl.initializer);
      if (i && ts.isCallExpression(i) && /^(useCallback|useMemo|backgroundPoll)$/.test(i.expression.getText())) i = stripExpr(i.arguments[0]);
      if (i && (ts.isArrowFunction(i) || ts.isFunctionExpression(i))) return i;
    }
    return null;
  };
  const enclosingFn = n => {
    for (let p = n.parent; p; p = p.parent) if (ts.isFunctionLike(p)) return p;
    return null;
  };
  const isUpper = s => /^[A-Z]/.test(s ?? '');
  // Outermost named function or variable around the node: the component or hook that owns it.
  const ownerOf = node => {
    let best = null;
    for (let p = node; p; p = p.parent) {
      if ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p)) && p.name && ts.isIdentifier(p.name)) best = p.name.text;
    }
    return best;
  };

  return { ts, program, checker, src, rel, at, text, symOf, unalias, topOf, nameOf, constEval, liveChildren, walkLive,
    edgesOf, closure, moduleDefault, constInit, stripExpr, stringsOfType, fnOf, enclosingFn, isUpper, ownerOf, isSrc,
    liveFiles, fileByRel, liveRel, sliceTabs, isTypeDecl };
}
