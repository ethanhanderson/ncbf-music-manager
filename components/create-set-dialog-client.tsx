'use client'

import dynamic from 'next/dynamic'
import type { ComponentProps } from 'react'

const CreateSetDialog = dynamic(
  () => import('@/components/create-set-dialog').then((mod) => ({ default: mod.CreateSetDialog })),
  { ssr: false }
)

type CreateSetDialogProps = ComponentProps<typeof import('@/components/create-set-dialog').CreateSetDialog>

export function CreateSetDialogClient(props: CreateSetDialogProps) {
  return <CreateSetDialog {...props} />
}
