import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReportService } from '../services/report.service'

export function registerReportHandlers(db: Database.Database): void {
  const service = new ReportService(db)

  ipcMain.handle('reports:dailySales', (_event, from: string, to: string, customerId?: number) => {
    return service.dailySales(from, to, customerId)
  })

  ipcMain.handle('reports:hourlySales', (_event, day: string, customerId?: number) => {
    return service.hourlySales(day, customerId)
  })

  ipcMain.handle('reports:topProducts', (_event, from: string, to: string, limit?: number) => {
    return service.topProducts(from, to, limit)
  })

  ipcMain.handle('reports:summary', (_event, from: string, to: string, customerId?: number) => {
    return service.summary(from, to, customerId)
  })

  ipcMain.handle('reports:monthlySales', (_event, from: string, to: string, customerId?: number) => {
    return service.monthlySales(from, to, customerId)
  })

  ipcMain.handle('reports:productStats', (_event, productId: number) => {
    return service.productStats(productId)
  })
}
