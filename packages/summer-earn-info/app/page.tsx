import { Navbar } from '@/components/landing/navbar'
import { Hero } from '@/components/landing/hero'
import { Features } from '@/components/landing/features'

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-background selection:bg-primary/20">
      <Navbar />
      <Hero />
      <Features />

      {/* Simple Footer */}
      <footer className="py-12 border-t border-black/5 bg-white/30 backdrop-blur-sm text-center">
        <p className="text-muted-foreground">
          © 2025 Lazy Summer Protocol. Built for the future of DeFi.
        </p>
      </footer>
    </main>
  )
}
