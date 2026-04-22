import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { CustomerService } from '../services/customer.service'
import type { CreateCustomerDTO, UpdateCustomerDTO } from '../services/customer.service'

export function registerCustomerHandlers(db: Database.Database): void {
  const service = new CustomerService(db)

  ipcMain.handle('customers:getAll', (_event, search?: string) => {
    return service.getAll(search)
  })

  ipcMain.handle('customers:create', (_event, data: CreateCustomerDTO) => {
    return service.create(data)
  })

  ipcMain.handle('customers:update', (_event, id: number, data: UpdateCustomerDTO) => {
    return service.update(id, data)
  })

  ipcMain.handle('customers:delete', (_event, id: number) => {
    service.delete(id)
  })
}
