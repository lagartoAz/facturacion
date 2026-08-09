import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Plus, Search, Pencil, Trash2, Truck, PackagePlus, History } from 'lucide-react'
import PurchaseDialog from '@/components/suppliers/PurchaseDialog'
import PurchaseHistoryDialog from '@/components/suppliers/PurchaseHistoryDialog'

interface Supplier {
  id: number
  name: string
  contact_name: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  product_count: number
}

const emptyForm = {
  name: '',
  contact_name: '',
  phone: '',
  email: '',
  address: '',
  notes: ''
}

export default function SuppliersPage(): JSX.Element {
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [notification, setNotification] = useState('')
  const [purchaseSupplier, setPurchaseSupplier] = useState<Supplier | null>(null)
  const [historySupplier, setHistorySupplier] = useState<Supplier | null>(null)

  const loadSuppliers = useCallback(async () => {
    setSuppliers(await window.api.getSuppliers(search || undefined))
  }, [search])

  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  function showNotification(msg: string): void {
    setNotification(msg)
    setTimeout(() => setNotification(''), 3000)
  }

  function openNew(): void {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(s: Supplier): void {
    setEditingId(s.id)
    setForm({
      name: s.name,
      contact_name: s.contact_name || '',
      phone: s.phone || '',
      email: s.email || '',
      address: s.address || '',
      notes: s.notes || ''
    })
    setDialogOpen(true)
  }

  async function handleSave(): Promise<void> {
    const data = {
      name: form.name,
      contact_name: form.contact_name || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      address: form.address || undefined,
      notes: form.notes || undefined
    }
    if (editingId) {
      await window.api.updateSupplier(editingId, data)
      showNotification('Proveedor actualizado')
    } else {
      await window.api.createSupplier(data)
      showNotification('Proveedor creado')
    }
    setDialogOpen(false)
    loadSuppliers()
  }

  async function handleDelete(s: Supplier): Promise<void> {
    const msg = s.product_count > 0
      ? `Este proveedor tiene ${s.product_count} producto(s) asignado(s). Al eliminarlo, esos productos quedaran sin proveedor. Continuar?`
      : 'Eliminar este proveedor?'
    if (!confirm(msg)) return
    await window.api.deleteSupplier(s.id)
    showNotification('Proveedor eliminado')
    loadSuppliers()
  }

  function updateForm(field: string, value: string): void {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Proveedores</h1>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Proveedor
        </Button>
      </div>

      <div className="flex items-center gap-4">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar por nombre, contacto o telefono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <span className="text-sm text-muted-foreground">
          <strong className="text-foreground">{suppliers.length}</strong> proveedores
        </span>
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Nombre</th>
              <th className="text-left p-3 font-medium">Contacto</th>
              <th className="text-left p-3 font-medium">Telefono</th>
              <th className="text-left p-3 font-medium">Email</th>
              <th className="text-center p-3 font-medium">Productos</th>
              <th className="text-center p-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">
                  <div className="flex items-center gap-2">
                    <Truck className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    {s.name}
                  </div>
                </td>
                <td className="p-3">{s.contact_name || '-'}</td>
                <td className="p-3">{s.phone || '-'}</td>
                <td className="p-3">{s.email || '-'}</td>
                <td className="p-3 text-center">
                  <Badge variant={s.product_count > 0 ? 'default' : 'secondary'}>
                    {s.product_count} {s.product_count === 1 ? 'producto' : 'productos'}
                  </Badge>
                </td>
                <td className="p-3 text-center whitespace-nowrap space-x-1">
                  <Button variant="outline" size="sm" onClick={() => setPurchaseSupplier(s)} title="Registrar ingreso de productos">
                    <PackagePlus className="mr-1 h-4 w-4" />
                    Factura nueva
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setHistorySupplier(s)} title="Ver historial de ingresos">
                    <History className="mr-1 h-4 w-4" />
                    Historial
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => openEdit(s)} title="Editar">
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(s)} title="Eliminar">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
            {suppliers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No hay proveedores registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Proveedor' : 'Nuevo Proveedor'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input
                value={form.name}
                onChange={(e) => updateForm('name', e.target.value)}
                placeholder="Nombre del proveedor o empresa"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Persona de Contacto</Label>
                <Input
                  value={form.contact_name}
                  onChange={(e) => updateForm('contact_name', e.target.value)}
                  placeholder="Nombre del contacto"
                />
              </div>
              <div className="space-y-2">
                <Label>Telefono</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => updateForm('phone', e.target.value)}
                  placeholder="0412-0000000"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => updateForm('email', e.target.value)}
                placeholder="correo@proveedor.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Direccion</Label>
              <Input
                value={form.address}
                onChange={(e) => updateForm('address', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Notas</Label>
              <Input
                value={form.notes}
                onChange={(e) => updateForm('notes', e.target.value)}
                placeholder="Condiciones de pago, dias de entrega..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!form.name.trim()}>
              {editingId ? 'Guardar Cambios' : 'Crear Proveedor'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PurchaseDialog
        open={purchaseSupplier !== null}
        onOpenChange={(o) => !o && setPurchaseSupplier(null)}
        supplier={purchaseSupplier}
        onSaved={(msg) => {
          showNotification(msg)
          setPurchaseSupplier(null)
          loadSuppliers()
        }}
      />

      <PurchaseHistoryDialog
        open={historySupplier !== null}
        onOpenChange={(o) => !o && setHistorySupplier(null)}
        supplier={historySupplier}
      />

      {notification && (
        <div className="fixed bottom-4 right-4 bg-green-600 text-white px-4 py-2 rounded-md shadow-lg">
          {notification}
        </div>
      )}
    </div>
  )
}
