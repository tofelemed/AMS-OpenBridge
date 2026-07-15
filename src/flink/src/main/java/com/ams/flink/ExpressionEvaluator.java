package com.ams.flink;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;

/**
 * Phase 7 — a small, dependency-free arithmetic expression evaluator for calculations.
 *
 * Supports + - * / % ^, parentheses, unary minus, numeric literals and named variables bound from a
 * value map (the calculation's inputs). Deliberately NOT a general scripting engine: calculations in
 * Traverse are named, versioned artifacts executed here in Flink (recorded decision L19), so the surface
 * is intentionally arithmetic-only — no function calls, no I/O, no side effects.
 *
 * Implemented as a classic shunting-yard (infix → RPN) followed by an RPN evaluation, both O(n).
 */
public final class ExpressionEvaluator {

    private ExpressionEvaluator() {}

    /** Evaluate {@code expr} with variables from {@code vars}. Throws on malformed input or unknown var. */
    public static double evaluate(String expr, Map<String, Double> vars) {
        Deque<Double> output = new ArrayDeque<>();
        Deque<String> ops = new ArrayDeque<>();
        Tokenizer tk = new Tokenizer(expr);
        String prev = null;
        String tok;
        while ((tok = tk.next()) != null) {
            if (isNumber(tok)) {
                output.push(Double.parseDouble(tok));
            } else if (isName(tok)) {
                Double v = vars.get(tok);
                if (v == null) throw new IllegalArgumentException("Unknown variable: " + tok);
                output.push(v);
            } else if ("(".equals(tok)) {
                ops.push(tok);
            } else if (")".equals(tok)) {
                while (!ops.isEmpty() && !"(".equals(ops.peek())) applyOp(ops.pop(), output);
                if (ops.isEmpty()) throw new IllegalArgumentException("Mismatched parentheses");
                ops.pop(); // discard "("
            } else if (isOperator(tok)) {
                // Unary minus: a '-' at the start or after another operator/'(' negates.
                boolean unary = "-".equals(tok) && (prev == null || isOperator(prev) || "(".equals(prev));
                String op = unary ? "u-" : tok;
                while (!ops.isEmpty() && !"(".equals(ops.peek())
                        && (prec(ops.peek()) > prec(op) || (prec(ops.peek()) == prec(op) && leftAssoc(op)))) {
                    applyOp(ops.pop(), output);
                }
                ops.push(op);
            } else {
                throw new IllegalArgumentException("Unexpected token: " + tok);
            }
            prev = tok;
        }
        while (!ops.isEmpty()) {
            String op = ops.pop();
            if ("(".equals(op)) throw new IllegalArgumentException("Mismatched parentheses");
            applyOp(op, output);
        }
        if (output.size() != 1) throw new IllegalArgumentException("Malformed expression");
        return output.pop();
    }

    private static void applyOp(String op, Deque<Double> out) {
        if ("u-".equals(op)) {
            if (out.isEmpty()) throw new IllegalArgumentException("Malformed expression");
            out.push(-out.pop());
            return;
        }
        if (out.size() < 2) throw new IllegalArgumentException("Malformed expression");
        double b = out.pop(), a = out.pop();
        switch (op) {
            case "+": out.push(a + b); break;
            case "-": out.push(a - b); break;
            case "*": out.push(a * b); break;
            case "/": out.push(a / b); break;
            case "%": out.push(a % b); break;
            case "^": out.push(Math.pow(a, b)); break;
            default: throw new IllegalArgumentException("Unknown operator: " + op);
        }
    }

    private static int prec(String op) {
        switch (op) {
            case "^": return 3;
            // Unary minus binds LOOSER than exponent so -2^2 = -(2^2) = -4 (standard math), but tighter
            // than *, / so -2*3 = (-2)*3. (Was 4, which gave -2^2 = 4.)
            case "u-": return 2;
            case "*": case "/": case "%": return 2;
            case "+": case "-": return 1;
            default: return 0;
        }
    }

    private static boolean leftAssoc(String op) {
        return !"^".equals(op) && !"u-".equals(op);
    }

    private static boolean isOperator(String t) {
        return t.length() == 1 && "+-*/%^".indexOf(t.charAt(0)) >= 0;
    }

    private static boolean isNumber(String t) {
        if (t.isEmpty()) return false;
        char c = t.charAt(0);
        return c == '.' || (c >= '0' && c <= '9');
    }

    private static boolean isName(String t) {
        char c = t.charAt(0);
        return Character.isLetter(c) || c == '_';
    }

    /** Splits an expression into numbers, names, operators and parentheses. */
    private static final class Tokenizer {
        private final String s;
        private int i;
        Tokenizer(String s) { this.s = s == null ? "" : s; }

        String next() {
            while (i < s.length() && Character.isWhitespace(s.charAt(i))) i++;
            if (i >= s.length()) return null;
            char c = s.charAt(i);
            if (c == '(' || c == ')') { i++; return String.valueOf(c); }
            if ("+-*/%^".indexOf(c) >= 0) { i++; return String.valueOf(c); }
            if (Character.isDigit(c) || c == '.') {
                int start = i;
                while (i < s.length() && (Character.isDigit(s.charAt(i)) || s.charAt(i) == '.'
                        || s.charAt(i) == 'e' || s.charAt(i) == 'E'
                        || ((s.charAt(i) == '+' || s.charAt(i) == '-') && (s.charAt(i - 1) == 'e' || s.charAt(i - 1) == 'E')))) i++;
                return s.substring(start, i);
            }
            if (Character.isLetter(c) || c == '_') {
                int start = i;
                while (i < s.length() && (Character.isLetterOrDigit(s.charAt(i)) || s.charAt(i) == '_' || s.charAt(i) == '.')) i++;
                return s.substring(start, i);
            }
            throw new IllegalArgumentException("Unexpected character: " + c);
        }
    }
}
