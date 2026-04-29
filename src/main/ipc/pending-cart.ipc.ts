import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { PendingCartService, CreatePendingCartDTO } from '../services/pending-cart.service'

export function registerPendingCartHandlers(db: Database.Database): void {
  const service = new PendingCartService(db)

  ipcMain.handle('pending-carts:create', (_event, data: CreatePendingCartDTO) => {
    return service.create(data)
  })

  ipcMain.handle('pending-carts:getAll', () => {
    return service.getAll()
  })

  ipcMain.handle('pending-carts:delete', (_event, id: number) => {
    service.delete(id)
  })
}
