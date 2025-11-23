import { ArrowUpRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { ArkMetric } from '@/lib/types'

interface ArkListProps {
  arks: ArkMetric[]
}

export function ArkList({ arks }: ArkListProps) {
  return (
    <div className="bg-white rounded-3xl border border-border overflow-hidden">
      <div className="p-6 border-b border-border flex items-center justify-between">
        <h3 className="text-lg font-bold">Active Arks & Strategies</h3>
        <Button variant="outline" size="sm" className="rounded-full bg-transparent">
          Manage
        </Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left py-4 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Strategy Name
              </th>
              <th className="text-right py-4 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Allocated
              </th>
              <th className="text-right py-4 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Weight
              </th>
              <th className="text-right py-4 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                APY
              </th>
              <th className="text-center py-4 px-6 text-xs font-bold text-muted-foreground uppercase tracking-wider">
                Status
              </th>
              <th className="py-4 px-6"></th>
            </tr>
          </thead>
          <tbody>
            {arks.map((ark) => (
              <tr
                key={ark.id}
                className="border-b border-border/50 hover:bg-muted/20 transition-colors group"
              >
                <td className="py-4 px-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                      {ark.name.substring(0, 1)}
                    </div>
                    <div>
                      <div className="font-bold text-foreground">{ark.name}</div>
                      <div className="text-xs text-muted-foreground">Morpho Blue Market</div>
                    </div>
                  </div>
                </td>
                <td className="py-4 px-6 text-right font-medium">
                  ${(ark.allocation / 1000000).toFixed(2)}M
                </td>
                <td className="py-4 px-6 text-right text-muted-foreground">{ark.weight}%</td>
                <td className="py-4 px-6 text-right font-bold text-green-600">{ark.apy}%</td>
                <td className="py-4 px-6 text-center">
                  <Badge
                    variant={ark.status === 'active' ? 'default' : 'secondary'}
                    className="rounded-full capitalize"
                  >
                    {ark.status}
                  </Badge>
                </td>
                <td className="py-4 px-6 text-right">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <ArrowUpRight className="w-4 h-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
