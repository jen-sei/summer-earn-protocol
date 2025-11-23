import { ArrowRight } from 'lucide-react'

interface FlowNode {
  id: string
  name: string
  value: number
  percentage: number
  color: string
}

interface FlowChartProps {
  data: {
    fleet: FlowNode
    arks: FlowNode[]
    collateral: FlowNode[]
  }
}

export function FlowChart({ data }: FlowChartProps) {
  return (
    <div className="w-full h-[500px] bg-white rounded-3xl border border-border p-8 flex items-center justify-between gap-4 overflow-x-auto">
      {/* Level 1: Fleet */}
      <div className="flex flex-col justify-center h-full w-1/4 min-w-[200px]">
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 text-center">
          Fleet Command
        </h4>
        <div className="relative p-6 rounded-2xl bg-primary text-white shadow-xl shadow-primary/30 flex flex-col items-center justify-center h-48 group transition-all hover:scale-105 cursor-pointer">
          <div className="text-2xl font-bold mb-1">{data.fleet.name}</div>
          <div className="text-lg opacity-90">${(data.fleet.value / 1000000).toFixed(2)}M</div>
          <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rotate-45" />

          {/* Connection Lines (CSS approximations for visual flow) */}
          <svg
            className="absolute top-1/2 left-full w-24 h-[400px] -translate-y-1/2 pointer-events-none opacity-20 hidden md:block"
            style={{ transform: 'translateY(-50%)' }}
          >
            <path
              d="M0,200 C50,200 50,50 100,50"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M0,200 C50,200 50,150 100,150"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M0,200 C50,200 50,250 100,250"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
            <path
              d="M0,200 C50,200 50,350 100,350"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            />
          </svg>
        </div>
      </div>

      <div className="flex items-center justify-center text-muted-foreground">
        <ArrowRight className="w-6 h-6 opacity-20" />
      </div>

      {/* Level 2: Arks */}
      <div className="flex flex-col justify-center gap-4 h-full w-1/3 min-w-[250px]">
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 text-center">
          Active Arks
        </h4>
        {data.arks.map((ark) => (
          <div
            key={ark.id}
            className="relative p-4 rounded-xl border border-border bg-white hover:border-primary/50 transition-all cursor-pointer group hover:shadow-lg"
          >
            <div className="flex justify-between items-center mb-1">
              <span className="font-bold text-foreground">{ark.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${ark.color} text-white`}>
                {ark.percentage}%
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              ${(ark.value / 1000000).toFixed(2)}M
            </div>
            <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${ark.color}`} />
          </div>
        ))}
      </div>

      <div className="flex items-center justify-center text-muted-foreground">
        <ArrowRight className="w-6 h-6 opacity-20" />
      </div>

      {/* Level 3: Collateral */}
      <div className="flex flex-col justify-center gap-3 h-full w-1/3 min-w-[250px]">
        <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 text-center">
          Underlying Collateral
        </h4>
        {data.collateral.map((item) => (
          <div
            key={item.id}
            className="flex items-center p-3 rounded-xl bg-muted/50 border border-transparent hover:border-border transition-colors"
          >
            <div
              className={`w-8 h-8 rounded-lg ${item.color} flex items-center justify-center text-white text-xs font-bold shadow-sm mr-3`}
            >
              {item.name.substring(0, 2)}
            </div>
            <div className="flex-1">
              <div className="font-medium text-sm">{item.name}</div>
              <div className="text-xs text-muted-foreground">LTV Risk: {item.value}%</div>
            </div>
            <div className="text-sm font-bold">{item.percentage}%</div>
          </div>
        ))}
      </div>
    </div>
  )
}
