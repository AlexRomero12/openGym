// "Ask the Coach" — the question sheet of the Coach chat.
//
// Kept separate from the composer on purpose: a typed message in the chat still means "change
// my plan" (the review path), and quietly rerouting a question to a different job would make
// the whole thread unpredictable. This sheet says what it does.
//
// `initialEx` is the "ask about an exercise" flow: the picker is already behind the lifter, so
// the sheet opens with the exercise selected and the question written out, and all that is left
// is confirming it. Inside the sheet the selected exercise is a checked row, not a label change,
// and re-picking one updates the question as long as it is still the one this sheet generated.
import { useRef, useState } from 'react'
import { Row, Button } from './ui.jsx'
import Icon from './Icon.jsx'
import { exercisePicker } from '../sheets.jsx'
import { t } from '../lib/i18n.js'
import { exName } from '../lib/coach.js'
import { requestAsk } from '../lib/coach-api.js'

const autoQuestion = ex => t('How is my {0} going? What is my estimated 1RM?', exName(ex.id))

export default function AskSheet({ close, ask, initialEx = null }) {
  const [ex, setEx] = useState(initialEx || null)
  const [text, setText] = useState(() => (initialEx ? autoQuestion(initialEx) : ''))
  // True while the textarea holds the question this sheet wrote, so picking a different
  // exercise replaces it but anything the lifter typed is never overwritten.
  const auto = useRef(!!initialEx)

  const pick = () => {
    let h
    h = exercisePicker(picked => {
      h?.close?.()
      setEx(picked)
      if (auto.current || !text.trim()) {
        setText(autoQuestion(picked))
        auto.current = true
      }
    })
  }
  const clearEx = () => {
    setEx(null)
    if (auto.current) { setText(''); auto.current = false }
  }
  const go = () => {
    const q = text.trim()
    if (!q) return
    close()
    ask(() => requestAsk(q, ex?.id || null), ex ? t('{0}: {1}', exName(ex.id), q) : q)
  }
  return <>
    <h3>{t('Ask the Coach')}</h3>
    <div className="sect-b">
      {ex
        ? <Row icon="checkCircle" iconTint="var(--green)" title={exName(ex.id)}
            subtitle={t('The answer will use its numbers — tap to change')} accessory="chevron" onClick={pick} />
        : <Row icon="magnifier" iconTint="var(--teal)" title={t('Any exercise (optional)')}
            subtitle={t('Focus the question on one exercise')} accessory="chevron" onClick={pick} />}
    </div>
    <textarea className="chat-ask" rows={3} maxLength={1000} value={text}
      placeholder={t('What do you want to know?')}
      onChange={e => { auto.current = false; setText(e.target.value) }} />
    <div style={{ height: 10 }} />
    <div className="ask-actions">
      <Button variant="primary" icon="arrowUp" onClick={go} disabled={!text.trim()}>{t('Ask')}</Button>
      {ex && <Button variant="ghost" onClick={clearEx}>{t('Remove exercise')}</Button>}
    </div>
    <div style={{ height: 8 }} />
  </>
}
