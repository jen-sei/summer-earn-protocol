import type React from 'react'
import { Anchor, BarChart3, Layers } from 'lucide-react'

export function Features() {
  return (
    <section id="features" className="py-24 bg-gradient-to-b from-transparent to-white/50">
      <div className="container px-4">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-4xl md:text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-primary to-purple-600">
            The Fleet Architecture
          </h2>
          <p className="text-xl text-muted-foreground">
            Our protocol decomposes risk into manageable layers, giving you full transparency from
            Fleet to Collateral.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <FeatureCard
            icon={<Anchor className="w-8 h-8 text-white" />}
            title="Fleet Commander"
            description="The central coordinator that manages liquidity across multiple strategies. Your single entry point to diversified yield."
            color="bg-primary"
          />
          <FeatureCard
            icon={<Layers className="w-8 h-8 text-white" />}
            title="Strategic Arks"
            description="Specialized vaults deploying capital into specific Morpho markets. Isolated risk containers for maximum safety."
            color="bg-purple-500"
          />
          <FeatureCard
            icon={<BarChart3 className="w-8 h-8 text-white" />}
            title="Transparent Risk"
            description="Peel back the layers. See exactly what collateral backs your yield with our real-time transparency dashboard."
            color="bg-blue-500"
          />
        </div>
      </div>
    </section>
  )
}

function FeatureCard({
  icon,
  title,
  description,
  color,
}: {
  icon: React.ReactNode
  title: string
  description: string
  color: string
}) {
  return (
    <div className="group relative p-8 rounded-[2rem] bg-white border border-white/20 shadow-lg hover:shadow-xl transition-all hover:-translate-y-1">
      <div
        className={`absolute inset-0 opacity-0 group-hover:opacity-5 transition-opacity duration-500 ${color} rounded-[2rem]`}
      />
      <div
        className={`w-16 h-16 rounded-2xl ${color} shadow-lg shadow-${color.replace('bg-', '')}/30 flex items-center justify-center mb-6 transform group-hover:scale-110 transition-transform duration-300`}
      >
        {icon}
      </div>
      <h3 className="text-2xl font-bold mb-4">{title}</h3>
      <p className="text-muted-foreground leading-relaxed">{description}</p>
    </div>
  )
}
