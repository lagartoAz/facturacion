import { ipcMain, app } from 'electron'
import {
  getRole,
  getNetworkConfig,
  setNetworkConfig,
  getLanAddresses,
  type NetworkConfig
} from '../services/network-config.service'
import { startRpcServer, stopRpcServer, isRpcRunning, getRpcPort } from '../server/rpc-server'

export interface NetworkInfo {
  role: 'server' | 'client'
  serverEnabled: boolean
  serverPort: number
  token: string
  serverHost: string
  running: boolean
  runningPort: number
  addresses: string[]
  version: string
}

function info(): NetworkInfo {
  const cfg = getNetworkConfig()
  return {
    role: getRole(),
    serverEnabled: cfg.serverEnabled,
    serverPort: cfg.serverPort,
    token: cfg.token,
    serverHost: cfg.serverHost,
    running: isRpcRunning(),
    runningPort: getRpcPort(),
    addresses: getLanAddresses(),
    version: app.getVersion()
  }
}

export function registerNetworkHandlers(): void {
  ipcMain.handle('net:getInfo', () => info())

  // Apply server-side settings live (start/stop/restart the LAN server as needed).
  ipcMain.handle('net:setServerConfig', async (_event, patch: Partial<NetworkConfig>) => {
    const prev = getNetworkConfig()
    const next = setNetworkConfig(patch)
    if (getRole() === 'server') {
      const needsRestart =
        isRpcRunning() && (prev.serverPort !== next.serverPort || prev.token !== next.token)
      try {
        if (!next.serverEnabled && isRpcRunning()) {
          await stopRpcServer()
        } else if (next.serverEnabled && !isRpcRunning()) {
          await startRpcServer()
        } else if (next.serverEnabled && needsRestart) {
          await stopRpcServer()
          await startRpcServer()
        }
      } catch (err) {
        return { info: info(), error: (err as Error).message }
      }
    }
    return { info: info() }
  })
}
