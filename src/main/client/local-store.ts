import { homedir } from 'os'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'

// Machine-local key/value store for a client terminal. Deliberately uses the PC's
// home directory (NOT app.getPath('userData')) so that on a PORTABLE (USB) build
// the printer selection stays with the physical machine and does not travel on
// the USB. This guarantees a USB terminal always prints to a printer that exists
// on whatever PC it is plugged into (invoices/receipts keep working everywhere).
function storeDir(): string {
  const dir = join(homedir(), '.facturacion-acceso')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function storePath(): string {
  return join(storeDir(), 'local.json')
}

function readAll(): Record<string, string> {
  const p = storePath()
  if (!existsSync(p)) return {}
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, string>
  } catch {
    return {}
  }
}

export function localGet(key: string): string | undefined {
  return readAll()[key]
}

export function localSet(key: string, value: string): void {
  const all = readAll()
  all[key] = value
  writeFileSync(storePath(), JSON.stringify(all, null, 2), 'utf8')
}
