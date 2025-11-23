'use client'

import { useState } from 'react'
import { useRealProtocolData } from '@/hooks/use-real-protocol-data'
import { FleetMetrics } from '@/components/dashboard/fleet-metrics'
import { ArkList } from '@/components/dashboard/ark-list'
import { FlowChart } from '@/components/dashboard/risk/flow-chart'
import { CompositionChart } from '@/components/dashboard/risk/composition-chart'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ProtocolSelectors } from '@/components/dashboard/selectors'
import { DEFAULT_NETWORK_ID } from '@/config/networks'

export default function DashboardPage() {
  const [networkId, setNetworkId] = useState(DEFAULT_NETWORK_ID)
  const [selectedFleetId, setSelectedFleetId] = useState<string | undefined>(undefined)

  const {
    availableFleets,
    selectedFleetId: activeFleetId,
    fleetMetrics,
    arks,
    collateralExposure,
    isLoading,
  } = useRealProtocolData(networkId, selectedFleetId)

  // Update local state if hook selected a default fleet
  if (!selectedFleetId && activeFleetId && activeFleetId !== selectedFleetId) {
    setSelectedFleetId(activeFleetId)
  }

  // Transform data for charts
  const flowData = {
    fleet: {
      id: 'fleet',
      name: 'Summer Fleet',
      value: fleetMetrics.tvl,
      percentage: 100,
      color: 'bg-primary',
    },
    arks: arks.map((ark, index) => ({
      id: ark.id,
      name: ark.name,
      value: ark.allocation,
      percentage: ark.weight,
      color: index % 2 === 0 ? 'bg-purple-500' : 'bg-blue-500',
    })),
    collateral: collateralExposure.map((item, index) => ({
      id: item.asset,
      name: item.asset,
      value: item.amount,
      percentage: item.percentage,
      color: index % 2 === 0 ? 'bg-green-500' : 'bg-yellow-500',
    })),
  }

  const compositionData = collateralExposure.map((item) => ({
    name: item.asset,
    value: item.percentage,
  }))

  return (
    <div className="space-y-8 animate-fade-in-up">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Fleet Command</h1>
          <p className="text-muted-foreground">Overview of active strategies and risk exposure.</p>
        </div>
        <ProtocolSelectors
          selectedNetworkId={networkId}
          onNetworkChange={(id) => {
            setNetworkId(id)
            setSelectedFleetId(undefined) // Reset fleet on network change
          }}
          fleets={availableFleets}
          selectedFleetId={activeFleetId}
          onFleetChange={setSelectedFleetId}
        />
      </div>

      {isLoading ? (
        <div className="w-full h-64 flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          <FleetMetrics metrics={fleetMetrics} />

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
            <div className="xl:col-span-2 space-y-8">
              <div className="bg-white rounded-3xl border border-border p-6 shadow-sm">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-xl font-bold">Capital Flow & Risk Trace</h3>
                    <p className="text-sm text-muted-foreground">
                      Trace capital from Fleet to Underlying Collateral
                    </p>
                  </div>
                  <Tabs defaultValue="flow" className="w-[200px]">
                    <TabsList className="grid w-full grid-cols-2 rounded-full">
                      <TabsTrigger value="flow" className="rounded-full">
                        Flow
                      </TabsTrigger>
                      <TabsTrigger value="depth" className="rounded-full">
                        Depth
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                <FlowChart data={flowData} />
              </div>

              <ArkList arks={arks} />
            </div>

            <div className="space-y-8">
              <CompositionChart data={compositionData} />

              <div className="bg-primary/5 rounded-3xl border border-primary/20 p-6">
                <h3 className="text-lg font-bold mb-4 text-primary">Protocol Health</h3>
                <div className="space-y-4">
                  <HealthItem
                    label="Buffer Solvency"
                    value={`${fleetMetrics.bufferHealth}%`}
                    status="good"
                  />
                  <HealthItem
                    label="Deposit Utilization"
                    value={`${fleetMetrics.depositUtilization.toFixed(1)}%`}
                    status="neutral"
                  />
                  <HealthItem
                    label="Tip Rate"
                    value={`${fleetMetrics.tipRate.toFixed(2)}%`}
                    status="good"
                  />
                  <HealthItem
                    label="Active Strategies"
                    value={`${fleetMetrics.totalArks}`}
                    status="neutral"
                  />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function HealthItem({
  label,
  value,
  status,
}: {
  label: string
  value: string
  status: 'good' | 'warning' | 'neutral'
}) {
  const color =
    status === 'good' ? 'bg-green-500' : status === 'warning' ? 'bg-yellow-500' : 'bg-gray-400'
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm font-medium text-muted-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="font-bold">{value}</span>
        <div className={`w-2 h-2 rounded-full ${color}`} />
      </div>
    </div>
  )
}
