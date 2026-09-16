import { useEffect, useId, useRef, useState } from 'react'

export default function AgentActions({
  name,
  disabled,
  canMerge,
  onMerge,
  onDismiss,
}: {
  name: string
  disabled: boolean
  canMerge: boolean
  onMerge: () => void
  onDismiss: () => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    container.current?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')?.focus()
    const closeOutside = (event: PointerEvent): void => {
      if (event.target instanceof Node && !container.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [open])

  return (
    <div
      ref={container}
      className="agent-overflow"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          setOpen(false)
          trigger.current?.focus()
        }
        if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const items = [
          ...(container.current?.querySelectorAll<HTMLElement>(
            '[role="menuitem"]:not(:disabled)',
          ) ?? []),
        ]
        const current = items.findIndex((item) => item === document.activeElement)
        const index =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? items.length - 1
              : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
        items[index]?.focus()
      }}
    >
      <button
        ref={trigger}
        className="overflow-trigger"
        disabled={disabled}
        aria-label={`More actions for ${name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open && (
        <div id={menuId} role="menu" aria-label={`Actions for ${name}`} className="overflow-menu">
          <button
            role="menuitem"
            tabIndex={-1}
            disabled={!canMerge || disabled}
            onClick={() => {
              setOpen(false)
              trigger.current?.focus()
              onMerge()
            }}
          >
            Merge with another Agent
          </button>
          <button
            role="menuitem"
            tabIndex={-1}
            disabled={disabled}
            className="danger-action"
            onClick={() => {
              setOpen(false)
              onDismiss()
            }}
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  )
}
