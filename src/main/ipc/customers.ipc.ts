import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { CustomerService } from '../services/customer.service'
import type { CreateCustomerDTO, UpdateCustomerDTO } from '../services/customer.service'
import { getBackupService } from '../services/backup.service'

export function registerCustomerHandlers(db: Database.Database): void {
  const service = new CustomerService(db)

  ipcMain.handle('customers:getAll', (_event, search?: string) => {
    return service.getAll(search)
  })

  ipcMain.handle('customers:create', (_event, data: CreateCustomerDTO) => {
    const result = service.create(data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('customers:update', (_event, id: number, data: UpdateCustomerDTO) => {
    const result = service.update(id, data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('customers:delete', (_event, id: number) => {
    service.delete(id)
    getBackupService().schedule()
  })

  ipcMain.handle('customers:getBalance', (_event, id: number) => {
    return service.getBalance(id)
  })

  ipcMain.handle('customers:getBalances', () => {
    return service.getBalances()
  })

  ipcMain.handle('customers:getCreditInvoices', (_event, id: number) => {
    return service.getCreditInvoices(id)
  })

  ipcMain.handle('customers:addPayment', (_event, id: number, amount: number, notes?: string) => {
    const result = service.addPayment(id, amount, notes)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('customers:getPayments', (_event, id: number) => {
    return service.getPayments(id)
  })
}
