import { Bell, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function Header() {
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 bg-white/50 backdrop-blur-xl border-b border-border">
      <div className="flex items-center gap-4 w-full max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search assets, arks, or markets..."
            className="w-full h-10 pl-10 pr-4 rounded-full bg-white/50 border border-border focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Button size="icon" variant="ghost" className="rounded-full">
          <Bell className="w-5 h-5 text-muted-foreground" />
        </Button>
        <div className="flex items-center gap-3 pl-4 border-l border-border">
          <div className="text-right hidden sm:block">
            <div className="text-sm font-medium">0x1234...5678</div>
            <div className="text-xs text-muted-foreground">Connected</div>
          </div>
          <Avatar className="h-10 w-10 border-2 border-white shadow-sm">
            <AvatarImage src="/placeholder.svg" />
            <AvatarFallback className="bg-gradient-to-br from-primary to-purple-500 text-white">
              LS
            </AvatarFallback>
          </Avatar>
        </div>
      </div>
    </header>
  )
}
