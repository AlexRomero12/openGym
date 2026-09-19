// Draws the Coach's mini-format (lib/rich-text.js) as real elements.
//
// Every string is a React child, so anything that is not a marker is escaped and shown as
// text — model output can never become markup. The class names live in coach.css next to the
// bubbles that use this, and `.rt` renders exactly like the plain `{m.text}` bubbles did when
// there is no marker in the string.
import { parseRichText } from '../lib/rich-text.js'

const span = (s, i) => s.b ? <b key={i}>{s.text}</b> : s.i ? <i key={i}>{s.text}</i> : <span key={i}>{s.text}</span>

export default function RichText({ text, className, style }) {
  const blocks = parseRichText(text)
  if (!blocks.length) return null
  return <div className={'rt' + (className ? ' ' + className : '')} style={style}>
    {blocks.map((b, i) => b.type === 'h'
      ? <div key={i} className="rt-h">{b.spans.map(span)}</div>
      : b.type === 'ul'
        ? <ul key={i}>{b.items.map((it, j) => <li key={j}>{it.map(span)}</li>)}</ul>
        : <p key={i}>{b.spans.map(span)}</p>)}
  </div>
}
