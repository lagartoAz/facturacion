import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Gift, CheckCircle2, XCircle } from 'lucide-react'
import { useLoyalty } from '@/hooks/useLoyalty'

// Status card for the Fidelidad add-on. Activation is NOT done here — it is
// installed by a separate activator .exe (there is no key/code to type). This
// card only reports the state and lets the owner deactivate (with a typed
// confirmation).
export default function LoyaltyActivationCard(): JSX.Element {
  const { status, refresh } = useLoyalty()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [busy, setBusy] = useState(false)

  async function deactivate(): Promise<void> {
    if (confirmText.trim().toLowerCase() !== 'desactivar') return
    setBusy(true)
    try {
      await window.api.deactivateLoyalty()
      await refresh()
      setConfirmOpen(false)
      setConfirmText('')
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
              El sistema de puntos de fidelidad está activo. Cada compra acumula puntos al cliente.
            </p>
            <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
              Desactivar
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-muted-foreground">
              <XCircle className="h-5 w-5" />
              <span className="font-medium">Desactivado</span>
            </div>
            <p className="text-sm text-muted-foreground">
              Este complemento se instala con el <strong>activador</strong> que se entrega aparte.
              Ejecútalo en esta PC y vuelve a abrir la aplicación; no se activa con códigos ni
              claves.
            </p>
          </>
        )}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desactivar Fidelidad</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Esto ocultará el complemento de Fidelidad. Los puntos y rifas guardados no se borran,
              pero dejarán de acumularse y canjearse hasta reactivarlo con el activador.
            </p>
            <p className="text-sm">
              Para confirmar, escribe <strong>desactivar</strong>:
            </p>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="desactivar"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={busy || confirmText.trim().toLowerCase() !== 'desactivar'}
              onClick={deactivate}
            >
              Desactivar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
