import type React from 'react'
import Link from 'next/link'
import { LayoutDashboard, PieChart, Activity, Settings, LogOut, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 border-r border-border bg-white/50 backdrop-blur-xl hidden md:flex flex-col z-50">
      <div className="p-6 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <span className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
          Lazy Summer
        </span>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2">
        <NavItem
          href="/dashboard"
          icon={<LayoutDashboard className="w-5 h-5" />}
          label="Overview"
          active
        />
        <NavItem
          href="/dashboard/arks"
          icon={<Activity className="w-5 h-5" />}
          label="Arks & Strategies"
        />
        <NavItem
          href="/dashboard/risk"
          icon={<PieChart className="w-5 h-5" />}
          label="Risk Analysis"
        />
        <NavItem
          href="/dashboard/settings"
          icon={<Settings className="w-5 h-5" />}
          label="Settings"
        />
      </nav>

      <div className="p-4 border-t border-border/50">
        <Button
          variant="ghost"
          className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <LogOut className="w-5 h-5 mr-3" />
          Disconnect
        </Button>
      </div>
    </aside>
  )
}

function NavItem({
  href,
  icon,
  label,
  active,
}: {
  href: string
  icon: React.ReactNode
  label: string
  active?: boolean
}) {
  return (
    <Link href={href}>
      <div
        className={`flex items-center px-4 py-3 rounded-xl transition-all ${
          active
            ? 'bg-primary/10 text-primary font-medium'
            : 'text-muted-foreground hover:bg-muted hover:text-foreground'
        }`}
      >
        {icon}
        <span className="ml-3">{label}</span>
      </div>
    </Link>
  )
}
