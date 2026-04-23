import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { CashRegisterService } from '../services/cash-register.service'

export function registerCashRegisterHandlers(db: Database.Database): void {
  const service = new CashRegisterService(db)

  ipcMain.handle('cash-register:getCurrent', () => {
    return service.getCurrent()
  })

  ipcMain.handle('cash-register:open', (_event, amount: number, notes?: string) => {
    return service.open(amount, notes)
  })

  ipcMain.handle('cash-register:close', (_event, countedAmount: number, notes?: string) => {
    return service.close(countedAmount, notes)
  })

  ipcMain.handle('cash-register:getHistory', () => {
    return service.getHistory()
  })

  ipcMain.handle('cash-register:getSales', (_event, openedAt: string) => {
    return service.getSalesForSession(openedAt)
  })
}
