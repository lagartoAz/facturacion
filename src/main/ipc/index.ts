import type Database from 'better-sqlite3'
import { registerProductHandlers } from './products.ipc'
import { registerCustomerHandlers } from './customers.ipc'
import { registerInvoiceHandlers } from './invoices.ipc'
import { registerReportHandlers } from './reports.ipc'
import { registerSettingsHandlers } from './settings.ipc'
import { registerCashRegisterHandlers } from './cash-register.ipc'
import { registerPendingCartHandlers } from './pending-cart.ipc'
import { registerBackupHandlers } from './backup.ipc'
import { registerUsbHandlers } from './usb.ipc'
import { registerExportHandlers } from './export.ipc'
import { registerQuoteHandlers } from './quotes.ipc'
import { registerDbLocationHandlers } from './db-location.ipc'
import { registerPrinterHandlers } from './printer.ipc'
import { registerSupplierHandlers } from './suppliers.ipc'
import { registerPurchaseHandlers } from './purchases.ipc'
import { registerNetworkHandlers } from './network.ipc'

export function registerAllHandlers(db: Database.Database): void {
  registerProductHandlers(db)
  registerCustomerHandlers(db)
  registerInvoiceHandlers(db)
  registerReportHandlers(db)
  registerSettingsHandlers(db)
  registerCashRegisterHandlers(db)
  registerPendingCartHandlers(db)
  registerBackupHandlers()
  registerUsbHandlers()
  registerExportHandlers(db)
  registerQuoteHandlers(db)
  registerDbLocationHandlers()
  registerPrinterHandlers(db)
  registerSupplierHandlers(db)
  registerPurchaseHandlers(db)
  registerNetworkHandlers()
}
