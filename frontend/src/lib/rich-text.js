// The Coach's mini-format, and the only thing that decides how a model's prose is drawn.
//
// Plain text was the whole story until now: the model was told to write plainly because every
// bubble renders its string verbatim, and markdown syntax (`**bold**`) would have shown up as
// asterisks. This module is the contract that lets the answers carry emphasis instead: a tiny,
// closed inline syntax the model is told about in api/coach/prompts/common.md, parsed here
// into blocks and spans, and drawn by components/RichText.jsx as real elements.
//
// It is deliberately not markdown and deliberately not HTML:
//   - React elements only — nothing here produces a string of markup, so an answer can never
//     inject anything into the page.
//   - A marker that is not closed stays literal text. Bad generation shows a stray `**`, it
//     never eats the sentence around it.
//   - No nesting, no links, no images: a small local model can hold all of this in its head,
//     and every added rule is one more way for an answer to arrive malformed.
//
// Syntax:
//   **bold**        inline
//   *italic*        inline
//   ## Heading      alone on a line, drawn as the app's uppercase section label
//   - item          a line starting with "- " or "• ", grouped into a list
//   blank line      paragraph break (consecutive plain lines keep their line breaks)
const HEAD = /^##\s+(.+)$/
const BULLET = /^\s*[-•]\s+(.+)$/
// Bold is tried before italic so `**` cannot be read as two single asterisks. Neither group
// may cross a newline: a marker left open at the end of a line renders literally, which is the
// failure mode a person can still read.
const INLINE = /(\*\*([^*\n]+)\*\*|\*([^*\n]+)\*)/g

/** One line (or paragraph) of text into spans: `{ text, b?, i? }`. */
export function richSpans(text) {
  const out = []
  const src = String(text == null ? '' : text)
  let last = 0
  let m
  INLINE.lastIndex = 0
  while ((m = INLINE.exec(src))) {
    if (m.index > last) out.push({ text: src.slice(last, m.index) })
    if (m[2] != null) out.push({ text: m[2], b: true })
    else out.push({ text: m[3], i: true })
    last = INLINE.lastIndex
  }
  if (last < src.length) out.push({ text: src.slice(last) })
  return out
}

/**
 * The whole string into blocks: `{ type:'p'|'h', spans }` and `{ type:'ul', items:[spans] }`.
 * Consecutive plain lines are one `p` with their newlines intact, so an answer's own line
 * breaks survive rendering; a blank line starts a new paragraph.
 */
export function parseRichText(text) {
  const src = String(text == null ? '' : text).replace(/\r\n?/g, '\n')
  const blocks = []
  let para = []
  let list = null
  const closePara = () => {
    if (para.length) { blocks.push({ type: 'p', spans: richSpans(para.join('\n')) }); para = [] }
  }
  const closeList = () => {
    if (list) { blocks.push({ type: 'ul', items: list }); list = null }
  }
  for (const raw of src.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) { closePara(); closeList(); continue }
    const h = HEAD.exec(line.trimStart())
    if (h) { closePara(); closeList(); blocks.push({ type: 'h', spans: richSpans(h[1]) }); continue }
    const li = BULLET.exec(line)
    if (li) { closePara(); (list = list || []).push(richSpans(li[1])); continue }
    closeList()
    para.push(line.trim())
  }
  closePara()
  closeList()
  return blocks
}

/** The same text without any markers — history rows, toasts and titles. */
export function plainRichText(text) {
  return parseRichText(text).map(b => b.type === 'ul'
    ? b.items.map(richLine).join(' · ')
    : richLine(b.spans)
  ).join('\n')
}
const richLine = spans => (spans || []).map(s => s.text).join('')
