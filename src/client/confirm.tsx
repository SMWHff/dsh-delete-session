/**
 * The delete-session confirmation surface, mirroring the ui-workspace
 * delete-workspace dialog structure exactly: a standard Modal with the
 * warning description, an outline danger confirm button, the in-flight
 * "deleting" status inside the dialog body, and errors inside the dialog
 * body (role="alert"). Success needs no toast: the session disappears from
 * the list, which is the feedback itself.
 */
import { useEffect, useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import { fmt, type DeleteSessionKey } from './locales.ts'

type DeleteTranslate = (key: DeleteSessionKey, params?: Record<string, unknown>) => string

/** One pending deletion: the row the user asked to delete. */
export interface DeleteTarget {
  name: string
  sessionId: string
}

export interface DeleteConfirmDialogProps {
  /** The pending deletion; null hides the dialog. */
  target: DeleteTarget | null
  /** The delete-session namespace translation seat. */
  t: DeleteTranslate
  /** Close the dialog (cancel, mask click, or Escape). */
  onClose: () => void
  /** Perform the deletion for one exact session id; rejects on failure. */
  onConfirm: (sessionId: string) => Promise<void>
}

/**
 * Render the confirmation dialog.
 * @returns the dialog (portal), or nothing while no target is pending.
 */
export function DeleteConfirmDialog({ target, t, onClose, onConfirm }: DeleteConfirmDialogProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Every new target re-arms the dialog.
  useEffect(() => {
    if (target !== null) {
      setDeleting(false)
      setError(null)
    }
  }, [target])

  const confirm = async (): Promise<void> => {
    if (target === null || deleting) return
    setDeleting(true)
    setError(null)
    try {
      await onConfirm(target.sessionId)
      onClose()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause)
      setError(t('error.failed', { message }))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Modal
      open={target !== null}
      onClose={onClose}
      closeLabel={t('confirm.cancel')}
      title={t('confirm.title')}
      {...(target === null ? {} : { description: fmt(t('confirm.desc'), { name: target.name }) })}
      footer={
        <>
          <Button variant="outline" disabled={deleting} onClick={onClose}>
            {t('confirm.cancel')}
          </Button>
          <Button
            variant="outline"
            className="dsh-delete-session-danger"
            disabled={deleting}
            onClick={() => { void confirm() }}
          >
            {t('confirm.ok')}
          </Button>
        </>
      }
    >
      {deleting && (
        <div className="dsh-delete-session-status" role="status">
          {t('confirm.pending')}
        </div>
      )}
      {error !== null && (
        <div className="dsh-delete-session-error" role="alert">
          {error}
        </div>
      )}
    </Modal>
  )
}
