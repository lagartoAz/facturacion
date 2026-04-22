import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { SettingsService } from '../services/settings.service'

export function registerSettingsHandlers(db: Database.Database): void {
  const service = new SettingsService(db)

  ipcMain.handle('settings:get', (_event, key: string) => {
    return service.get(key)
  })

  ipcMain.handle('settings:set', (_event, key: string, value: string) => {
    service.set(key, value)
  })

  ipcMain.handle('settings:getAll', () => {
    return service.getAll()
  })

  ipcMain.handle('settings:getRates', () => {
    return service.getExchangeRates()
  })

  ipcMain.handle('settings:updateRate', (_event, currency: string, rate: number) => {
    service.updateExchangeRate(currency, rate)
  })
}
