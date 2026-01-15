"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { updateGroup } from "@/lib/actions/groups"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover"
import { HugeiconsIcon } from "@hugeicons/react"
import { Edit01Icon } from "@hugeicons/core-free-icons"

interface RenameGroupPopoverProps {
  groupId: string
  groupName: string
}

export function RenameGroupPopover({ groupId, groupName }: RenameGroupPopoverProps) {
  const [open, setOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState(groupName)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const router = useRouter()

  useEffect(() => {
    setName(groupName)
  }, [groupName])

  useEffect(() => {
    if (open) {
      setName(groupName)
      setError(null)
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open, groupName])

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsLoading(true)
    setError(null)

    const formData = new FormData()
    formData.set("name", name.trim())

    const result = await updateGroup(groupId, formData)
    if (result.success) {
      setOpen(false)
      router.refresh()
    } else {
      setError(result.error || "Failed to rename group")
    }

    setIsLoading(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm">
            <HugeiconsIcon icon={Edit01Icon} strokeWidth={2} className="mr-1.5 h-4 w-4" />
            Rename
          </Button>
        }
      />
      <PopoverContent align="end" className="w-80 p-4">
        <PopoverHeader className="space-y-1">
          <PopoverTitle>Rename group</PopoverTitle>
          <PopoverDescription>Update the display name for this group.</PopoverDescription>
        </PopoverHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              name="name"
              ref={inputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g., Morning Worship Team"
              required
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
