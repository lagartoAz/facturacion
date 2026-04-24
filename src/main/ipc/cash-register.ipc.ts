import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import {
  CashRegisterService,
  OpenAmounts,
  CloseAmounts
} from '../services/cash-register.service'

export function registerCashRegisterHandlers(db: Database.Database): void {
  const service = new CashRegisterService(db)

  ipcMain.handle('cash-register:getCurrent', () => {
    return service.getCurrent()
  })

  ipcMain.handle('cash-register:open', (_event, amounts: OpenAmounts, notes?: string) => {
    return service.open(amounts, notes)
  })

  ipcMain.handle('cash-register:close', (_event, countedAmounts: CloseAmounts, notes?: string) => {
    return service.close(countedAmounts, notes)
  })

  ipcMain.handle('cash-register:getHistory', () => {
    return service.getHistory()
  })

  ipcMain.handle('cash-register:getSales', (_event, openedAt: string) => {
    return service.getSalesForSession(openedAt)
  })

  ipcMain.handle(
    'cash-register:update',
    (_event, id: number, amounts: CloseAmounts, notes?: string) => {
      return service.update(id, amounts, notes)
    }
  )

  ipcMain.handle(
    'cash-register:addWithdrawal',
    (_event, cashRegisterId: number, amount: number, reason: string) => {
      return service.addWithdrawal(cashRegisterId, amount, reason)
    }
  )

  ipcMain.handle('cash-register:getWithdrawals', (_event, cashRegisterId: number) => {
    return service.getWithdrawals(cashRegisterId)
  })
}
