import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Save } from 'lucide-react'

export default function SettingsPage(): JSX.Element {
  const [rateVes, setRateVes] = useState('')
  const [rateCop, setRateCop] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessRif, setBusinessRif] = useState('')
  const [businessAddress, setBusinessAddress] = useState('')
  const [businessPhone, setBusinessPhone] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    loadSettings()
  }, [])

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
                type="number"
                step="0.01"
                value={rateVes}
                onChange={(e) => setRateVes(e.target.value)}
                placeholder="36.50"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rateCop">1 USD = X Pesos (COP)</Label>
              <Input
                id="rateCop"
                type="number"
                step="1"
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

      <div className="text-center text-sm text-muted-foreground pt-4">
        App desarrollada por El Garaje Gamer
      </div>

      {saved && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg">
          Guardado correctamente
        </div>
      )}
    </div>
  )
}
