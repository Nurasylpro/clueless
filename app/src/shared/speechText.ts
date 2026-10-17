// Turns a tutor message (Markdown, math in $...$) into plain words for text-to-speech:
// no formatting characters, no LaTeX commands, and math read the way a person would say it.

const GREEK = [
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'varepsilon', 'zeta', 'eta', 'theta', 'vartheta', 'iota',
  'kappa', 'lambda', 'mu', 'nu', 'xi', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'varphi', 'chi', 'psi', 'omega'
]

// Order matters: longer commands first.
const COMMANDS: [RegExp, string][] = [
  [/\\(?:left|right|big|Big|bigg|Bigg)\b/g, ''],
  [/\\(?:displaystyle|textstyle|limits|nolimits)\b/g, ''],
  [/\\[,;:! ]/g, ' '],
  [/\\quad|\\qquad/g, ' '],
  [/\\int\b/g, ' the integral of '],
  [/\\oint\b/g, ' the integral of '],
  [/\\sum\b/g, ' the sum of '],
  [/\\prod\b/g, ' the product of '],
  [/\\lim\b/g, ' the limit '],
  [/\\infty\b/g, ' infinity '],
  [/\\partial\b/g, ' partial '],
  [/\\nabla\b/g, ' del '],
  [/\\cdot\b|\\times\b/g, ' times '],
  [/\\div\b/g, ' divided by '],
  [/\\pm\b/g, ' plus or minus '],
  [/\\mp\b/g, ' minus or plus '],
  [/\\leq?\b/g, ' is less than or equal to '],
  [/\\geq?\b/g, ' is greater than or equal to '],
  [/\\neq?\b/g, ' is not equal to '],
  [/\\approx\b/g, ' is approximately '],
  [/\\equiv\b/g, ' is equivalent to '],
  [/\\propto\b/g, ' is proportional to '],
  [/\\(?:to|rightarrow|longrightarrow)\b/g, ' goes to '],
  [/\\(?:Rightarrow|implies)\b/g, ' implies '],
  [/\\in\b/g, ' in '],
  [/\\(?:ldots|cdots|dots)\b/g, ' and so on '],
  [/\\degree\b|\^\\circ/g, ' degrees '],
  [/\\(sin|cos|tan|sec|csc|cot|log|ln|exp|max|min|det)\b/g, ' $1 '],
  [/\\(?:mathrm|text|textbf|mathbf|mathit|operatorname|vec|hat|bar|overline)\{([^{}]*)\}/g, ' $1 ']
]

/** Spoken form of one LaTeX / plain math expression. */
export function speakMath(src: string): string {
  let s = ` ${src} `
  // Structures that take arguments, innermost first (repeat for nesting).
  for (let i = 0; i < 4; i++) {
    s = s
      .replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, ' $1 over $2 ')
      .replace(/\\sqrt\[([^\]]*)\]\{([^{}]*)\}/g, ' the $1th root of $2 ')
      .replace(/\\sqrt\{([^{}]*)\}/g, ' the square root of $1 ')
      .replace(/\\(?:mathrm|text|textbf|mathbf|mathit|operatorname|vec|hat|bar|overline)\{([^{}]*)\}/g, ' $1 ')
  }
  for (const [re, out] of COMMANDS) s = s.replace(re, out)
  s = s.replace(new RegExp(`\\\\(${GREEK.join('|')})\\b`, 'gi'), (_, g: string) => ` ${g.replace(/^var/, '')} `)

  // Powers and subscripts.
  s = s
    .replace(/\^(?:2|\{2\})(?!\w)/g, ' squared ')
    .replace(/\^(?:3|\{3\})(?!\w)/g, ' cubed ')
    .replace(/\^\{([^{}]*)\}/g, ' to the power of $1 ')
    .replace(/\^(-?\w)/g, ' to the power of $1 ')
    .replace(/_\{([^{}]*)\}/g, ' sub $1 ')
    .replace(/_(\w)/g, ' sub $1 ')

  // Operators and symbols. A minus at the start or right after another operator is a sign.
  s = s
    .replace(/(^\s*|[=(,+*/<>]\s*)[−-]\s*(?=[\w\\(])/g, '$1 negative ')
    .replace(/<=|≤/g, ' is less than or equal to ')
    .replace(/>=|≥/g, ' is greater than or equal to ')
    .replace(/!=|≠/g, ' is not equal to ')
    .replace(/==/g, ' equals ')
    .replace(/=/g, ' equals ')
    .replace(/</g, ' is less than ')
    .replace(/>/g, ' is greater than ')
    .replace(/\+/g, ' plus ')
    .replace(/[−-]/g, ' minus ')
    .replace(/[*×·]/g, ' times ')
    .replace(/÷/g, ' divided by ')
    .replace(/\//g, ' over ')
    .replace(/√/g, ' the square root of ')
    .replace(/π/g, ' pi ')
    .replace(/∞/g, ' infinity ')
    .replace(/∫/g, ' the integral of ')
    .replace(/(\d)\s*!/g, '$1 factorial')

  // Leftover LaTeX: drop commands and grouping characters.
  s = s.replace(/\\[a-zA-Z]+/g, ' ').replace(/[{}\\$&]/g, ' ')
  // "dx" at the end of an integral reads better spaced out.
  s = s.replace(/\bd([a-z])\b/g, 'd $1')
  return s.replace(/\s+/g, ' ').trim()
}

/** Plain spoken text for a whole tutor message. */
export function toSpeech(markdown: string): string {
  let s = markdown.replace(/\r\n?/g, '\n')

  // Code blocks aren't readable aloud.
  s = s.replace(/```[\s\S]*?(```|$)/g, ' (see the code block) ')
  // Math: display first, then inline.
  s = s.replace(/\$\$([\s\S]+?)\$\$/g, (_, m: string) => ` ${speakMath(m)}. `)
  s = s.replace(/\\\[([\s\S]+?)\\\]/g, (_, m: string) => ` ${speakMath(m)}. `)
  s = s.replace(/\\\(([\s\S]+?)\\\)/g, (_, m: string) => ` ${speakMath(m)} `)
  s = s.replace(/\$([^$\n]+?)\$/g, (_, m: string) => ` ${speakMath(m)} `)
  // Inline code: say the code, without backticks.
  s = s.replace(/`([^`]+)`/g, '$1')

  // Markdown structure.
  s = s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1') // images
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links
    .replace(/https?:\/\/\S+/g, 'the link')
    .replace(/^\s{0,3}#{1,6}\s+(.*)$/gm, '$1.') // headings
    .replace(/^\s*>\s?/gm, '') // quotes
    .replace(/^\s*[-*+]\s+/gm, '') // bullets
    .replace(/^\s*(\d+)[.)]\s+/gm, '$1, ') // numbered lists
    .replace(/^\s*([-*_]\s*){3,}$/gm, ' ') // rules
    .replace(/\|/g, ', ') // tables
    .replace(/(\*\*|__)(.+?)\1/g, '$2') // bold
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, '$1$2') // italics
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/<[^>]+>/g, ' ') // stray HTML

  // Lines become sentence breaks; leftover symbols go.
  s = s
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => (/[.!?:;,]$/.test(line) ? line : `${line}.`))
    .join(' ')
  s = s.replace(/[*_#`~\\]/g, ' ').replace(/\s+([.,!?;:])/g, '$1')
  return s.replace(/\s+/g, ' ').replace(/\.{2,}/g, '.').trim()
}

/** Split into sentence-sized pieces: long utterances get cut off by some speech engines. */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text]
  const out: string[] = []
  let cur = ''
  for (const raw of sentences) {
    const s = raw.trim()
    if (!s) continue
    if (s.length > max) {
      if (cur) out.push(cur)
      cur = ''
      // Very long sentence: break at commas or spaces.
      let rest = s
      while (rest.length > max) {
        const cut = Math.max(rest.lastIndexOf(', ', max), rest.lastIndexOf(' ', max))
        const at = cut > max / 2 ? cut + 1 : max
        out.push(rest.slice(0, at).trim())
        rest = rest.slice(at).trim()
      }
      cur = rest
    } else if ((cur + ' ' + s).trim().length > max) {
      out.push(cur)
      cur = s
    } else {
      cur = (cur + ' ' + s).trim()
    }
  }
  if (cur) out.push(cur)
  return out
}
