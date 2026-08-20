import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Printer, Loader2 } from 'lucide-react'
import type { ThermalConfig } from '../../../shared/create-api'
import type { ReceiptData } from '../../../shared/receipt'

const SAMPLE: ReceiptData = {
  title: 'PRUEBA DE IMPRESION',
  invoiceNumber: 'TEST-0001',
  dateText: '01/01/2026 12:00',
  items: [{ name: 'Producto de prueba', qty: '1', unitPrice: '1.00', total: '1.00' }],
  totalText: '1.00',
  paymentLines: [{ label: '', amount: '1.00' }],
  thanks: 'Impresora configurada correctamente'
}

// Android-only: choose and configure a thermal (ESC/POS) printer over WiFi/network
// or Bluetooth. Shown in Settings when running inside the mobile app.
export default function ThermalPrinterCard(): JSX.Element {
  const [cfg, setCfg] = useState<ThermalConfig>({ transport: 'none' })
  const [status, setStatus] = useState('')
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    void window.api.getThermalPrinter().then(setCfg)
  }, [])

  function update(patch: Partial<ThermalConfig>): void {
    setCfg((c) => ({ ...c, ...patch }))
    setStatus('')
  }

  async function save(): Promise<void> {
    await window.api.setThermalPrinter(cfg)
    setStatus('Configuracion guardada.')
  }

  async function testPrint(): Promise<void> {
    setTesting(true)
    setStatus('')
    try {
      await window.api.setThermalPrinter(cfg)
      const r = await window.api.printReceipt('', SAMPLE)
      setStatus(r.success ? 'Impresion enviada correctamente.' : `Error: ${r.error}`)
    } finally {
      setTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Printer className="h-5 w-5" />
          Impresora termica
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>Conexion</Label>
          <select
            className="w-full h-10 rounded-md border bg-background px-3 text-sm"
            value={cfg.transport}
            onChange={(e) => update({ transport: e.target.value as ThermalConfig['transport'] })}
          >
            <option value="none">Sin impresora</option>
            <option value="network">Red / WiFi (IP)</option>
            <option value="bluetooth">Bluetooth</option>
          </select>
        </div>

        {cfg.transport === 'network' && (
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Direccion IP de la impresora</Label>
              <Input
                value={cfg.ip ?? ''}
                onChange={(e) => update({ ip: e.target.value.trim() })}
                placeholder="Ej: 192.168.1.87"
              />
            </div>
            <div className="space-y-2">
              <Label>Puerto</Label>
              <Input
                type="number"
                value={cfg.port ?? 9100}
                onChange={(e) => update({ port: parseInt(e.target.value) || 9100 })}
              />
            </div>
            <div className="space-y-2">
              <Label>Ancho de papel</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={cfg.width ?? 32}
                onChange={(e) => update({ width: parseInt(e.target.value) })}
              >
                <option value={32}>58 mm</option>
                <option value={48}>80 mm</option>
              </select>
            </div>
          </div>
        )}

        {cfg.transport === 'bluetooth' && (
          <div className="space-y-2">
            <Input
              value={cfg.btName ?? ''}
              onChange={(e) => update({ btName: e.target.value })}
              placeholder="Nombre de la impresora Bluetooth"
            />
            <p className="text-xs text-muted-foreground">
              La impresion por Bluetooth requiere emparejar la impresora en los ajustes del sistema y
              se habilitara en una actualizacion del dispositivo.
            </p>
          </div>
        )}

        <div className="flex gap-2">
          <Button onClick={save}>Guardar</Button>
          <Button variant="outline" onClick={testPrint} disabled={testing || cfg.transport === 'none'}>
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Imprimir prueba'}
          </Button>
        </div>
        {status && <p className="text-sm text-muted-foreground">{status}</p>}
      </CardContent>
    </Card>
  )
}
