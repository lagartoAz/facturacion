// Single source of truth for the renderer-facing `api` surface.
//
// The same method->channel mapping is reused by two transports:
//   - Electron preload  -> ipcRenderer.invoke (desktop)
//   - Capacitor/web     -> HTTP to the server's /rpc, or local handlers (Android)
//
// Both call createApi() with an `invoke(channel, ...args)` function, so the
// renderer keeps calling `window.api.getProducts()` regardless of platform.

import type { ReceiptData } from './receipt'

export type Invoke = (channel: string, ...args: unknown[]) => Promise<unknown>

// Thermal (ESC/POS) printer configuration used on Android terminals.
export interface ThermalConfig {
  transport: 'none' | 'network' | 'bluetooth'
  ip?: string
  port?: number
  btAddress?: string
  btName?: string
  width?: number // columns: 32 for 58mm, 48 for 80mm
}

export function createApi(invoke: Invoke) {
  return {
    // Products
    getProducts: (filters?: Record<string, unknown>) => invoke('products:getAll', filters),
    countProducts: (filters?: Record<string, unknown>) => invoke('products:count', filters),
    getInventoryTotals: (filters?: Record<string, unknown>) =>
      invoke('products:inventoryTotals', filters) as Promise<{
        total_units: number
        total_invested: number
      }>,
    getLowStockCount: () => invoke('products:lowStockCount') as Promise<number>,
    getProductByBarcode: (barcode: string) => invoke('products:getByBarcode', barcode),
    searchProducts: (query: string) => invoke('products:search', query),
    createProduct: (data: Record<string, unknown>) => invoke('products:create', data),
    updateProduct: (id: number, data: Record<string, unknown>) =>
      invoke('products:update', id, data),
    toggleProductActive: (id: number) => invoke('products:toggleActive', id),
    deleteProduct: (id: number) => invoke('products:delete', id) as Promise<{ hardDeleted: boolean }>,
    saveProductImage: (productId: number, imageData: string, extension: string) =>
      invoke('products:saveImage', productId, imageData, extension),
    getProductImage: (productId: number) =>
      invoke('products:getImage', productId) as Promise<{ mime: string; data: string } | null>,
    removeProductImage: (productId: number) => invoke('products:removeImage', productId),

    // Categories
    getCategories: () => invoke('categories:getAll'),
    createCategory: (name: string) => invoke('categories:create', name),

    // Customers
    getCustomers: (search?: string) => invoke('customers:getAll', search),
    createCustomer: (data: Record<string, unknown>) => invoke('customers:create', data),
    updateCustomer: (id: number, data: Record<string, unknown>) =>
      invoke('customers:update', id, data),
    deleteCustomer: (id: number) => invoke('customers:delete', id),
    getCustomerBalance: (id: number) => invoke('customers:getBalance', id),
    getCustomerBalances: () => invoke('customers:getBalances'),
    getCustomerCreditInvoices: (id: number) => invoke('customers:getCreditInvoices', id),
    addCustomerPayment: (
      id: number,
      amount: number,
      notes?: string,
      details?: { method?: 'cash' | 'card' | 'transfer'; currency?: 'USD' | 'VES' | 'COP' }
    ) => invoke('customers:addPayment', id, amount, notes, details),
    getCustomerPayments: (id: number) => invoke('customers:getPayments', id),

    // Suppliers
    getSuppliers: (search?: string) => invoke('suppliers:getAll', search),
    createSupplier: (data: Record<string, unknown>) => invoke('suppliers:create', data),
    updateSupplier: (id: number, data: Record<string, unknown>) =>
      invoke('suppliers:update', id, data),
    deleteSupplier: (id: number) => invoke('suppliers:delete', id),

    // Purchases (facturas de ingreso / reabastecimiento de proveedor)
    getSupplierProducts: (supplierId: number) => invoke('purchases:supplierProducts', supplierId),
    createPurchase: (data: Record<string, unknown>) => invoke('purchases:create', data),
    getSupplierPurchases: (supplierId: number) => invoke('purchases:bySupplier', supplierId),
    getPurchases: (filters?: Record<string, unknown>) => invoke('purchases:getAll', filters),
    countPurchases: (filters?: Record<string, unknown>) => invoke('purchases:count', filters),
    getPurchaseById: (id: number) => invoke('purchases:getById', id),

    // Invoices
    createInvoice: (data: Record<string, unknown>) => invoke('invoices:create', data),
    getInvoices: (filters?: Record<string, unknown>) => invoke('invoices:getAll', filters),
    countInvoices: (filters?: Record<string, unknown>) => invoke('invoices:count', filters),
    getInvoiceById: (id: number) => invoke('invoices:getById', id),
    voidInvoice: (id: number) => invoke('invoices:void', id),

    // Reports
    getDailySales: (from: string, to: string, customerId?: number) =>
      invoke('reports:dailySales', from, to, customerId),
    getHourlySales: (day: string, customerId?: number) =>
      invoke('reports:hourlySales', day, customerId),
    getTopProducts: (from: string, to: string, limit?: number) =>
      invoke('reports:topProducts', from, to, limit),
    getSalesSummary: (from: string, to: string, customerId?: number) =>
      invoke('reports:summary', from, to, customerId),
    getMonthlySales: (from: string, to: string, customerId?: number) =>
      invoke('reports:monthlySales', from, to, customerId),
    getDailyDebts: (from: string, to: string, customerId?: number) =>
      invoke('reports:dailyDebts', from, to, customerId),
    getHourlyDebts: (day: string, customerId?: number) =>
      invoke('reports:hourlyDebts', day, customerId),
    getMonthlyDebts: (from: string, to: string, customerId?: number) =>
      invoke('reports:monthlyDebts', from, to, customerId),
    getProductStats: (productId: number) => invoke('reports:productStats', productId),

    // Loyalty points add-on ("Fidelidad")
    getLoyaltyStatus: () => invoke('loyalty:status'),
    activateLoyalty: (key: string) => invoke('loyalty:activate', key),
    deactivateLoyalty: () => invoke('loyalty:deactivate'),
    setLoyaltyConfig: (cfg: Record<string, unknown>) => invoke('loyalty:setConfig', cfg),
    // Levels + benefits
    listLoyaltyLevels: () => invoke('loyalty:listLevels'),
    createLoyaltyLevel: (level: Record<string, unknown>) => invoke('loyalty:createLevel', level),
    updateLoyaltyLevel: (id: number, level: Record<string, unknown>) =>
      invoke('loyalty:updateLevel', id, level),
    deleteLoyaltyLevel: (id: number) => invoke('loyalty:deleteLevel', id),
    getLevelBenefits: (levelId: number) => invoke('loyalty:levelBenefits', levelId),
    setLevelBenefits: (levelId: number, benefits: Record<string, unknown>[]) =>
      invoke('loyalty:setLevelBenefits', levelId, benefits),
    getCustomerLevel: (customerId: number) => invoke('loyalty:customerLevel', customerId),
    getLevelDiscount: (customerId: number | null, subtotal: number) =>
      invoke('loyalty:levelDiscount', customerId, subtotal),
    getTicketBalance: (customerId: number) => invoke('loyalty:ticketBalance', customerId),
    processMonthlyBenefits: () => invoke('loyalty:processMonthly'),
    getLoyaltyBalance: (customerId: number) => invoke('loyalty:balance', customerId),
    getLoyaltyBalances: () => invoke('loyalty:allBalances'),
    getLoyaltySummaryByCustomer: () => invoke('loyalty:summaryByCustomer'),
    getLoyaltyLevelsByCustomer: () => invoke('loyalty:levelsByCustomer'),
    getLoyaltyPointsByInvoice: () => invoke('loyalty:pointsByInvoice'),
    getLoyaltyTicketsByInvoice: () => invoke('loyalty:ticketsByInvoice'),
    getInvoiceTickets: (invoiceId: number) => invoke('loyalty:ticketsForInvoice', invoiceId),
    markTicketsPrinted: (invoiceId: number) => invoke('loyalty:markTicketsPrinted', invoiceId),
    getTicketsPrintedIds: () => invoke('loyalty:ticketsPrintedIds'),
    getEarnedTicketsReport: () => invoke('loyalty:earnedTicketsReport'),
    adjustLoyaltyTickets: (customerId: number, tickets: number, note?: string) =>
      invoke('loyalty:adjustTickets', customerId, tickets, note),
    getManualTicketsReport: () => invoke('loyalty:manualTicketsReport'),
    getManualTicketPrintData: (ledgerId: number) =>
      invoke('loyalty:manualTicketPrintData', ledgerId),
    markManualTicketsPrinted: (ledgerId: number) =>
      invoke('loyalty:markManualTicketsPrinted', ledgerId),
    getRedemptionsReport: (limit?: number) => invoke('loyalty:redemptionsReport', limit),
    getLoyaltyHistory: (customerId: number, limit?: number) =>
      invoke('loyalty:history', customerId, limit),
    redeemLoyaltyPoints: (customerId: number, points: number, note?: string) =>
      invoke('loyalty:redeem', customerId, points, note),
    adjustLoyaltyPoints: (customerId: number, points: number, note?: string) =>
      invoke('loyalty:adjust', customerId, points, note),
    // Product points
    getLoyaltyProductPoints: () => invoke('loyalty:productPoints'),
    setLoyaltyProductPoints: (productId: number, points: number) =>
      invoke('loyalty:setProductPoints', productId, points),
    // Rewards
    listLoyaltyRewards: (activeOnly?: boolean) => invoke('loyalty:listRewards', activeOnly),
    createLoyaltyReward: (reward: Record<string, unknown>) =>
      invoke('loyalty:createReward', reward),
    updateLoyaltyReward: (id: number, reward: Record<string, unknown>) =>
      invoke('loyalty:updateReward', id, reward),
    deleteLoyaltyReward: (id: number) => invoke('loyalty:deleteReward', id),
    redeemLoyaltyReward: (customerId: number, rewardId: number) =>
      invoke('loyalty:redeemReward', customerId, rewardId),
    getActiveCoupons: (customerId: number) => invoke('loyalty:activeCoupons', customerId),
    getAllCoupons: (customerId: number) => invoke('loyalty:allCoupons', customerId),
    getAffordableDiscountRewards: (customerId: number) =>
      invoke('loyalty:affordableDiscountRewards', customerId),
    previewSaleLoyalty: (ctx: Record<string, unknown>) => invoke('loyalty:previewSale', ctx),
    getInvoiceLoyaltySummary: (invoiceId: number) => invoke('loyalty:invoiceSummary', invoiceId),
    getLoyaltyDailyPoints: (from: string, to: string, customerId?: number) =>
      invoke('loyalty:dailyPoints', from, to, customerId),
    getLoyaltyHourlyPoints: (day: string, customerId?: number) =>
      invoke('loyalty:hourlyPoints', day, customerId),
    getLoyaltyPointsSummary: (from: string, to: string, customerId?: number) =>
      invoke('loyalty:pointsSummary', from, to, customerId),
    getLoyaltyMonthlyPoints: (from: string, to: string, customerId?: number) =>
      invoke('loyalty:monthlyPoints', from, to, customerId),
    getLoyaltyTopProductsByPoints: (from: string, to: string, limit?: number) =>
      invoke('loyalty:topProductsByPoints', from, to, limit),
    // Raffle
    getActiveRaffle: () => invoke('loyalty:activeRaffle'),
    listRaffles: () => invoke('loyalty:listRaffles'),
    createRaffle: (name: string, pointsPerEntry: number, minPoints: number) =>
      invoke('loyalty:createRaffle', name, pointsPerEntry, minPoints),
    deleteRaffle: (id: number) => invoke('loyalty:deleteRaffle', id),
    getRaffleParticipants: (raffleId: number) => invoke('loyalty:raffleParticipants', raffleId),
    drawRaffle: (raffleId: number, rand: number) => invoke('loyalty:drawRaffle', raffleId, rand),
    redrawRaffle: (raffleId: number) => invoke('loyalty:redrawRaffle', raffleId),
    createLevelRaffle: (name: string, levelId: number) =>
      invoke('loyalty:createLevelRaffle', name, levelId),
    addRaffleParticipant: (raffleId: number, customerId: number) =>
      invoke('loyalty:addRaffleParticipant', raffleId, customerId),
    removeRaffleParticipant: (raffleId: number, customerId: number) =>
      invoke('loyalty:removeRaffleParticipant', raffleId, customerId),

    // Settings & Exchange Rates
    getExchangeRates: () => invoke('settings:getRates'),
    updateExchangeRate: (currency: string, rate: number) =>
      invoke('settings:updateRate', currency, rate),
    getSetting: (key: string) => invoke('settings:get', key),
    setSetting: (key: string, value: string) => invoke('settings:set', key, value),
    getAllSettings: () => invoke('settings:getAll'),

    // Cash Register
    getCashRegister: () => invoke('cash-register:getCurrent'),
    openCashRegister: (amounts: { usd: number; ves: number; cop: number }, notes?: string) =>
      invoke('cash-register:open', amounts, notes),
    closeCashRegister: (countedAmounts: { usd: number; ves: number; cop: number }, notes?: string) =>
      invoke('cash-register:close', countedAmounts, notes),
    getCashRegisterHistory: () => invoke('cash-register:getHistory'),
    getCashRegisterSales: (openedAt: string) => invoke('cash-register:getSales', openedAt),
    updateCashRegister: (
      id: number,
      amounts: { usd: number; ves: number; cop: number },
      notes?: string
    ) => invoke('cash-register:update', id, amounts, notes),
    addCashRegisterWithdrawal: (
      cashRegisterId: number,
      amount: number,
      reason: string,
      currency: string = 'USD'
    ) => invoke('cash-register:addWithdrawal', cashRegisterId, amount, reason, currency),
    getCashRegisterWithdrawals: (cashRegisterId: number) =>
      invoke('cash-register:getWithdrawals', cashRegisterId),

    // Pending Carts
    createPendingCart: (data: Record<string, unknown>) => invoke('pending-carts:create', data),
    getPendingCarts: () => invoke('pending-carts:getAll'),
    deletePendingCart: (id: number) => invoke('pending-carts:delete', id),

    // Quotes (Presupuestos)
    createQuote: (data: Record<string, unknown>) => invoke('quotes:create', data),
    getQuotes: (filters?: Record<string, unknown>) => invoke('quotes:getAll', filters),
    getQuoteById: (id: number) => invoke('quotes:getById', id),
    deleteQuote: (id: number) => invoke('quotes:delete', id),
    quoteToCart: (id: number) => invoke('quotes:toCart', id),

    // Database location
    getDbInfo: () =>
      invoke('db:getInfo') as Promise<{
        currentPath: string
        defaultPath: string
        isDefault: boolean
      }>,
    changeDbLocation: () =>
      invoke('db:changeLocation') as Promise<{
        success?: boolean
        canceled?: boolean
        error?: string
        newPath?: string
      }>,
    resetDbLocation: () =>
      invoke('db:resetToDefault') as Promise<{
        success?: boolean
        error?: string
        newPath?: string
      }>,

    // Window management
    openPosWindow: () => invoke('window:openPos'),

    // Backups
    backupNow: () => invoke('backup:now'),
    listBackups: () => invoke('backup:list'),
    openBackupFolder: () => invoke('backup:openFolder'),
    getBackupDir: () => invoke('backup:getDir'),
    restoreBackup: (backupPath: string) =>
      invoke('backup:restore', backupPath) as Promise<{ success: boolean; error?: string }>,

    // USB license
    getUsbStatus: () => invoke('usb:getStatus'),

    // Device role (Android): whether this device is the server or a terminal.
    // On desktop the role is fixed at build time and these are never called.
    getDeviceRole: () => invoke('device:getRole') as Promise<'server' | 'client' | 'unselected'>,
    setDeviceRole: (role: 'server' | 'client') => invoke('device:setRole', role) as Promise<void>,

    // Network / multi-terminal
    getNetworkInfo: () => invoke('net:getInfo'),
    setServerConfig: (patch: Record<string, unknown>) => invoke('net:setServerConfig', patch),
    clientConnect: (host: string, token: string, port?: number) =>
      invoke('net:clientConnect', host, token, port) as Promise<{ ok: boolean; error?: string }>,
    clientStatus: () => invoke('net:clientStatus') as Promise<{ connected: boolean }>,
    autoReconnect: () => invoke('net:autoReconnect') as Promise<{ ok: boolean }>,

    // Export
    exportInventory: () => invoke('export:inventory') as Promise<string | null>,
    exportInvoices: () => invoke('export:invoices') as Promise<string | null>,

    // Import
    importInventory: () =>
      invoke('import:inventory') as Promise<{
        added: number
        updated: number
        errors: { row: number; reason: string }[]
      } | null>,

    // Printing
    listPrinters: () =>
      invoke('printer:list') as Promise<
        {
          name: string
          displayName: string
          description: string
          status: number
          isDefault: boolean
        }[]
      >,
    // `receipt` is used for ESC/POS thermal printing (Android); desktop uses html.
    printReceipt: (html: string, receipt?: ReceiptData) =>
      invoke('printer:print', html, receipt) as Promise<{ success: boolean; error?: string }>,
    setDefaultPrinter: (deviceName: string | null) =>
      invoke('printer:setDefault', deviceName) as Promise<void>,
    setSilentPrint: (silent: boolean) => invoke('printer:setSilent', silent) as Promise<void>,
    // ESC/POS direct printing (desktop): 'escpos' sends raw bytes to the printer
    // queue (clean thermal output); 'driver' keeps the Windows GDI path.
    setPrinterMode: (mode: 'driver' | 'escpos', width: number) =>
      invoke('printer:setMode', mode, width) as Promise<void>,
    getPrinterConfig: () =>
      invoke('printer:getConfig') as Promise<{
        defaultPrinter: string
        silent: boolean
        mode: 'driver' | 'escpos'
        width: number
      }>,

    // Thermal printer config (Android). Not handled on desktop.
    getThermalPrinter: () => invoke('printer:getThermal') as Promise<ThermalConfig>,
    setThermalPrinter: (cfg: ThermalConfig) =>
      invoke('printer:setThermal', cfg) as Promise<void>
  }
}

export type ApiType = ReturnType<typeof createApi>
