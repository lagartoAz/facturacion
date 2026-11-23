import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Gift, CheckCircle2 } from 'lucide-react'
import { useLoyalty } from '@/hooks/useLoyalty'

// Activation card for the Fidelidad add-on. Lives in Configuracion so a key sold
// separately can be pasted here to unlock the feature without a new install.
export default function LoyaltyActivationCard(): JSX.Element {
  const { status, refresh } = useLoyalty()
  const [key, setKey] = useState('')
  const [busy, setBusy] = useState(false)

  async function activate(): Promise<void> {
    if (!key.trim()) return
    setBusy(true)
    try {
      const res = (await window.api.activateLoyalty(key.trim())) as {
        ok: boolean
        error?: string
      }
      if (res.ok) {
        setKey('')
        await refresh()
        alert('Fidelidad activado. El menu "Fidelidad" ya esta disponible.')
      } else {
        alert(res.error || 'Clave invalida')
      }
    } finally {
      setBusy(false)
    }
  }

  async function deactivate(): Promise<void> {
    if (!confirm('¿Desactivar el complemento de Fidelidad? Los puntos no se borran.')) return
    setBusy(true)
    try {
      await window.api.deactivateLoyalty()
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Gift className="h-5 w-5" />
          Complemento: Fidelidad
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status.enabled ? (
          <>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Activado</span>
            </div>
            <p className="text-sm text-muted-foreground">
              El sistema de puntos de fidelidad esta activo. Cada compra acumula puntos al cliente.
            </p>
            <Button variant="outline" size="sm" onClick={deactivate} disabled={busy}>
              Desactivar
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Sistema de puntos por compras de tus clientes. Ingresa la clave de activacion para
              habilitarlo.
            </p>
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label className="text-xs text-muted-foreground">Clave de activacion</label>
                <Input
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder="FID-XXXXX-XXXXX-XXXXX"
                />
              </div>
              <Button onClick={activate} disabled={busy || !key.trim()}>
                Activar
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
