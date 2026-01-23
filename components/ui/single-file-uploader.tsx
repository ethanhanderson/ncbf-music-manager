"use client"

import { useMemo } from "react"
import { AlertCircleIcon, Loader2Icon, PaperclipIcon, UploadIcon, XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { formatBytes, useFileUpload, type FileWithPreview } from "@/hooks/use-file-upload"
import { Button } from "@/components/ui/button"

interface SingleFileUploaderProps {
  accept?: string
  maxSize?: number
  disabled?: boolean
  isBusy?: boolean
  helpText?: string
  onFileSelected?: (file: File) => void
  onFileCleared?: () => void
}

export function SingleFileUploader({
  accept = "*",
  maxSize = 10 * 1024 * 1024,
  disabled = false,
  isBusy = false,
  helpText,
  onFileSelected,
  onFileCleared,
}: SingleFileUploaderProps) {
  const [{ files, isDragging, errors }, actions] = useFileUpload({
    accept,
    maxSize,
    onFilesAdded: (addedFiles: FileWithPreview[]) => {
      const first = addedFiles[0]?.file
      if (first instanceof File) {
        onFileSelected?.(first)
      }
    },
  })

  const file = files[0]
  const inputDisabled = disabled || isBusy || Boolean(file)

  const maxSizeLabel = useMemo(() => formatBytes(maxSize), [maxSize])

  return (
    <div className="flex flex-col gap-2">
      <div
        className={cn(
          "flex min-h-40 flex-col items-center justify-center rounded-none border border-border border-dashed p-4 transition-colors",
          "hover:bg-muted/40 data-[dragging=true]:bg-muted/40",
          "has-disabled:pointer-events-none has-disabled:opacity-60",
          "has-[input:focus]:border-ring has-[input:focus]:ring-[3px] has-[input:focus]:ring-ring/50",
          isBusy && "pointer-events-none opacity-60"
        )}
        data-dragging={isDragging || undefined}
        onClick={() => !inputDisabled && actions.openFileDialog()}
        onDragEnter={actions.handleDragEnter}
        onDragLeave={actions.handleDragLeave}
        onDragOver={actions.handleDragOver}
        onDrop={actions.handleDrop}
        role="button"
        tabIndex={-1}
      >
        <input
          {...actions.getInputProps({
            disabled: inputDisabled,
            "aria-label": "Upload file",
            className: "sr-only",
          })}
        />

        <div className="flex flex-col items-center justify-center text-center">
          <div
            aria-hidden="true"
            className="mb-2 grid size-10 place-items-center border bg-muted/30"
          >
            {isBusy ? (
              <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
            ) : (
              <UploadIcon className="size-4 text-muted-foreground" />
            )}
          </div>

          <p className="mb-1.5 text-sm font-medium">{isBusy ? "Processing…" : "Upload file"}</p>
          <p className="text-xs text-muted-foreground">
            Drag & drop or click to browse (max. {maxSizeLabel})
          </p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="flex items-center gap-1 text-xs text-destructive" role="alert">
          <AlertCircleIcon className="size-3 shrink-0" />
          <span>{errors[0]}</span>
        </div>
      )}

      {file && (
        <div
          className="flex items-center justify-between gap-2 rounded-none border border-border px-4 py-2"
          key={file.id}
        >
          <div className="flex min-w-0 items-center gap-3 overflow-hidden">
            <PaperclipIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <p className="truncate text-[13px] font-medium">{file.file.name}</p>
          </div>

          <Button
            aria-label="Remove file"
            className="-me-2 size-8 text-muted-foreground/80 hover:bg-transparent hover:text-foreground"
            onClick={() => {
              if (files[0]?.id) actions.removeFile(files[0].id)
              onFileCleared?.()
            }}
            size="icon"
            variant="ghost"
            disabled={isBusy}
          >
            <XIcon aria-hidden="true" className="size-4" />
          </Button>
        </div>
      )}

      {helpText && <p className="text-xs text-muted-foreground">{helpText}</p>}
    </div>
  )
}

