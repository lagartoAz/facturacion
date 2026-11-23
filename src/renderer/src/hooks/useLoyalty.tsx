import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

export interface LoyaltyStatus {
  enabled: boolean
  licensed: boolean
  // Earning rules
  earn_money: boolean
  points_per_usd: number
  earn_product: boolean
  earn_invoice: boolean
  points_per_invoice: number
  currency_filter: string
  exclude_credit: boolean
  // Rewards
  rewards_enabled: boolean
  redeem_value_usd: number
  // Raffle
  raffle_enabled: boolean
  raffle_points_per_entry: number
  raffle_min_points: number
  exclude_red_debtors: boolean
  raffle_animation: string
  tickets_enabled: boolean
  winner_template: string
}

interface LoyaltyContextValue {
  status: LoyaltyStatus
  loading: boolean
  refresh: () => Promise<void>
}

const DEFAULT: LoyaltyStatus = {
  enabled: false,
  licensed: false,
  earn_money: true,
  points_per_usd: 1,
  earn_product: false,
  earn_invoice: false,
  points_per_invoice: 0,
  currency_filter: '',
  exclude_credit: true,
  rewards_enabled: true,
  redeem_value_usd: 0.01,
  raffle_enabled: false,
  raffle_points_per_entry: 0,
  raffle_min_points: 0,
  exclude_red_debtors: false,
  raffle_animation: 'ruleta',
  tickets_enabled: false,
  winner_template: ''
}

const LoyaltyContext = createContext<LoyaltyContextValue>({
  status: DEFAULT,
  loading: true,
  refresh: async () => {}
})

// Fetches the loyalty add-on status once and shares it across the app, so the
// sidebar entry, the Fidelidad page and the activation card stay in sync after
// the feature is activated/deactivated.
export function LoyaltyProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<LoyaltyStatus>(DEFAULT)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const s = (await window.api.getLoyaltyStatus()) as LoyaltyStatus
      setStatus(s)
    } catch {
      setStatus(DEFAULT)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  return (
    <LoyaltyContext.Provider value={{ status, loading, refresh }}>
      {children}
    </LoyaltyContext.Provider>
  )
}

export function useLoyalty(): LoyaltyContextValue {
  return useContext(LoyaltyContext)
}
