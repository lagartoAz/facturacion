import { useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useLoyalty, pointsActive } from '@/hooks/useLoyalty'
import { Gift, Lock, Users, Sliders, Award, Ticket, BadgeCheck, History } from 'lucide-react'
import LoyaltyCustomers from '@/components/loyalty/LoyaltyCustomers'
import LoyaltyRules from '@/components/loyalty/LoyaltyRules'
import LoyaltyRewards from '@/components/loyalty/LoyaltyRewards'
import LoyaltyRaffle from '@/components/loyalty/LoyaltyRaffle'
import LoyaltyLevels from '@/components/loyalty/LoyaltyLevels'
import LoyaltyTickets from '@/components/loyalty/LoyaltyTickets'
import LoyaltyHistory from '@/components/loyalty/LoyaltyHistory'

type Tab = 'clientes' | 'reglas' | 'niveles' | 'premios' | 'rifa' | 'tickets' | 'historial'

export default function LoyaltyPage(): JSX.Element {
  const { status } = useLoyalty()
  const [tab, setTab] = useState<Tab>('clientes')

  // Run the monthly perks when the page opens (idempotent per month).
  useEffect(() => {
    if (status.enabled) void window.api.processMonthlyBenefits()
  }, [status.enabled])

  // Safety net: the route is reachable even when the add-on is off (e.g. the
  // license was removed). Show a locked notice instead of an empty page.
  if (!status.enabled) {
    return (
      <div className="p-4 landscape:p-6">
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <Lock className="h-10 w-10 text-muted-foreground" />
            <p className="text-lg font-semibold">Fidelidad no esta activado</p>
            <p className="text-muted-foreground">
              Este complemento se activa con una clave desde Configuracion.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const withPoints = pointsActive(status.mode)
  const tabs: { key: Tab; label: string; icon: typeof Users; show: boolean }[] = [
    { key: 'clientes', label: 'Clientes', icon: Users, show: true },
    { key: 'reglas', label: 'Reglas', icon: Sliders, show: true },
    { key: 'niveles', label: 'Niveles', icon: BadgeCheck, show: withPoints && status.levels_enabled },
    { key: 'premios', label: 'Premios', icon: Award, show: withPoints && status.rewards_enabled },
    { key: 'rifa', label: 'Rifa', icon: Ticket, show: status.raffle_enabled },
    {
      key: 'tickets',
      label: 'Tickets',
      icon: Ticket,
      show: status.raffle_enabled && status.tickets_enabled
    },
    { key: 'historial', label: 'Historial', icon: History, show: true }
  ]

  // If the active tab got hidden (feature turned off), fall back to Clientes.
  const activeTab = tabs.find((t) => t.key === tab && t.show) ? tab : 'clientes'

  return (
    <div className="space-y-6 p-4 landscape:p-6">
      <div className="flex items-center gap-2">
        <Gift className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">Fidelidad</h1>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs
          .filter((t) => t.show)
          .map((t) => (
            <Button
              key={t.key}
              size="sm"
              variant={activeTab === t.key ? 'default' : 'outline'}
              onClick={() => setTab(t.key)}
            >
              <t.icon className="mr-1.5 h-4 w-4" />
              {t.label}
            </Button>
          ))}
      </div>

      {activeTab === 'clientes' && <LoyaltyCustomers />}
      {activeTab === 'reglas' && <LoyaltyRules />}
      {activeTab === 'niveles' && <LoyaltyLevels />}
      {activeTab === 'premios' && <LoyaltyRewards />}
      {activeTab === 'rifa' && <LoyaltyRaffle />}
      {activeTab === 'tickets' && <LoyaltyTickets />}
      {activeTab === 'historial' && <LoyaltyHistory />}
    </div>
  )
}
