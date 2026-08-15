import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useProductImage } from '@/lib/product-image'

interface ProductThumbProps {
  productId: number
  hasImage: boolean
  name: string
  className?: string
  iconClassName?: string
}

// Thumbnail for a product photo. The photo is stored in the shared database, so
// it is loaded through the API (works the same on the primary PC and on an
// access terminal) and falls back to the box icon while it loads or if there is
// no photo.
export function ProductThumb({
  productId,
  hasImage,
  name,
  className,
  iconClassName
}: ProductThumbProps): React.JSX.Element {
  const src = useProductImage(productId, hasImage)

  if (src) {
    return <img src={src} alt={name} className={cn('h-8 w-8 rounded object-cover', className)} />
  }
  return (
    <div className={cn('h-8 w-8 rounded bg-muted flex items-center justify-center', className)}>
      <Package className={cn('h-4 w-4 text-muted-foreground', iconClassName)} />
    </div>
  )
}
