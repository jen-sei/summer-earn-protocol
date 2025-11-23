'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#FF69B4', '#9D00FF', '#00FFFF', '#FF9F43', '#4DEEEA']

interface CompositionChartProps {
  data: any[]
}

export function CompositionChart({ data }: CompositionChartProps) {
  return (
    <div className="w-full h-[400px] bg-white rounded-3xl border border-border p-6 flex flex-col">
      <h3 className="text-lg font-bold mb-4">Risk Composition</h3>
      <div className="flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={60}
              outerRadius={100}
              fill="#8884d8"
              paddingAngle={5}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Pie
              data={data} // In a real app, this would be the deeper drilldown data
              dataKey="value"
              cx="50%"
              cy="50%"
              innerRadius={110}
              outerRadius={140}
              fill="#82ca9d"
              opacity={0.6}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-outer-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: '1rem',
                border: 'none',
                boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)',
              }}
              itemStyle={{ color: '#666' }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {data.map((item: any, index: number) => (
          <div key={item.name} className="flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            />
            <span className="text-sm text-muted-foreground">{item.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
