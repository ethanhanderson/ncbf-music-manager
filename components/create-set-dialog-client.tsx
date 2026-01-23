'use client'

import { useEffect, useState, type ComponentType } from 'react'
import type { CreateSetDialogProps } from '@/components/create-set-dialog'

export function CreateSetDialogClient(props: CreateSetDialogProps) {
  const [Component, setComponent] = useState<ComponentType<CreateSetDialogProps> | null>(null)

  useEffect(() => {
    let isMounted = true
    void import('@/components/create-set-dialog').then((mod) => {
      if (isMounted) {
        setComponent(() => mod.CreateSetDialog)
      }
    })
    return () => {
      isMounted = false
    }
  }, [])

  if (!Component) {
    return null
  }

  return <Component {...props} />
}
