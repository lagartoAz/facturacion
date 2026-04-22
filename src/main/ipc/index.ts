import type Database from 'better-sqlite3'
import { registerProductHandlers } from './products.ipc'
import { registerCustomerHandlers } from './customers.ipc'
import { registerInvoiceHandlers } from './invoices.ipc'
import { registerReportHandlers } from './reports.ipc'
import { registerSettingsHandlers } from './settings.ipc'

export function registerAllHandlers(db: Database.Database): void {
  registerProductHandlers(db)
  registerCustomerHandlers(db)
  registerInvoiceHandlers(db)
  registerReportHandlers(db)
  registerSettingsHandlers(db)
}
