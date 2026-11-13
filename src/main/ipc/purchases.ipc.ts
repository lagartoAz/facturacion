import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { PurchaseService } from '../services/purchase.service'
import type { CreatePurchaseDTO, PurchaseFilters } from '../services/purchase.service'
import { getBackupService } from '../services/backup.service'

export function registerPurchaseHandlers(db: Database.Database): void {
  const service = new PurchaseService(db)

  ipcMain.handle('purchases:supplierProducts', (_event, supplierId: number) => {
    return service.getSupplierProducts(supplierId)
  })

  ipcMain.handle('purchases:create', (_event, data: CreatePurchaseDTO) => {
    const result = service.create(data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('purchases:getAll', (_event, filters?: PurchaseFilters) => {
    return service.getAll(filters)
  })

  ipcMain.handle('purchases:count', (_event, filters?: PurchaseFilters) => {
    return service.count(filters)
  })

  ipcMain.handle('purchases:bySupplier', (_event, supplierId: number) => {
    return service.getBySupplier(supplierId)
  })

  ipcMain.handle('purchases:getById', (_event, id: number) => {
    return service.getById(id)
  })
}
