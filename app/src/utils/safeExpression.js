const IDENTIFIER_RE = /[A-Za-z_][A-Za-z0-9_]*/y;
const NUMBER_RE = /(?:\d+\.\d*|\d+|\.\d+)/y;

function buildScopeMap(scope = {}) {
  const map = new Map();
  Object.entries(scope || {}).forEach(([key, value]) => {
    map.set(String(key).toLowerCase(), value);
  });
  return map;
}

function resolveIdentifier(scopeMap, name) {
  const normalized = String(name || "").toLowerCase();
  if (scopeMap.has(normalized)) return scopeMap.get(normalized);
  throw new Error(`Unknown identifier: ${name}`);
}

function preprocessIncludes(expression, scopeMap) {
  return String(expression).replace(
    /([A-Za-z_][A-Za-z0-9_]*)\.includes\(\s*(['"])(.*?)\2\s*\)/g,
    (_, identifier, _quote, needle) => JSON.stringify(String(resolveIdentifier(scopeMap, identifier) ?? "").includes(needle)),
  );
}

function tokenize(expression) {
  const tokens = [];
  let index = 0;
  const src = String(expression || "");
  const multiCharOps = ["!==", "===", ">=", "<=", "&&", "||", "==", "!="];
  const singleCharOps = new Set(["+", "-", "*", "/", "%", "(", ")", ">", "<", "!"]);

  while (index < src.length) {
    const ch = src[index];
    if (/\s/.test(ch)) {
      index += 1;
      continue;
    }

    const op = multiCharOps.find(candidate => src.startsWith(candidate, index));
    if (op) {
      tokens.push({ type: "operator", value: op });
      index += op.length;
      continue;
    }

    if (singleCharOps.has(ch)) {
      tokens.push({
        type: ch === "(" || ch === ")" ? "paren" : "operator",
        value: ch,
      });
      index += 1;
      continue;
    }

    if (ch === "'" || ch === '"') {
      let end = index + 1;
      let value = "";
      while (end < src.length) {
        const current = src[end];
        if (current === "\\") {
          if (end + 1 >= src.length) throw new Error("Invalid escape sequence");
          value += src[end + 1];
          end += 2;
          continue;
        }
        if (current === ch) break;
        value += current;
        end += 1;
      }
      if (src[end] !== ch) throw new Error("Unterminated string literal");
      tokens.push({ type: "string", value });
      index = end + 1;
      continue;
    }

    NUMBER_RE.lastIndex = index;
    const numberMatch = NUMBER_RE.exec(src);
    if (numberMatch) {
      tokens.push({ type: "number", value: Number(numberMatch[0]) });
      index = NUMBER_RE.lastIndex;
      continue;
    }

    IDENTIFIER_RE.lastIndex = index;
    const identifierMatch = IDENTIFIER_RE.exec(src);
    if (identifierMatch) {
      const value = identifierMatch[0];
      if (value === "true" || value === "false") {
        tokens.push({ type: "boolean", value: value === "true" });
      } else {
        tokens.push({ type: "identifier", value });
      }
      index = IDENTIFIER_RE.lastIndex;
      continue;
    }

    throw new Error(`Unexpected token at position ${index}`);
  }

  tokens.push({ type: "eof", value: null });
  return tokens;
}

class Parser {
  constructor(tokens, scopeMap) {
    this.tokens = tokens;
    this.scopeMap = scopeMap;
    this.index = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  consume(type, value) {
    const token = this.current();
    if (type && token.type !== type) throw new Error(`Expected ${type}`);
    if (value && token.value !== value) throw new Error(`Expected ${value}`);
    this.index += 1;
    return token;
  }

  match(type, value) {
    const token = this.current();
    if (type && token.type !== type) return false;
    if (value && token.value !== value) return false;
    this.index += 1;
    return true;
  }

  parse() {
    const result = this.parseLogicalOr();
    if (this.current().type !== "eof") throw new Error("Unexpected trailing tokens");
    return result;
  }

  parseLogicalOr() {
    let left = this.parseLogicalAnd();
    while (this.match("operator", "||")) {
      left = left || this.parseLogicalAnd();
    }
    return left;
  }

  parseLogicalAnd() {
    let left = this.parseEquality();
    while (this.match("operator", "&&")) {
      left = left && this.parseEquality();
    }
    return left;
  }

  parseEquality() {
    let left = this.parseComparison();
    while (true) {
      if (this.match("operator", "===")) left = left === this.parseComparison();
      else if (this.match("operator", "!==")) left = left !== this.parseComparison();
      else if (this.match("operator", "==")) left = left == this.parseComparison();
      else if (this.match("operator", "!=")) left = left != this.parseComparison();
      else break;
    }
    return left;
  }

  parseComparison() {
    let left = this.parseAdditive();
    while (true) {
      if (this.match("operator", ">")) left = left > this.parseAdditive();
      else if (this.match("operator", ">=")) left = left >= this.parseAdditive();
      else if (this.match("operator", "<")) left = left < this.parseAdditive();
      else if (this.match("operator", "<=")) left = left <= this.parseAdditive();
      else break;
    }
    return left;
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (true) {
      if (this.match("operator", "+")) left = Number(left) + Number(this.parseMultiplicative());
      else if (this.match("operator", "-")) left = Number(left) - Number(this.parseMultiplicative());
      else break;
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (true) {
      if (this.match("operator", "*")) left = Number(left) * Number(this.parseUnary());
      else if (this.match("operator", "/")) left = Number(left) / Number(this.parseUnary());
      else if (this.match("operator", "%")) left = Number(left) % Number(this.parseUnary());
      else break;
    }
    return left;
  }

  parseUnary() {
    if (this.match("operator", "!")) return !this.parseUnary();
    if (this.match("operator", "+")) return Number(this.parseUnary());
    if (this.match("operator", "-")) return -Number(this.parseUnary());
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.current();
    if (this.match("paren", "(")) {
      const value = this.parseLogicalOr();
      this.consume("paren", ")");
      return value;
    }
    if (token.type === "number" || token.type === "string" || token.type === "boolean") {
      this.index += 1;
      return token.value;
    }
    if (token.type === "identifier") {
      this.index += 1;
      return resolveIdentifier(this.scopeMap, token.value);
    }
    throw new Error("Invalid expression");
  }
}

export function evaluateExpression(expression, scope = {}) {
  const scopeMap = buildScopeMap(scope);
  const preprocessed = preprocessIncludes(expression, scopeMap);
  const parser = new Parser(tokenize(preprocessed), scopeMap);
  return parser.parse();
}

export function evaluateArithmeticExpression(expression, scope = {}) {
  return Number(evaluateExpression(expression, scope));
}

export function evaluateBooleanExpression(expression, scope = {}) {
  return Boolean(evaluateExpression(expression, scope));
}
