import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { SupplierService } from '../services/supplier.service'
import type { CreateSupplierDTO, UpdateSupplierDTO } from '../services/supplier.service'
import { getBackupService } from '../services/backup.service'

export function registerSupplierHandlers(db: Database.Database): void {
  const service = new SupplierService(db)

  ipcMain.handle('suppliers:getAll', (_event, search?: string) => {
    return service.getAll(search)
  })

  ipcMain.handle('suppliers:getById', (_event, id: number) => {
    return service.getById(id)
  })

  ipcMain.handle('suppliers:create', (_event, data: CreateSupplierDTO) => {
    const result = service.create(data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('suppliers:update', (_event, id: number, data: UpdateSupplierDTO) => {
    const result = service.update(id, data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('suppliers:delete', (_event, id: number) => {
    const result = service.delete(id)
    getBackupService().schedule()
    return result
  })
}
