import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { InvoiceService } from '../services/invoice.service'
import type { CreateInvoiceDTO, InvoiceFilters } from '../services/invoice.service'
import { getBackupService } from '../services/backup.service'

export function registerInvoiceHandlers(db: Database.Database): void {
  const service = new InvoiceService(db)

  ipcMain.handle('invoices:create', (_event, data: CreateInvoiceDTO) => {
    const result = service.create(data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('invoices:getAll', (_event, filters?: InvoiceFilters) => {
    return service.getAll(filters)
  })

  ipcMain.handle('invoices:getById', (_event, id: number) => {
    return service.getById(id)
  })

  ipcMain.handle('invoices:void', (_event, id: number) => {
    service.void(id)
    getBackupService().schedule()
  })
}
