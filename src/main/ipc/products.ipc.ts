import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ProductService } from '../services/product.service'
import type { CreateProductDTO, UpdateProductDTO, ProductFilters } from '../services/product.service'

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
    return service.create(data)
  })

  ipcMain.handle('products:update', (_event, id: number, data: UpdateProductDTO) => {
    return service.update(id, data)
  })

  ipcMain.handle('products:toggleActive', (_event, id: number) => {
    service.toggleActive(id)
  })

  ipcMain.handle('categories:getAll', () => {
    return service.getCategories()
  })

  ipcMain.handle('categories:create', (_event, name: string) => {
    return service.createCategory(name)
  })
}
