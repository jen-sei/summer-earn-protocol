import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { NETWORKS } from '@/config/networks'
import { FleetSummary } from '@/hooks/use-real-protocol-data'

interface ProtocolSelectorsProps {
  selectedNetworkId: number
  onNetworkChange: (chainId: number) => void
  fleets: FleetSummary[]
  selectedFleetId?: string
  onFleetChange: (fleetId: string) => void
}

export function ProtocolSelectors({
  selectedNetworkId,
  onNetworkChange,
  fleets,
  selectedFleetId,
  onFleetChange,
}: ProtocolSelectorsProps) {
  return (
    <div className="flex gap-4">
      <div className="w-[200px]">
        <label className="text-sm text-muted-foreground mb-1 block">Network</label>
        <Select
          value={selectedNetworkId.toString()}
          onValueChange={(val) => onNetworkChange(Number(val))}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Network" />
          </SelectTrigger>
          <SelectContent>
            {Object.values(NETWORKS).map((network) => (
              <SelectItem key={network.chain.id} value={network.chain.id.toString()}>
                {network.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-[250px]">
        <label className="text-sm text-muted-foreground mb-1 block">Fleet</label>
        <Select
          value={selectedFleetId}
          onValueChange={onFleetChange}
          disabled={fleets.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder={fleets.length === 0 ? 'No fleets found' : 'Select Fleet'} />
          </SelectTrigger>
          <SelectContent>
            {fleets.map((fleet) => (
              <SelectItem key={fleet.id} value={fleet.id}>
                {fleet.name || 'Unnamed Fleet'} ({fleet.inputToken.symbol})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
