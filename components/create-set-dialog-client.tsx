'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import type { CreateSetDialogProps } from '@/components/create-set-dialog'

const CreateSetDialog = dynamic(
  () => import('@/components/create-set-dialog').then((mod) => ({ default: mod.CreateSetDialog })),
  { ssr: false }
)

export function CreateSetDialogClient(props: CreateSetDialogProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return null
  }

  return <CreateSetDialog {...props} />
}
