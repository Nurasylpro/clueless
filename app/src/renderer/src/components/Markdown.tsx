import katex from 'katex'
import { parse } from 'mathjs'
import ReactMarkdown from 'react-markdown'
import rehypeKatex from 'rehype-katex'
import remarkMath from 'remark-math'
import { normalize } from '../../../shared/mathText'

/** Tutor messages: Markdown with $...$ math. */
export function Markdown({ text }: { text: string }) {
  return (
    <div className="md selectable text-[13.5px] leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

/** Render what the student typed as math, e.g. "x^2 e^x - 2x e^x + 2e^x + C". Null if it doesn't parse. */
export function mathToHtml(input: string): string | null {
  const text = input.trim()
  if (!text) return null
  try {
    const tex = parse(normalize(text)).toTex({ implicit: 'hide', parenthesis: 'auto' })
    return katex.renderToString(tex, { throwOnError: false, output: 'html' })
  } catch {
    return null
  }
}

export function MathText({ input, className }: { input: string; className?: string }) {
  const html = mathToHtml(input)
  if (!html) return <span className={className}>{input}</span>
  return <span className={className} dangerouslySetInnerHTML={{ __html: html }} />
}
