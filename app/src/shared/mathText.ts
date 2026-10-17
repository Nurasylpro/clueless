// Turns what students type (or paste) into math.js syntax. Shared by the answer checker
// (main process) and the live math preview (UI).

const FUNCTIONS = new Set([
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot', 'asin', 'acos', 'atan', 'atan2', 'sinh', 'cosh', 'tanh',
  'log', 'log10', 'log2', 'exp', 'sqrt', 'cbrt', 'abs', 'floor', 'ceil', 'round', 'sign',
  'min', 'max', 'pow', 'mod', 'nthRoot', 'factorial', 'gcd', 'lcm'
])

export function normalize(input: string): string {
  let s = input.trim()
  // "y = ...", "a = ...", "answer: ..." -> keep the right-hand side
  s = s.replace(/^[a-z ]*answer\s*[:=]\s*/i, '')
  if (s.includes('=') && !s.includes('==')) s = s.slice(s.lastIndexOf('=') + 1)
  s = s
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅∙]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/eˣ/g, 'e^x')
    .replace(/ˣ/g, '^x')
    .replace(/√\s*\(/g, 'sqrt(')
    .replace(/√\s*([a-z0-9.]+)/gi, 'sqrt($1)')
    .replace(/°/g, ' deg')
    .replace(/\*\*/g, '^')
    .replace(/\bln\s*\(/g, 'log(') // math.js calls the natural log log()
    .replace(/\$/g, '')
    // "x (x + 1)" means multiply, but math.js would read x(...) as a function call
    .replace(/([a-zA-Z_]\w*|\d|\))\s*\(/g, (whole, before: string) =>
      FUNCTIONS.has(before) ? whole : `${before}*(`
    )
  return s.trim()
}
