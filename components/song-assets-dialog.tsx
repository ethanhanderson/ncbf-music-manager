'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UploadAssetForm } from '@/components/upload-asset-form'
import { AssetList } from '@/components/asset-list'
import type { SongAsset } from '@/lib/supabase/server'
import { HugeiconsIcon } from '@hugeicons/react'
import { FolderUploadIcon } from '@hugeicons/core-free-icons'

interface SongAssetsDialogProps {
  songId: string
  assets: SongAsset[]
  trigger?: React.ReactElement
}

export function SongAssetsDialog({ songId, assets, trigger }: SongAssetsDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('upload')

  const lyricsAssets = assets.filter(a => a.asset_type === 'lyrics_source')
  const otherAssets = assets.filter(a => a.asset_type !== 'lyrics_source')

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger
        nativeButton={!trigger}
        render={trigger || <Button variant="outline" size="sm" />}
      >
        {!trigger && (
          <>
            <HugeiconsIcon icon={FolderUploadIcon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Files & Uploads
          </>
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Song Files</DialogTitle>
          <DialogDescription>
            Upload lyrics files to generate slides, or manage existing uploads.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="w-full">
            <TabsTrigger value="upload" className="flex-1">Upload Lyrics File</TabsTrigger>
            <TabsTrigger value="files" className="flex-1">
              Uploaded Files
              {assets.length > 0 && (
                <span className="ml-1.5 rounded-none bg-muted-foreground/20 px-1.5 py-0.5 text-[10px] font-medium">
                  {assets.length}
                </span>
              )}
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value="upload" className="pt-4">
            <UploadAssetForm songId={songId} assetType="lyrics_source" />
          </TabsContent>
          
          <TabsContent value="files" className="pt-4">
            {assets.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground text-sm">No files uploaded yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {lyricsAssets.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Lyrics Files</h4>
                    <AssetList assets={lyricsAssets} />
                  </div>
                )}
                {otherAssets.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium mb-2">Other Files</h4>
                    <AssetList assets={otherAssets} />
                  </div>
                )}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <DialogClose nativeButton render={<Button variant="outline" />}>Close</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
