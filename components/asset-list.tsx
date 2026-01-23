'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { SongAsset } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { RefreshIcon, Download01Icon, Delete02Icon } from '@hugeicons/core-free-icons'

interface AssetListProps {
  assets: SongAsset[]
}

export function AssetList({ assets }: AssetListProps) {
  const router = useRouter()
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null)

  async function handleDeleteConfirm() {
    if (!pendingDelete) return

    setDeletingId(pendingDelete.id)
    try {
      const response = await fetch(`/api/song-assets/${pendingDelete.id}`, {
        method: 'DELETE',
      })
      if (response.ok) {
        router.refresh()
      }
    } finally {
      setDeletingId(null)
      setPendingDelete(null)
    }
  }

  async function handleReExtract(assetId: string) {
    try {
      await fetch(`/api/song-assets/${assetId}/extract`, {
        method: 'POST',
      })
      router.refresh()
    } catch (err) {
      console.error('Re-extract failed:', err)
    }
  }

  const statusColors = {
    uploaded: 'secondary',
    extracting: 'secondary',
    extracted: 'default',
    failed: 'destructive',
  } as const

  return (
    <>
      <ul className="space-y-3">
        {assets.map((asset) => (
          <li key={asset.id} className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={asset.original_filename}>
                {asset.original_filename}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant={statusColors[asset.extract_status]} className="text-xs">
                  {asset.extract_status}
                </Badge>
                <span className="text-xs text-muted-foreground capitalize">
                  {asset.asset_type.replace('_', ' ')}
                </span>
              </div>
              {asset.extract_warning && (
                <p className="text-xs text-destructive mt-1">
                  {asset.extract_warning}
                </p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              {asset.extract_status === 'failed' && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => handleReExtract(asset.id)}
                  title="Retry extraction"
                >
                  <HugeiconsIcon icon={RefreshIcon} strokeWidth={2} className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => window.open(`/api/song-assets/${asset.id}/download`, '_blank')}
                title="Download original"
              >
                <HugeiconsIcon icon={Download01Icon} strokeWidth={2} className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setPendingDelete({ id: asset.id, name: asset.original_filename })}
                disabled={deletingId === asset.id}
                className="text-muted-foreground hover:text-destructive"
                title="Delete"
              >
                <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} className="h-3.5 w-3.5" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      <AlertDialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => {
          if (!open) {
            setPendingDelete(null)
          }
        }}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this file?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.name ?? 'This file'} will be removed permanently. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel size="sm" disabled={Boolean(deletingId)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              size="sm"
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={Boolean(deletingId)}
            >
              {deletingId ? 'Deleting...' : 'Delete file'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
