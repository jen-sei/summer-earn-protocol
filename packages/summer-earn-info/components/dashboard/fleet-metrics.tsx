import { TrendingUp, DollarSign, PieChart, Wallet } from 'lucide-react'
import type { FleetMetric } from '@/lib/types'

interface FleetMetricsProps {
  metrics: FleetMetric
}

export function FleetMetrics({ metrics }: FleetMetricsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
      <MetricCard
        title="Total Value Locked"
        value={`$${(metrics.tvl / 1000000).toFixed(2)}M`}
        change="+2.4%"
        icon={<DollarSign className="w-6 h-6 text-white" />}
        color="bg-primary"
      />
      <MetricCard
        title="Share Price"
        value={metrics.sharePrice.toFixed(4)}
        change="+0.12%"
        icon={<TrendingUp className="w-6 h-6 text-white" />}
        color="bg-purple-500"
      />
      <MetricCard
        title="Deposit Utilization"
        value={`${metrics.depositUtilization}%`}
        change="-1.2%"
        icon={<PieChart className="w-6 h-6 text-white" />}
        color="bg-blue-500"
      />
      <MetricCard
        title="Buffer Health"
        value={`${metrics.bufferHealth}%`}
        change="Healthy"
        icon={<Wallet className="w-6 h-6 text-white" />}
        color="bg-green-500"
      />
    </div>
  )
}

function MetricCard({ title, value, change, icon, color }: any) {
  return (
    <div className="p-6 rounded-3xl bg-white border border-border shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-center justify-between mb-4">
        <div
          className={`w-12 h-12 rounded-2xl ${color} flex items-center justify-center shadow-lg shadow-${color.replace('bg-', '')}/20 group-hover:scale-110 transition-transform`}
        >
          {icon}
        </div>
        <span
          className={`text-sm font-medium px-2.5 py-1 rounded-full ${change.includes('-') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'}`}
        >
          {change}
        </span>
      </div>
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{title}</p>
        <h3 className="text-2xl font-bold text-foreground">{value}</h3>
      </div>
    </div>
  )
}
