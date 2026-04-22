import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { ReportService } from '../services/report.service'

export function registerReportHandlers(db: Database.Database): void {
  const service = new ReportService(db)

  ipcMain.handle('reports:dailySales', (_event, from: string, to: string) => {
    return service.dailySales(from, to)
  })

  ipcMain.handle('reports:topProducts', (_event, from: string, to: string, limit?: number) => {
    return service.topProducts(from, to, limit)
  })

  ipcMain.handle('reports:summary', (_event, from: string, to: string) => {
    return service.summary(from, to)
  })
}
