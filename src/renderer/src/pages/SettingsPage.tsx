import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Save, Clock, ShieldCheck, FolderOpen, HardDrive, Usb, FileSpreadsheet, Package, FileText, Upload, AlertTriangle, Database, MoveRight, Printer, RefreshCw, Keyboard, X, RotateCcw, Network, Server } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { format } from 'date-fns'

interface BackupEntry {
  name: string
  path: string
  size: number
  createdAt: string
}

interface UsbStatus {
  portable: boolean
  usbDir: string | null
  connected: boolean
  licenseOk: boolean
  licensePath: string | null
}

interface DbInfo {
  currentPath: string
  defaultPath: string
  isDefault: boolean
}

interface NetworkInfo {
  role: 'server' | 'client'
  serverEnabled: boolean
  serverPort: number
  token: string
  serverHost: string
  running: boolean
  runningPort: number
  addresses: string[]
  version: string
  connected?: boolean
}

interface PrinterEntry {
  name: string
  displayName: string
  description: string
  status: number
  isDefault: boolean
}

const SHORTCUT_DEFS = [
  { key: 'shortcut_open_pos_window', label: 'Abrir Punto de Venta (ventana emergente)', defaultKey: 'p' },
  { key: 'shortcut_nav_pos',       label: 'Ir a Punto de Venta (en la app)',           defaultKey: '' },
  { key: 'shortcut_nav_invoices',  label: 'Ir a Facturas',                             defaultKey: '' },
  { key: 'shortcut_nav_products',  label: 'Ir a Productos',                            defaultKey: '' },
  { key: 'shortcut_nav_cash',      label: 'Ir a Caja',                                 defaultKey: '' },
  { key: 'shortcut_nav_reports',   label: 'Ir a Reportes',                             defaultKey: '' },
]

const APP_VERSION = '1.11.0'

export default function SettingsPage(): JSX.Element {
  const [rateVes, setRateVes] = useState('')
  const [rateCop, setRateCop] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessRif, setBusinessRif] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [saved, setSaved] = useState(false)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [backups, setBackups] = useState<BackupEntry[]>([])
  const [backupDir, setBackupDir] = useState('')
  const [backingUp, setBackingUp] = useState(false)
  const [usbStatus, setUsbStatus] = useState<UsbStatus | null>(null)
  const [exporting, setExporting] = useState<'inventory' | 'invoices' | null>(null)
  const [exportMsg, setExportMsg] = useState('')
  const [importing, setImporting] = useState(false)
  const [importConfirmOpen, setImportConfirmOpen] = useState(false)
  const [importResult, setImportResult] = useState<{
    added: number
    updated: number
    errors: { row: number; reason: string }[]
  } | null>(null)
  const [importResultOpen, setImportResultOpen] = useState(false)
  const [dbInfo, setDbInfo] = useState<DbInfo | null>(null)
  const [movingDb, setMovingDb] = useState(false)
  const [dbMessage, setDbMessage] = useState('')
  const [netInfo, setNetInfo] = useState<NetworkInfo | null>(null)
  const [netPort, setNetPort] = useState('47600')
  const [netToken, setNetToken] = useState('')
  const [netHost, setNetHost] = useState('')
  const [netEnabled, setNetEnabled] = useState(true)
  const [netMsg, setNetMsg] = useState('')
  const [savingNet, setSavingNet] = useState(false)
  const [printers, setPrinters] = useState<PrinterEntry[]>([])
  const [defaultPrinter, setDefaultPrinter] = useState('')
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [printMessage, setPrintMessage] = useState('')
  const [printAfterSale, setPrintAfterSale] = useState<'ask' | 'always' | 'never'>('ask')
  const [receiptTitle, setReceiptTitle] = useState('')
  const [receiptFontSize, setReceiptFontSize] = useState('14')
  const [receiptFontWeight, setReceiptFontWeight] = useState('700')
  const [receiptMargin, setReceiptMargin] = useState('4')
  const [shortcuts, setShortcuts] = useState<Record<string, string>>({})
  const [capturingKey, setCapturingKey] = useState<string | null>(null)
  const captureInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadSettings()
    loadUsbStatus()
    loadPrinters()
    loadPrinterConfig()
    // Backups and DB location only exist on the server; skip them on a client.
    loadNetInfo().then((i) => {
      if (i?.role !== 'client') {
        loadBackups()
        loadDbInfo()
      }
    })
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    const usbTimer = setInterval(loadUsbStatus, 5000)
    return () => {
      clearInterval(timer)
      clearInterval(usbTimer)
    }
  }, [])

  async function loadPrinters(): Promise<void> {
    setLoadingPrinters(true)
    try {
      setPrinters(await window.api.listPrinters())
    } finally {
      setLoadingPrinters(false)
    }
  }

  async function loadPrinterConfig(): Promise<void> {
    const [cfg, settings] = await Promise.all([
      window.api.getPrinterConfig(),
      window.api.getAllSettings()
    ])
    setDefaultPrinter(cfg.defaultPrinter)
    const pas = settings.print_after_sale
    if (pas === 'always' || pas === 'never') setPrintAfterSale(pas)
    else setPrintAfterSale('ask')
  }

  async function savePrinter(): Promise<void> {
    await window.api.setDefaultPrinter(defaultPrinter || null)
    await window.api.setSetting('print_after_sale', printAfterSale)
    const fs = parseInt(receiptFontSize)
    await window.api.setSetting('receipt_font_size', (fs >= 10 && fs <= 20 ? fs : 14).toString())
    await window.api.setSetting('receipt_font_weight', receiptFontWeight)
    await window.api.setSetting('receipt_title', receiptTitle.trim())
    const rm = parseInt(receiptMargin)
    await window.api.setSetting('receipt_margin', (rm >= 1 && rm <= 15 ? rm : 4).toString())
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function testPrint(): Promise<void> {
    setPrintMessage('')
    const fs = parseInt(receiptFontSize) || 14
    const fw = receiptFontWeight || '700'
    const rm = parseInt(receiptMargin) || 4
    const html = `
      <html><head><title>Prueba</title>
      <style>
        @page { size: 58mm auto; margin: 0; }
        * { box-sizing: border-box; }
        body { font-family: 'Courier New', Courier, monospace; font-size: ${fs}px; font-weight: ${fw}; color: #000; width: 58mm; margin: 0; padding: 3mm ${rm}mm; }
        .center { text-align: center; }
        .bold { font-weight: 900; }
        .divider { border-top: 1.5px solid #000; margin: 5px 0; }
      </style></head><body>
        ${receiptTitle ? `<div class="center bold" style="font-size:${fs + 3}px">${receiptTitle}</div>` : ''}
        <div class="center bold" style="font-size:${fs + 2}px">PRUEBA DE IMPRESION</div>
        <div class="center">${format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
        <div class="divider"></div>
        <div class="center">Impresora: ${defaultPrinter || 'predeterminada del sistema'}</div>
        <div class="center">Tamano: ${fs}px · Grosor: ${fw}</div>
        <div class="divider"></div>
        <div class="center">Si lees esto, la impresion funciona correctamente.</div>
      </body></html>
    `
    const result = await window.api.printReceipt(html)
    if (result.success) setPrintMessage('Enviado a la impresora')
    else setPrintMessage(`Error: ${result.error ?? 'desconocido'}`)
    setTimeout(() => setPrintMessage(''), 5000)
  }

  async function saveShortcuts(): Promise<void> {
    await Promise.all(Object.entries(shortcuts).map(([k, v]) => window.api.setSetting(k, v)))
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function startCapture(key: string): void {
    setCapturingKey(key)
    setTimeout(() => captureInputRef.current?.focus(), 0)
  }

  function handleCaptureKeyDown(e: React.KeyboardEvent<HTMLInputElement>): void {
    e.preventDefault()
    if (e.key === 'Escape') { setCapturingKey(null); return }
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return
    const parts: string[] = []
    if (e.ctrlKey) parts.push('ctrl')
    if (e.altKey) parts.push('alt')
    if (e.shiftKey) parts.push('shift')
    parts.push(e.key.toLowerCase())
    setShortcuts((prev) => ({ ...prev, [capturingKey!]: parts.join('+') }))
    setCapturingKey(null)
  }

  async function loadDbInfo(): Promise<void> {
    setDbInfo(await window.api.getDbInfo())
  }

  async function loadNetInfo(): Promise<NetworkInfo> {
    const i = (await window.api.getNetworkInfo()) as NetworkInfo
    setNetInfo(i)
    setNetPort(String(i.serverPort))
    setNetToken(i.token)
    setNetHost(i.serverHost)
    setNetEnabled(i.serverEnabled)
    return i
  }

  async function reconnectClient(): Promise<void> {
    setSavingNet(true)
    setNetMsg('')
    try {
      const res = await window.api.clientConnect(netHost.trim(), netToken)
      setNetMsg(res.ok ? 'Conectado al servidor' : `Error: ${res.error ?? 'no se pudo conectar'}`)
      if (res.ok) await loadNetInfo()
    } finally {
      setSavingNet(false)
      setTimeout(() => setNetMsg(''), 6000)
    }
  }

  async function saveNet(): Promise<void> {
    setSavingNet(true)
    setNetMsg('')
    try {
      const port = parseInt(netPort)
      const res = (await window.api.setServerConfig({
        serverEnabled: netEnabled,
        serverPort: port >= 1024 && port <= 65535 ? port : 47600,
        token: netToken.trim()
      })) as { info: NetworkInfo; error?: string }
      setNetInfo(res.info)
      setNetPort(String(res.info.serverPort))
      setNetEnabled(res.info.serverEnabled)
      setNetMsg(res.error ? `Error: ${res.error}` : 'Configuracion de red guardada')
    } finally {
      setSavingNet(false)
      setTimeout(() => setNetMsg(''), 6000)
    }
  }

  async function handleChangeDbLocation(): Promise<void> {
    if (
      !confirm(
        'La aplicacion se reiniciara despues de mover la base de datos. Continuar?'
      )
    ) {
      return
    }
    setMovingDb(true)
    setDbMessage('')
    try {
      const result = await window.api.changeDbLocation()
      if (result.canceled) {
        setDbMessage('Operacion cancelada')
      } else if (result.error) {
        setDbMessage(`Error: ${result.error}`)
      } else if (result.success) {
        setDbMessage(`Movida a ${result.newPath}. Reiniciando...`)
      }
    } finally {
      setMovingDb(false)
      setTimeout(() => setDbMessage(''), 6000)
    }
  }

  async function handleResetDbLocation(): Promise<void> {
    if (!confirm('Volver la base de datos a la ubicacion por defecto?')) return
    setMovingDb(true)
    setDbMessage('')
    try {
      const result = await window.api.resetDbLocation()
      if (result.error) setDbMessage(`Error: ${result.error}`)
      else if (result.success) setDbMessage(`Movida a ${result.newPath}. Reiniciando...`)
    } finally {
      setMovingDb(false)
      setTimeout(() => setDbMessage(''), 6000)
    }
  }

  async function loadUsbStatus(): Promise<void> {
    const status = await window.api.getUsbStatus()
    setUsbStatus(status)
  }

  async function loadBackups(): Promise<void> {
    const [list, dir] = await Promise.all([
      window.api.listBackups(),
      window.api.getBackupDir()
    ])
    setBackups(list)
    setBackupDir(dir)
  }

  async function handleBackupNow(): Promise<void> {
    setBackingUp(true)
    try {
      await window.api.backupNow()
      await loadBackups()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setBackingUp(false)
    }
  }

  async function handleRestore(b: BackupEntry): Promise<void> {
    const when = format(new Date(b.createdAt), 'dd/MM/yyyy HH:mm:ss')
    if (
      !confirm(
        `Vas a restaurar el respaldo del ${when}.\n\n` +
          `La base de datos actual sera reemplazada por esta copia (los cambios hechos despues de esa fecha se perderan). ` +
          `La base actual se guardara aparte por si acaso, y la aplicacion se reiniciara.\n\n¿Continuar?`
      )
    ) {
      return
    }
    const result = await window.api.restoreBackup(b.path)
    if (result && !result.success) {
      alert(`No se pudo restaurar: ${result.error ?? 'error desconocido'}`)
    }
    // On success the main process relaunches the app, so nothing else to do here.
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  async function handleImport(): Promise<void> {
    setImportConfirmOpen(false)
    setImporting(true)
    try {
      const result = await window.api.importInventory()
      if (result) {
        setImportResult(result)
        setImportResultOpen(true)
        await loadBackups()
      }
    } catch (err) {
      setImportResult({
        added: 0,
        updated: 0,
        errors: [{ row: 0, reason: (err as Error).message }]
      })
      setImportResultOpen(true)
    } finally {
      setImporting(false)
    }
  }

  async function handleExport(kind: 'inventory' | 'invoices'): Promise<void> {
    setExporting(kind)
    setExportMsg('')
    try {
      const path =
        kind === 'inventory'
          ? await window.api.exportInventory()
          : await window.api.exportInvoices()
      if (path) {
        setExportMsg(`Archivo guardado en: ${path}`)
      } else {
        setExportMsg('Exportacion cancelada')
      }
    } catch (err) {
      setExportMsg(`Error: ${(err as Error).message}`)
    } finally {
      setExporting(null)
      setTimeout(() => setExportMsg(''), 5000)
    }
  }

  async function loadSettings(): Promise<void> {
    const [rates, settings] = await Promise.all([
      window.api.getExchangeRates(),
      window.api.getAllSettings()
    ])
    const ves = rates.find((r: { currency: string }) => r.currency === 'VES')
    const cop = rates.find((r: { currency: string }) => r.currency === 'COP')
    if (ves) setRateVes(String(ves.rate))
    if (cop) setRateCop(String(cop.rate))
    setBusinessName(settings.business_name || '')
    setBusinessRif(settings.business_rif || '')
    setBusinessAddress(settings.business_address || '')
    setBusinessPhone(settings.business_phone || '')
    setReceiptTitle(settings.receipt_title || '')
    setReceiptFontSize(settings.receipt_font_size || '14')
    setReceiptFontWeight(settings.receipt_font_weight || '700')
    setReceiptMargin(settings.receipt_margin || '4')
    const sc: Record<string, string> = {}
    for (const def of SHORTCUT_DEFS) {
      sc[def.key] = settings[def.key] ?? def.defaultKey
    }
    setShortcuts(sc)
  }

  async function saveRates(): Promise<void> {
    const vesNum = parseFloat(rateVes)
    const copNum = parseFloat(rateCop)
    if (!isNaN(vesNum) && vesNum > 0) await window.api.updateExchangeRate('VES', vesNum)
    if (!isNaN(copNum) && copNum > 0) await window.api.updateExchangeRate('COP', copNum)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  async function saveBusinessInfo(): Promise<void> {
    await Promise.all([
      window.api.setSetting('business_name', businessName),
      window.api.setSetting('business_rif', businessRif),
      window.api.setSetting('business_address', businessAddress),
      window.api.setSetting('business_phone', businessPhone)
    ])
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Configuracion</h1>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Tasas de Cambio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rateVes">1 USD = X Bolivares (VES)</Label>
              <Input
                id="rateVes"
                type="text"
                inputMode="decimal"
                value={rateVes}
                onChange={(e) => setRateVes(e.target.value)}
                placeholder="36.50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rateCop">1 USD = X Pesos (COP)</Label>
              <Input
                id="rateCop"
                type="text"
                inputMode="decimal"
                value={rateCop}
                onChange={(e) => setRateCop(e.target.value)}
                placeholder="4200"
              />
            </div>
          </div>
          <Button onClick={saveRates} size="sm">
            <Save className="mr-2 h-4 w-4" />
            Guardar Tasas
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Datos del Negocio</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="businessName">Nombre del Negocio</Label>
              <Input
                id="businessName"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="businessRif">RIF / NIT</Label>
              <Input
                id="businessRif"
                value={businessRif}
                onChange={(e) => setBusinessRif(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessAddress">Direccion</Label>
            <Input
              id="businessAddress"
              value={businessAddress}
              onChange={(e) => setBusinessAddress(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessPhone">Telefono</Label>
            <Input
              id="businessPhone"
              value={businessPhone}
              onChange={(e) => setBusinessPhone(e.target.value)}
            />
          </div>
          <Separator />
          <Button onClick={saveBusinessInfo} size="sm">
            <Save className="mr-2 h-4 w-4" />
            Guardar Datos
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Impresora
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="printerSelect">Impresora por defecto</Label>
            <div className="flex gap-2">
              <select
                id="printerSelect"
                className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                value={defaultPrinter}
                onChange={(e) => setDefaultPrinter(e.target.value)}
                disabled={loadingPrinters}
              >
                <option value="">Pedir al imprimir (mostrar dialogo)</option>
                {printers.map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.displayName}
                    {p.isDefault ? ' (sistema)' : ''}
                  </option>
                ))}
              </select>
              <Button
                variant="outline"
                size="icon"
                onClick={loadPrinters}
                disabled={loadingPrinters}
                title="Refrescar"
              >
                <RefreshCw className={`h-4 w-4 ${loadingPrinters ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            {printers.length === 0 && !loadingPrinters && (
              <p className="text-xs text-muted-foreground">
                No se detectaron impresoras. Verifica que esten conectadas e instaladas en Windows.
              </p>
            )}
          </div>
          {defaultPrinter && (
            <p className="text-xs text-muted-foreground">
              Con una impresora predeterminada configurada, al imprimir se enviara directamente sin mostrar dialogo del sistema.
            </p>
          )}
          <div className="space-y-2">
            <p className="text-sm font-medium">Comportamiento al finalizar una venta</p>
            <div className="space-y-2">
              {([
                ['never',  'No imprimir',  'Solo registra la venta. Para imprimir ve a Facturas y selecciona la que quieras.'],
                ['ask',    'Preguntar',    'Muestra un dialogo al terminar la venta con opcion de imprimir o continuar sin imprimir.'],
                ['always', 'Imprimir siempre', 'Imprime automaticamente al cerrar cada venta sin preguntar.'],
              ] as const).map(([val, label, desc]) => (
                <label
                  key={val}
                  className={`flex items-start gap-3 rounded-md border p-3 cursor-pointer transition-colors ${printAfterSale === val ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
                  onClick={() => setPrintAfterSale(val)}
                >
                  <span className={`mt-0.5 h-4 w-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${printAfterSale === val ? 'border-primary' : 'border-muted-foreground'}`}>
                    {printAfterSale === val && <span className="h-2 w-2 rounded-full bg-primary" />}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{desc}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          <Separator />
          <p className="text-sm font-medium">Formato del recibo (papel 58mm)</p>
          <div className="space-y-1">
            <Label className="text-xs">Titulo del recibo</Label>
            <Input
              placeholder="Ej: MI TIENDA, FACTURA, RECIBO..."
              value={receiptTitle}
              onChange={(e) => setReceiptTitle(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">Aparece en la parte superior de cada impresion. Dejar vacio para no mostrar.</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Tamano de letra (px)</Label>
              <Input
                type="number"
                min="10"
                max="20"
                value={receiptFontSize}
                onChange={(e) => setReceiptFontSize(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Recomendado: 13–15</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Margen lateral (mm)</Label>
              <Input
                type="number"
                min="1"
                max="15"
                value={receiptMargin}
                onChange={(e) => setReceiptMargin(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Aumentar si se corta el borde</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Grosor de letra</Label>
              <div className="flex gap-1">
                {([['400', 'Normal'], ['700', 'Negrita'], ['900', 'Muy negrita']] as const).map(([val, label]) => (
                  <Button
                    key={val}
                    type="button"
                    variant={receiptFontWeight === val ? 'default' : 'outline'}
                    size="sm"
                    className="flex-1 text-xs px-1"
                    onClick={() => setReceiptFontWeight(val)}
                  >
                    {label}
                  </Button>
                ))}
              </div>
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button onClick={savePrinter} size="sm">
              <Save className="mr-2 h-4 w-4" />
              Guardar
            </Button>
            <Button onClick={testPrint} size="sm" variant="outline">
              <Printer className="mr-2 h-4 w-4" />
              Imprimir prueba
            </Button>
          </div>
          {printMessage && (
            <p className="text-xs text-muted-foreground border-t pt-2">{printMessage}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Hora del Sistema
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-3xl font-mono font-bold text-center">
            {format(currentTime, 'HH:mm:ss')}
          </div>
          <div className="text-center text-sm text-muted-foreground">
            {format(currentTime, 'dd/MM/yyyy')}
          </div>
          <Separator />
          <p className="text-xs text-muted-foreground">
            La app usa la hora de tu computadora. Si la hora no es correcta, ajustala desde la configuracion de fecha y hora de Windows.
          </p>
        </CardContent>
      </Card>

      {netInfo?.role !== 'client' && (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            Exportar / Importar Excel
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Exporta tus datos como CSV (Excel los abre directamente) o restaura inventario desde un CSV.
          </p>
          <div className="grid grid-cols-3 gap-3">
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-2"
              onClick={() => handleExport('inventory')}
              disabled={exporting !== null || importing}
            >
              <Package className="h-6 w-6" />
              <span className="font-medium text-sm">
                {exporting === 'inventory' ? 'Exportando...' : 'Exportar Inventario'}
              </span>
              <span className="text-xs text-muted-foreground">
                Todos los productos
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-2"
              onClick={() => handleExport('invoices')}
              disabled={exporting !== null || importing}
            >
              <FileText className="h-6 w-6" />
              <span className="font-medium text-sm">
                {exporting === 'invoices' ? 'Exportando...' : 'Exportar Facturas'}
              </span>
              <span className="text-xs text-muted-foreground">
                Historial completo
              </span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex flex-col gap-2 border-blue-500/40 hover:bg-blue-500/10"
              onClick={() => setImportConfirmOpen(true)}
              disabled={exporting !== null || importing}
            >
              <Upload className="h-6 w-6 text-blue-500" />
              <span className="font-medium text-sm">
                {importing ? 'Importando...' : 'Importar Inventario'}
              </span>
              <span className="text-xs text-muted-foreground">
                Restaurar desde CSV
              </span>
            </Button>
          </div>
          {exportMsg && (
            <p className="text-xs text-muted-foreground break-all border-t pt-2">
              {exportMsg}
            </p>
          )}
        </CardContent>
      </Card>
      )}

      {/* Import Confirm Dialog */}
      <Dialog open={importConfirmOpen} onOpenChange={setImportConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Importar Inventario
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p>
              Selecciona un archivo CSV con la misma estructura que el export de inventario.
            </p>
            <div className="bg-muted/50 p-3 rounded-md space-y-1 text-xs">
              <p className="font-medium">Comportamiento:</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Si el codigo de barras coincide con un producto existente, se actualizara.</li>
                <li>Si no coincide pero el nombre si, tambien se actualizara.</li>
                <li>Si no coincide nada, se creara como producto nuevo.</li>
                <li>Las categorias nuevas se crean automaticamente.</li>
              </ul>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-md text-xs">
              <p className="font-medium text-amber-600 dark:text-amber-400">
                Se hace un respaldo automatico antes y despues de importar.
              </p>
              <p className="text-muted-foreground mt-1">
                Si algo sale mal, puedes restaurar el .db anterior desde la carpeta de respaldos.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleImport}>
              <Upload className="mr-2 h-4 w-4" />
              Seleccionar archivo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Result Dialog */}
      <Dialog open={importResultOpen} onOpenChange={setImportResultOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resultado de la Importacion</DialogTitle>
          </DialogHeader>
          {importResult && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-3 rounded-md bg-green-500/10 border border-green-500/30">
                  <p className="text-2xl font-bold text-green-600">{importResult.added}</p>
                  <p className="text-xs text-muted-foreground">Productos agregados</p>
                </div>
                <div className="p-3 rounded-md bg-blue-500/10 border border-blue-500/30">
                  <p className="text-2xl font-bold text-blue-600">{importResult.updated}</p>
                  <p className="text-xs text-muted-foreground">Actualizados</p>
                </div>
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/30">
                  <p className="text-2xl font-bold text-red-600">{importResult.errors.length}</p>
                  <p className="text-xs text-muted-foreground">Errores</p>
                </div>
              </div>
              {importResult.errors.length > 0 && (
                <div className="border rounded-md max-h-48 overflow-y-auto">
                  <p className="text-xs font-medium p-2 border-b bg-muted/50">Detalles de errores:</p>
                  {importResult.errors.map((e, idx) => (
                    <p key={idx} className="text-xs px-2 py-1 border-b last:border-0">
                      <span className="font-mono text-muted-foreground">Fila {e.row}:</span> {e.reason}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setImportResultOpen(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Network className="h-5 w-5" />
            Red / Multi-terminal
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {netInfo?.role === 'server' ? (
            <>
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Este equipo es el SERVIDOR (base de datos principal)</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    netInfo.running ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                {netInfo.running
                  ? `Servidor activo, escuchando en el puerto ${netInfo.runningPort}`
                  : netEnabled
                    ? 'Servidor detenido (revisa el puerto o el firewall)'
                    : 'Servidor desactivado'}
              </div>

              {netInfo.running && netInfo.addresses.length > 0 && (
                <div className="rounded-md border p-3 bg-muted/30 space-y-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    Direcciones para las terminales de acceso
                  </p>
                  {netInfo.addresses.map((addr) => (
                    <p key={addr} className="font-mono text-sm">
                      {addr}:{netInfo.runningPort}
                    </p>
                  ))}
                  <p className="text-xs text-muted-foreground pt-1">
                    En cada terminal de acceso escribe una de estas direcciones. Ideal fijar la IP de este PC en el router.
                  </p>
                </div>
              )}

              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={netEnabled}
                  onChange={(e) => setNetEnabled(e.target.checked)}
                />
                Compartir la base de datos con otras terminales en esta red
              </label>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">Puerto</Label>
                  <Input
                    type="number"
                    value={netPort}
                    onChange={(e) => setNetPort(e.target.value)}
                    placeholder="47600"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Clave de acceso</Label>
                  <Input
                    value={netToken}
                    onChange={(e) => setNetToken(e.target.value)}
                    placeholder="La escribiran las terminales al conectar"
                  />
                </div>
              </div>

              <Button onClick={saveNet} size="sm" disabled={savingNet}>
                <Save className="mr-2 h-4 w-4" />
                {savingNet ? 'Aplicando...' : 'Guardar y aplicar'}
              </Button>

              <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-md text-xs space-y-1">
                <p className="font-medium text-amber-600 dark:text-amber-400">
                  Para que las terminales conecten, permite el puerto en el Firewall de Windows.
                </p>
                <p className="text-muted-foreground break-all">
                  Ejecuta una vez (CMD como administrador):
                </p>
                <p className="font-mono break-all">
                  netsh advfirewall firewall add rule name=&quot;Facturacion POS&quot; dir=in action=allow protocol=TCP localport={netPort}
                </p>
              </div>
              {netMsg && (
                <p className="text-xs text-muted-foreground break-all border-t pt-2">{netMsg}</p>
              )}
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    netInfo?.connected ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                {netInfo?.connected
                  ? `Conectado al servidor ${netInfo.serverHost}`
                  : 'Sin conexion con el servidor'}
              </div>
              <p className="text-sm text-muted-foreground">
                Esta es una <strong>terminal de acceso</strong>: usa la base de datos del servidor
                principal por la red. Si cambia la IP del servidor o la clave, actualizalas aqui.
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">IP del servidor</Label>
                  <Input
                    value={netHost}
                    onChange={(e) => setNetHost(e.target.value)}
                    placeholder="Ej: 192.168.1.50"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Clave de acceso</Label>
                  <Input
                    type="password"
                    value={netToken}
                    onChange={(e) => setNetToken(e.target.value)}
                    placeholder="La misma del servidor"
                  />
                </div>
              </div>
              <Button onClick={reconnectClient} size="sm" disabled={savingNet}>
                <Network className="mr-2 h-4 w-4" />
                {savingNet ? 'Conectando...' : 'Reconectar'}
              </Button>
              {netMsg && (
                <p className="text-xs text-muted-foreground break-all border-t pt-2">{netMsg}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {netInfo?.role !== 'client' && (
      <>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Database className="h-5 w-5" />
            Ubicacion de la Base de Datos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Aqui se guardan todas tus ventas, productos, clientes y configuraciones.
            Puedes moverla a otro disco o USB sin perder datos. La app se reiniciara automaticamente.
          </p>
          {dbInfo && (
            <div className="space-y-2 text-sm">
              <div className="rounded-md border p-3 bg-muted/30">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Ubicacion actual
                </p>
                <p className="font-mono break-all">{dbInfo.currentPath}</p>
                {!dbInfo.isDefault && (
                  <p className="text-xs text-blue-500 mt-1">Ubicacion personalizada</p>
                )}
              </div>
              {!dbInfo.isDefault && (
                <p className="text-xs text-muted-foreground">
                  Por defecto: <span className="font-mono">{dbInfo.defaultPath}</span>
                </p>
              )}
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleChangeDbLocation} size="sm" disabled={movingDb}>
              <MoveRight className="mr-2 h-4 w-4" />
              {movingDb ? 'Moviendo...' : 'Cambiar Ubicacion'}
            </Button>
            {dbInfo && !dbInfo.isDefault && (
              <Button
                onClick={handleResetDbLocation}
                size="sm"
                variant="outline"
                disabled={movingDb}
              >
                Volver al Lugar por Defecto
              </Button>
            )}
          </div>
          <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded-md text-xs space-y-1">
            <p className="font-medium text-amber-600 dark:text-amber-400">
              Antes de mover se crea un respaldo automatico.
            </p>
            <p className="text-muted-foreground">
              Si eliges una carpeta en un USB, recuerda que la app no podra abrirse si el USB
              no esta conectado. Para mas seguridad, deja la DB en el disco interno y solo guarda
              respaldos en el USB.
            </p>
          </div>
          {dbMessage && (
            <p className="text-xs text-muted-foreground break-all border-t pt-2">
              {dbMessage}
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <ShieldCheck className="h-5 w-5" />
            Respaldos Automaticos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Cada venta y cambio de inventario genera un respaldo automatico, ademas de uno cada hora (se conservan los ultimos 50).
            Si se va la luz o el sistema falla, la app restaura sola el ultimo respaldo valido al iniciar. Tambien puedes
            restaurar manualmente cualquiera de la lista con el boton &quot;Restaurar&quot;.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleBackupNow} size="sm" disabled={backingUp}>
              <HardDrive className="mr-2 h-4 w-4" />
              {backingUp ? 'Respaldando...' : 'Respaldar Ahora'}
            </Button>
            <Button onClick={() => window.api.openBackupFolder()} size="sm" variant="outline">
              <FolderOpen className="mr-2 h-4 w-4" />
              Abrir Carpeta
            </Button>
          </div>
          {backupDir && (
            <p className="text-xs text-muted-foreground break-all">
              Carpeta: {backupDir}
            </p>
          )}
          <Separator />
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {backups.length === 0 ? (
              <p className="text-sm text-muted-foreground">No hay respaldos aun.</p>
            ) : (
              backups.slice(0, 10).map((b) => (
                <div key={b.path} className="flex justify-between items-center gap-2 text-xs py-1 border-b last:border-0">
                  <span className="font-mono">{format(new Date(b.createdAt), 'dd/MM/yyyy HH:mm:ss')}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{formatSize(b.size)}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => handleRestore(b)}
                      title="Restaurar este respaldo"
                    >
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Restaurar
                    </Button>
                  </div>
                </div>
              ))
            )}
            {backups.length > 10 && (
              <p className="text-xs text-muted-foreground pt-1">
                + {backups.length - 10} respaldos mas
              </p>
            )}
          </div>
        </CardContent>
      </Card>
      </>
      )}

      {usbStatus?.portable && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Usb className="h-5 w-5" />
              Llave USB
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  usbStatus.connected && usbStatus.licenseOk ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-sm font-medium">
                {usbStatus.connected && usbStatus.licenseOk
                  ? 'USB conectado y autorizado'
                  : !usbStatus.connected
                    ? 'USB desconectado'
                    : 'Licencia invalida en el USB'}
              </span>
            </div>
            {usbStatus.usbDir && (
              <p className="text-xs text-muted-foreground break-all">
                Ubicacion: {usbStatus.usbDir}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              La aplicacion verifica el USB cada 5 segundos. Si se desconecta, se cerrara automaticamente.
              La base de datos y respaldos permanecen en esta PC.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Keyboard className="h-5 w-5" />
            Atajos de Teclado
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Pulsa una tecla o combinacion (Ctrl, Alt, Shift + tecla). Los atajos funcionan cuando no estas escribiendo en un campo de texto.
          </p>
          <input
            ref={captureInputRef}
            className="sr-only"
            onKeyDown={handleCaptureKeyDown}
            onBlur={() => setCapturingKey(null)}
            readOnly
          />
          <div className="space-y-2">
            {SHORTCUT_DEFS.map((def) => (
              <div key={def.key} className="flex items-center justify-between gap-3 rounded-md border p-2.5">
                <span className="text-sm flex-1">{def.label}</span>
                <div className="flex items-center gap-2">
                  {capturingKey === def.key ? (
                    <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded animate-pulse">
                      Presiona una tecla...
                    </span>
                  ) : (
                    <span
                      className={`text-xs font-mono px-2 py-1 rounded border min-w-[60px] text-center ${shortcuts[def.key] ? 'bg-muted font-semibold' : 'text-muted-foreground'}`}
                    >
                      {shortcuts[def.key] || 'sin atajo'}
                    </span>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs px-2"
                    onClick={() => startCapture(def.key)}
                    disabled={capturingKey !== null && capturingKey !== def.key}
                  >
                    {capturingKey === def.key ? 'Cancelar' : 'Editar'}
                  </Button>
                  {shortcuts[def.key] && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0"
                      onClick={() => setShortcuts((prev) => ({ ...prev, [def.key]: '' }))}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <Button onClick={saveShortcuts} size="sm">
            <Save className="mr-2 h-4 w-4" />
            Guardar Atajos
          </Button>
        </CardContent>
      </Card>

      <div className="text-center text-sm text-muted-foreground pt-4">
        App desarrollada por El Garaje Gamer · v{APP_VERSION}
      </div>

      {saved && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg">
          Guardado correctamente
        </div>
      )}
    </div>
  )
}
