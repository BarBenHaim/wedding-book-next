// What waits for an approval, at the top of the home screen: replies to
// customers, sign samples and a failed model. Draws buildToday().waiting
// (lib/adminToday); sending goes through /api/admin/customers, which owns the
// send rules.

import { AlertTriangle, ClipboardCheck, ExternalLink, FileText, Image as ImageIcon, Send } from 'lucide-react'
import { Panel } from '../ui/kit'
import k from '../ui/kit.module.css'
import s from './waiting.module.css'

const ICON = { claude: AlertTriangle, draft: FileText, sample: ImageIcon, draw: ImageIcon }

// The question and the body of an approval.
export const approval = task => (task.kind === 'sample'
    ? { body: { op: 'sample', id: task.id, decision: 'send' }, question: 'לשלוח את הדוגמה הזאת לליד?' }
    : { body: { op: 'draft', number: task.id, decision: 'send' }, question: `לשלוח את התשובה?\n\n${task.detail}` })

export default function Waiting({ tasks, busy, onApprove, onOpen }) {
    if (!tasks?.length) return null
    return (
        <Panel title={`ממתינים לאישור (${tasks.length})`} Icon={ClipboardCheck}>
            <ul className={s.tasks}>
                {tasks.map(task => {
                    const Icon = ICON[task.kind] || FileText
                    return (
                        <li key={`${task.kind}-${task.id}`} className={s.task}>
                            <button type='button' className={s.taskOpen} onClick={() => onOpen(task)}>
                                <span className={s.taskIcon}><Icon size={28} strokeWidth={1.9} aria-hidden='true' /></span>
                                <span className={s.taskText}>
                                    <b>{task.title}</b>
                                    {task.detail && <small>{task.detail}</small>}
                                </span>
                                {task.image && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={task.image} alt='הדוגמה' className={s.thumb} />
                                )}
                            </button>
                            {task.canApprove
                                ? <button type='button' className={k.button} disabled={busy} onClick={() => onApprove(task)}><Send size={20} aria-hidden='true' />אשר ושלח</button>
                                : <button type='button' className={k.button} onClick={() => onOpen(task)}><ExternalLink size={20} aria-hidden='true' />פתח</button>}
                        </li>
                    )
                })}
            </ul>
        </Panel>
    )
}
