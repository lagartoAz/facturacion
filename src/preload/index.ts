import { contextBridge, ipcRenderer } from 'electron'
import { createApi, type ApiType } from '../shared/create-api'

// Desktop transport: forward every api call straight to the main process via IPC.
const api = createApi((channel, ...args) => ipcRenderer.invoke(channel, ...args))

contextBridge.exposeInMainWorld('api', api)

export type { ApiType }
