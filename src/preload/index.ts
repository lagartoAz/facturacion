import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Products
  getProducts: (filters?: Record<string, unknown>) =>
    ipcRenderer.invoke('products:getAll', filters),
  getProductByBarcode: (barcode: string) =>
    ipcRenderer.invoke('products:getByBarcode', barcode),
  searchProducts: (query: string) =>
    ipcRenderer.invoke('products:search', query),
  createProduct: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('products:create', data),
  updateProduct: (id: number, data: Record<string, unknown>) =>
    ipcRenderer.invoke('products:update', id, data),
  toggleProductActive: (id: number) =>
    ipcRenderer.invoke('products:toggleActive', id),
  saveProductImage: (productId: number, imageData: string, extension: string) =>
    ipcRenderer.invoke('products:saveImage', productId, imageData, extension),
  removeProductImage: (productId: number) =>
    ipcRenderer.invoke('products:removeImage', productId),

  // Categories
  getCategories: () => ipcRenderer.invoke('categories:getAll'),
  createCategory: (name: string) =>
    ipcRenderer.invoke('categories:create', name),

  // Customers
  getCustomers: (search?: string) =>
    ipcRenderer.invoke('customers:getAll', search),
  createCustomer: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('customers:create', data),
  updateCustomer: (id: number, data: Record<string, unknown>) =>
    ipcRenderer.invoke('customers:update', id, data),
  deleteCustomer: (id: number) =>
    ipcRenderer.invoke('customers:delete', id),
  getCustomerBalance: (id: number) =>
    ipcRenderer.invoke('customers:getBalance', id),
  getCustomerBalances: () =>
    ipcRenderer.invoke('customers:getBalances'),
  getCustomerCreditInvoices: (id: number) =>
    ipcRenderer.invoke('customers:getCreditInvoices', id),
  addCustomerPayment: (id: number, amount: number, notes?: string) =>
    ipcRenderer.invoke('customers:addPayment', id, amount, notes),
  getCustomerPayments: (id: number) =>
    ipcRenderer.invoke('customers:getPayments', id),

  // Invoices
  createInvoice: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('invoices:create', data),
  getInvoices: (filters?: Record<string, unknown>) =>
    ipcRenderer.invoke('invoices:getAll', filters),
  getInvoiceById: (id: number) =>
    ipcRenderer.invoke('invoices:getById', id),
  voidInvoice: (id: number) =>
    ipcRenderer.invoke('invoices:void', id),

  // Reports
  getDailySales: (from: string, to: string) =>
    ipcRenderer.invoke('reports:dailySales', from, to),
  getTopProducts: (from: string, to: string, limit?: number) =>
    ipcRenderer.invoke('reports:topProducts', from, to, limit),
  getSalesSummary: (from: string, to: string) =>
    ipcRenderer.invoke('reports:summary', from, to),
  getProductStats: (productId: number) =>
    ipcRenderer.invoke('reports:productStats', productId),

  // Settings & Exchange Rates
  getExchangeRates: () => ipcRenderer.invoke('settings:getRates'),
  updateExchangeRate: (currency: string, rate: number) =>
    ipcRenderer.invoke('settings:updateRate', currency, rate),
  getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key: string, value: string) =>
    ipcRenderer.invoke('settings:set', key, value),
  getAllSettings: () => ipcRenderer.invoke('settings:getAll'),

  // Cash Register
  getCashRegister: () => ipcRenderer.invoke('cash-register:getCurrent'),
  openCashRegister: (amounts: { usd: number; ves: number; cop: number }, notes?: string) =>
    ipcRenderer.invoke('cash-register:open', amounts, notes),
  closeCashRegister: (countedAmounts: { usd: number; ves: number; cop: number }, notes?: string) =>
    ipcRenderer.invoke('cash-register:close', countedAmounts, notes),
  getCashRegisterHistory: () => ipcRenderer.invoke('cash-register:getHistory'),
  getCashRegisterSales: (openedAt: string) =>
    ipcRenderer.invoke('cash-register:getSales', openedAt),
  updateCashRegister: (id: number, amounts: { usd: number; ves: number; cop: number }, notes?: string) =>
    ipcRenderer.invoke('cash-register:update', id, amounts, notes),
  addCashRegisterWithdrawal: (cashRegisterId: number, amount: number, reason: string, currency: string = 'USD') =>
    ipcRenderer.invoke('cash-register:addWithdrawal', cashRegisterId, amount, reason, currency),
  getCashRegisterWithdrawals: (cashRegisterId: number) =>
    ipcRenderer.invoke('cash-register:getWithdrawals', cashRegisterId),

  // Pending Carts
  createPendingCart: (data: Record<string, unknown>) =>
    ipcRenderer.invoke('pending-carts:create', data),
  getPendingCarts: () => ipcRenderer.invoke('pending-carts:getAll'),
  deletePendingCart: (id: number) => ipcRenderer.invoke('pending-carts:delete', id),

  // Window management
  openPosWindow: () => ipcRenderer.invoke('window:openPos')
}

contextBridge.exposeInMainWorld('api', api)

export type ApiType = typeof api
