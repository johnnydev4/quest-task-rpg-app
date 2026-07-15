import { useEffect, useMemo, useRef, useState } from 'react'
import type { Attachment } from '../../../db/types'
import { createAttachment, deleteAttachment } from '../../../db/repo/attachments'

interface AttachmentSectionProps {
  taskId: string
  attachments: Attachment[]
}

function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  const isImage = attachment.mimeType.startsWith('image/')
  const url = useMemo(() => URL.createObjectURL(attachment.blob), [attachment.blob])
  useEffect(() => () => URL.revokeObjectURL(url), [url])

  return (
    <div className="group relative">
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="block overflow-hidden rounded-lg border border-line/10 glass-input"
        aria-label={`Abrir ${attachment.name}`}
      >
        {isImage ? (
          <img src={url} alt={attachment.name} className="h-20 w-full object-cover" />
        ) : (
          <div className="flex h-20 flex-col items-center justify-center gap-1 px-2">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="size-6 text-ink-muted" aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <path d="M14 2v6h6" />
            </svg>
            <span className="w-full truncate text-center text-[10px] text-ink-faint">{attachment.name}</span>
          </div>
        )}
      </a>
      <button
        onClick={() => deleteAttachment(attachment.id)}
        aria-label={`Eliminar ${attachment.name}`}
        className="absolute -top-1.5 -right-1.5 flex size-5 items-center justify-center rounded-full bg-surface-900 text-ink-muted opacity-0 shadow transition-opacity group-hover:opacity-100 hover:text-danger focus:opacity-100"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="size-3" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  )
}

export function AttachmentSection({ taskId, attachments }: AttachmentSectionProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)

  async function onFiles(files: FileList | null) {
    if (!files) return
    setError(null)
    for (const file of Array.from(files)) {
      try {
        await createAttachment(taskId, file)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo adjuntar el archivo')
      }
    }
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="space-y-2">
      {attachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {attachments.map((a) => (
            <AttachmentThumb key={a.id} attachment={a} />
          ))}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.txt,.md"
        onChange={(e) => onFiles(e.target.files)}
        className="hidden"
        aria-label="Adjuntar archivos"
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-line/15 px-3 py-1.5 text-xs text-ink-muted transition-colors hover:border-line/30 hover:text-ink-dim"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3.5" aria-hidden="true">
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        Adjuntar imagen o archivo
      </button>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
