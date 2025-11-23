import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Sparkles } from 'lucide-react'

export function Navbar() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-6 py-4 bg-background/50 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center gap-2">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-lg shadow-primary/20">
          <Sparkles className="w-6 h-6 text-white" />
        </div>
        <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
          Lazy Summer
        </span>
      </div>

      <nav className="hidden md:flex items-center gap-8">
        <Link
          href="#features"
          className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
        >
          Protocol
        </Link>
        <Link
          href="#risk"
          className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
        >
          Risk Engine
        </Link>
        <Link
          href="#community"
          className="text-sm font-medium text-muted-foreground hover:text-primary transition-colors"
        >
          Community
        </Link>
      </nav>

      <div className="flex items-center gap-4">
        <Link href="/dashboard">
          <Button className="rounded-full bg-primary hover:bg-primary/90 text-white shadow-lg shadow-primary/25 px-6">
            Launch App
          </Button>
        </Link>
      </div>
    </header>
  )
}
