import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { QuoteService } from '../services/quote.service'
import type { CreateQuoteDTO, QuoteFilters } from '../services/quote.service'
import { PendingCartService } from '../services/pending-cart.service'
import { getBackupService } from '../services/backup.service'

export function registerQuoteHandlers(db: Database.Database): void {
  const service = new QuoteService(db)
  const pendingCartService = new PendingCartService(db)

  ipcMain.handle('quotes:create', (_event, data: CreateQuoteDTO) => {
    const result = service.create(data)
    getBackupService().schedule()
    return result
  })

  ipcMain.handle('quotes:getAll', (_event, filters?: QuoteFilters) => {
    return service.getAll(filters)
  })

  ipcMain.handle('quotes:getById', (_event, id: number) => {
    return service.getById(id)
  })

  ipcMain.handle('quotes:delete', (_event, id: number) => {
    service.delete(id)
    getBackupService().schedule()
  })

  // Convert a quote into a pending cart so the user can restore it in POS
  // and process the actual sale. The quote itself is kept untouched.
  ipcMain.handle('quotes:toCart', (_event, id: number) => {
    const quote = service.getById(id)
    if (!quote || !quote.items) {
      throw new Error('Presupuesto no encontrado')
    }
    const cartItems = quote.items.map((item) => ({
      productId: item.product_id ?? 0,
      productName: item.product_name,
      unitPrice: item.unit_price,
      quantity: item.quantity,
      stock: 9999,
      isByWeight: !Number.isInteger(item.quantity),
      isCustom: item.product_id == null
    }))
    const label = `Presupuesto ${quote.quote_number}${quote.customer_name ? ' - ' + quote.customer_name : ''}`
    return pendingCartService.create({ label, cartItems })
  })
}
