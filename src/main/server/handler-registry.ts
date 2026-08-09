import { ipcMain, type IpcMainInvokeEvent } from 'electron'

type Handler = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown

const registry = new Map<string, Handler>()

// Runs the normal IPC registration while transparently recording every channel,
// so the RPC server can dispatch the exact same handlers to LAN clients without
// having to modify each ipc/*.ts file. ipcMain.handle is restored afterwards.
export function captureHandlers(register: () => void): void {
  const patched = ipcMain as unknown as { handle: (channel: string, listener: Handler) => void }
  const original = ipcMain.handle.bind(ipcMain)
  patched.handle = (channel: string, listener: Handler): void => {
    registry.set(channel, listener)
    original(channel, listener as Parameters<typeof original>[1])
  }
  try {
    register()
  } finally {
    patched.handle = original as unknown as typeof patched.handle
  }
}

export function hasChannel(channel: string): boolean {
  return registry.has(channel)
}

// Invokes a recorded handler as if it came from IPC. Remote-invoked data handlers
// ignore the event argument, so a minimal stub is passed.
export async function invokeChannel(channel: string, args: unknown[]): Promise<unknown> {
  const handler = registry.get(channel)
  if (!handler) throw new Error(`Canal desconocido: ${channel}`)
  return await handler({} as IpcMainInvokeEvent, ...args)
}
