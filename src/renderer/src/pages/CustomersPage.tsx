import { useEffect, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from '@/components/ui/dialog'
import { Plus, Search, Pencil, Trash2 } from 'lucide-react'

interface Customer {
  id: number
  name: string
  id_rif: string | null
  address: string | null
  phone: string | null
  email: string | null
  notes: string | null
}

const emptyForm = {
  name: '',
  id_rif: '',
  address: '',
  phone: '',
  email: '',
  notes: ''
}

export default function CustomersPage(): JSX.Element {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState(emptyForm)

  const loadCustomers = useCallback(async () => {
    setCustomers(await window.api.getCustomers(search || undefined))
  }, [search])

  useEffect(() => {
    loadCustomers()
  }, [loadCustomers])

  function openNew(): void {
    setEditingId(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  function openEdit(c: Customer): void {
    setEditingId(c.id)
    setForm({
      name: c.name,
      id_rif: c.id_rif || '',
      address: c.address || '',
      phone: c.phone || '',
      email: c.email || '',
      notes: c.notes || ''
    })
    setDialogOpen(true)
  }

  async function handleSave(): Promise<void> {
    const data = {
      name: form.name,
      id_rif: form.id_rif || undefined,
      address: form.address || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
      notes: form.notes || undefined
    }

    if (editingId) {
      await window.api.updateCustomer(editingId, data)
    } else {
      await window.api.createCustomer(data)
    }

    setDialogOpen(false)
    loadCustomers()
  }

  async function handleDelete(id: number): Promise<void> {
    if (confirm('Estas seguro de eliminar este cliente?')) {
      await window.api.deleteCustomer(id)
      loadCustomers()
    }
  }

  function updateForm(field: string, value: string): void {
    setForm((f) => ({ ...f, [field]: value }))
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Clientes</h1>
        <Button onClick={openNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Buscar por nombre o RIF..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Nombre</th>
              <th className="text-left p-3 font-medium">RIF / Cedula</th>
              <th className="text-left p-3 font-medium">Telefono</th>
              <th className="text-left p-3 font-medium">Email</th>
              <th className="text-left p-3 font-medium">Direccion</th>
              <th className="text-center p-3 font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t hover:bg-muted/30">
                <td className="p-3 font-medium">{c.name}</td>
                <td className="p-3">{c.id_rif || '-'}</td>
                <td className="p-3">{c.phone || '-'}</td>
                <td className="p-3">{c.email || '-'}</td>
                <td className="p-3 max-w-[200px] truncate">{c.address || '-'}</td>
                <td className="p-3 text-center space-x-1">
                  <Button variant="ghost" size="icon" onClick={() => openEdit(c)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </td>
              </tr>
            ))}
            {customers.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-muted-foreground">
                  No hay clientes registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nombre *</Label>
              <Input value={form.name} onChange={(e) => updateForm('name', e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>RIF / Cedula</Label>
                <Input value={form.id_rif} onChange={(e) => updateForm('id_rif', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Telefono</Label>
                <Input value={form.phone} onChange={(e) => updateForm('phone', e.target.value)} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => updateForm('email', e.target.value)}
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
              <Input value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={!form.name}>
              {editingId ? 'Guardar Cambios' : 'Crear Cliente'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
