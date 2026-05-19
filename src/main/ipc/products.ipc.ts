import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ProductService } from '../services/product.service'
import type { CreateProductDTO, UpdateProductDTO, ProductFilters } from '../services/product.service'
import { getBackupService } from '../services/backup.service'

export function registerProductHandlers(db: Database.Database): void {
  const service = new ProductService(db)

  ipcMain.handle('products:getAll', (_event, filters?: ProductFilters) => {
    return service.getAll(filters)
  })

  ipcMain.handle('products:getByBarcode', (_event, barcode: string) => {
    return service.getByBarcode(barcode)
  })

  ipcMain.handle('products:search', (_event, query: string) => {
    return service.search(query)
  })

  ipcMain.handle('products:create', (_event, data: CreateProductDTO) => {
    const result = service.create(data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('products:update', (_event, id: number, data: UpdateProductDTO) => {
    const result = service.update(id, data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('products:toggleActive', (_event, id: number) => {
    service.toggleActive(id)
    getBackupService().schedule()
  })

  ipcMain.handle('products:saveImage', (_event, productId: number, imageData: string, extension: string) => {
    return service.saveImage(productId, imageData, extension)
  })

  ipcMain.handle('products:removeImage', (_event, productId: number) => {
    service.removeImage(productId)
  })

  ipcMain.handle('products:getImagesDir', () => {
    return service.getImagesDir()
  })

  ipcMain.handle('categories:getAll', () => {
    return service.getCategories()
  })

  ipcMain.handle('categories:create', (_event, name: string) => {
    const result = service.createCategory(name)
    getBackupService().schedule()
    return result
  })
}
