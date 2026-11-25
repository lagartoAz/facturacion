import { ipcMain } from 'electron'
import type Database from 'better-sqlite3'
import {
  LoyaltyService,
  type LoyaltyConfig,
  type LoyaltyLevel,
  type LevelBenefit,
  type Reward
} from '../services/loyalty.service'
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

  // Levels + benefits
  ipcMain.handle('loyalty:listLevels', () => service.listLevels())
  ipcMain.handle('loyalty:createLevel', (_event, level: Omit<LoyaltyLevel, 'id'>) =>
    service.createLevel(level)
  )
  ipcMain.handle('loyalty:updateLevel', (_event, id: number, level: Partial<LoyaltyLevel>) => {
    service.updateLevel(id, level)
    return service.listLevels()
  })
  ipcMain.handle('loyalty:deleteLevel', (_event, id: number) => {
    service.deleteLevel(id)
    return service.listLevels()
  })
  ipcMain.handle('loyalty:levelBenefits', (_event, levelId: number) =>
    service.levelBenefits(levelId)
  )
  ipcMain.handle(
    'loyalty:setLevelBenefits',
    (_event, levelId: number, benefits: Omit<LevelBenefit, 'id' | 'level_id'>[]) => {
      service.setLevelBenefits(levelId, benefits)
      return service.levelBenefits(levelId)
    }
  )
  ipcMain.handle('loyalty:customerLevel', (_event, customerId: number) =>
    service.customerLevel(customerId)
  )
  ipcMain.handle('loyalty:levelDiscount', (_event, customerId: number | null, subtotal: number) =>
    service.levelDiscountFor(customerId, subtotal)
  )
  ipcMain.handle('loyalty:ticketBalance', (_event, customerId: number) =>
    service.ticketBalance(customerId)
  )
  ipcMain.handle('loyalty:processMonthly', () => {
    service.processMonthlyBenefits()
    return true
  })

  // Points
  ipcMain.handle('loyalty:balance', (_event, customerId: number) => service.balance(customerId))
  ipcMain.handle('loyalty:allBalances', () => service.allBalances())
  ipcMain.handle('loyalty:summaryByCustomer', () => service.summaryByCustomer())
  ipcMain.handle('loyalty:levelsByCustomer', () => service.levelsByCustomer())
  ipcMain.handle('loyalty:pointsByInvoice', () => service.pointsByInvoice())
  ipcMain.handle('loyalty:ticketsByInvoice', () => service.ticketsByInvoice())

  // Physical raffle tickets
  ipcMain.handle('loyalty:ticketsForInvoice', (_event, invoiceId: number) =>
    service.ticketsForInvoice(invoiceId)
  )
  ipcMain.handle('loyalty:markTicketsPrinted', (_event, invoiceId: number) => {
    service.markTicketsPrinted(invoiceId)
    return true
  })
  ipcMain.handle('loyalty:ticketsPrintedIds', () => service.ticketsPrintedIds())
  ipcMain.handle('loyalty:earnedTicketsReport', () => service.earnedTicketsReport())
  ipcMain.handle('loyalty:redemptionsReport', (_event, limit?: number) =>
    service.redemptionsReport(limit)
  )
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

  // Discount coupons (POS)
  ipcMain.handle('loyalty:activeCoupons', (_event, customerId: number) =>
    service.activeCoupons(customerId)
  )
  ipcMain.handle('loyalty:allCoupons', (_event, customerId: number) =>
    service.allCoupons(customerId)
  )
  ipcMain.handle('loyalty:affordableDiscountRewards', (_event, customerId: number) =>
    service.affordableDiscountRewards(customerId)
  )

  // Points preview / per-invoice summary
  ipcMain.handle(
    'loyalty:previewSale',
    (
      _event,
      ctx: {
        customerId: number | null
        invoiceId: number
        totalUsd: number
        paymentMethod: string
        currency: string
        items: { productId?: number | null; quantity: number }[]
      }
    ) => service.previewSale(ctx)
  )
  ipcMain.handle('loyalty:invoiceSummary', (_event, invoiceId: number) =>
    service.invoiceLoyaltySummary(invoiceId)
  )

  // Points-based reports
  ipcMain.handle('loyalty:dailyPoints', (_event, from: string, to: string, customerId?: number) =>
    service.dailyPoints(from, to, customerId)
  )
  ipcMain.handle('loyalty:hourlyPoints', (_event, day: string, customerId?: number) =>
    service.hourlyPoints(day, customerId)
  )
  ipcMain.handle('loyalty:pointsSummary', (_event, from: string, to: string, customerId?: number) =>
    service.pointsSummary(from, to, customerId)
  )
  ipcMain.handle('loyalty:monthlyPoints', (_event, from: string, to: string, customerId?: number) =>
    service.monthlyPoints(from, to, customerId)
  )
  ipcMain.handle('loyalty:topProductsByPoints', (_event, from: string, to: string, limit?: number) =>
    service.topProductsByPoints(from, to, limit)
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
  ipcMain.handle('loyalty:redrawRaffle', (_event, raffleId: number) =>
    service.redrawRaffle(raffleId)
  )
  ipcMain.handle('loyalty:createLevelRaffle', (_event, name: string, levelId: number) =>
    service.createLevelRaffle(name, levelId)
  )
  ipcMain.handle(
    'loyalty:addRaffleParticipant',
    (_event, raffleId: number, customerId: number) => {
      service.addRaffleParticipant(raffleId, customerId)
      return service.raffleParticipants(raffleId)
    }
  )
  ipcMain.handle(
    'loyalty:removeRaffleParticipant',
    (_event, raffleId: number, customerId: number) => {
      service.removeRaffleParticipant(raffleId, customerId)
      return service.raffleParticipants(raffleId)
    }
  )
}
