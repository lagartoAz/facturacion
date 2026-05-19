import { ipcMain } from 'electron'
import { getUsbStatus } from '../services/usb.service'

export function registerUsbHandlers(): void {
  ipcMain.handle('usb:getStatus', () => {
    return getUsbStatus()
  })
}
