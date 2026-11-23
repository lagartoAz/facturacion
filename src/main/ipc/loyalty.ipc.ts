import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import { LoyaltyService, type LoyaltyConfig, type Reward } from '../services/loyalty.service'
import { SettingsService } from '../services/settings.service'
import { isLicensed, writeLicense, removeLicense } from '../services/license.service'

const FEATURE = 'loyalty'

// Keeps the DB flag that gates the feature in sync with the license file. The
// file is the proof of purchase (and what a complement installer drops in); the
// setting is what the rest of the app and remote LAN terminals read.
export function syncLoyaltyLicense(db: Database.Database): void {
  const settings = new SettingsService(db)
  settings.set('loyalty_enabled', isLicensed(FEATURE) ? '1' : '0')
}

export function registerLoyaltyHandlers(db: Database.Database): void {
  const service = new LoyaltyService(db)
  const settings = new SettingsService(db)

  // Licensing / status
  ipcMain.handle('loyalty:status', () => {
    return { ...service.getConfig(), licensed: isLicensed(FEATURE) }
  })
  ipcMain.handle('loyalty:activate', (_event, key: string) => {
    if (!writeLicense(FEATURE, key)) return { ok: false, error: 'Clave invalida' }
    settings.set('loyalty_enabled', '1')
    return { ok: true }
  })
  ipcMain.handle('loyalty:deactivate', () => {
    removeLicense(FEATURE)
    settings.set('loyalty_enabled', '0')
    return { ok: true }
  })

  // Config
  ipcMain.handle('loyalty:setConfig', (_event, cfg: Partial<LoyaltyConfig>) =>
    service.setConfig(cfg)
  )

  // Points
  ipcMain.handle('loyalty:balance', (_event, customerId: number) => service.balance(customerId))
  ipcMain.handle('loyalty:allBalances', () => service.allBalances())
  ipcMain.handle('loyalty:summaryByCustomer', () => service.summaryByCustomer())
  ipcMain.handle('loyalty:history', (_event, customerId: number, limit?: number) =>
    service.history(customerId, limit)
  )
  ipcMain.handle('loyalty:redeem', (_event, customerId: number, points: number, note?: string) =>
    service.redeem(customerId, points, note)
  )
  ipcMain.handle('loyalty:adjust', (_event, customerId: number, points: number, note?: string) =>
    service.adjust(customerId, points, note)
  )

  // Product points
  ipcMain.handle('loyalty:productPoints', () => service.productPoints())
  ipcMain.handle('loyalty:setProductPoints', (_event, productId: number, points: number) => {
    service.setProductPoints(productId, points)
    return service.productPoints()
  })

  // Rewards
  ipcMain.handle('loyalty:listRewards', (_event, activeOnly?: boolean) =>
    service.listRewards(activeOnly)
  )
  ipcMain.handle('loyalty:createReward', (_event, reward: Omit<Reward, 'id' | 'active'>) =>
    service.createReward(reward)
  )
  ipcMain.handle('loyalty:updateReward', (_event, id: number, reward: Partial<Reward>) => {
    service.updateReward(id, reward)
    return service.listRewards()
  })
  ipcMain.handle('loyalty:deleteReward', (_event, id: number) => {
    service.deleteReward(id)
    return service.listRewards()
  })
  ipcMain.handle('loyalty:redeemReward', (_event, customerId: number, rewardId: number) =>
    service.redeemReward(customerId, rewardId)
  )

  // Raffle
  ipcMain.handle('loyalty:activeRaffle', () => service.getActiveRaffle())
  ipcMain.handle('loyalty:listRaffles', () => service.listRaffles())
  ipcMain.handle(
    'loyalty:createRaffle',
    (_event, name: string, pointsPerEntry: number, minPoints: number) =>
      service.createRaffle(name, pointsPerEntry, minPoints)
  )
  ipcMain.handle('loyalty:deleteRaffle', (_event, id: number) => {
    service.deleteRaffle(id)
    return service.listRaffles()
  })
  ipcMain.handle('loyalty:raffleParticipants', (_event, raffleId: number) =>
    service.raffleParticipants(raffleId)
  )
  ipcMain.handle('loyalty:drawRaffle', (_event, raffleId: number, rand: number) =>
    service.drawRaffle(raffleId, rand)
  )
}
