import Link from 'next/link'
import { ArrowRight, ShieldCheck, TrendingUp, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function Hero() {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-20">
      {/* Background Blobs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-secondary/20 rounded-full blur-3xl animate-pulse delay-1000" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/10 rounded-full blur-3xl" />

      <div className="container relative z-10 px-4 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-white/20 shadow-sm mb-8 animate-fade-in-up">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-medium text-foreground/80">
            Summer Earn Protocol Live on Mainnet
          </span>
        </div>

        <h1 className="text-6xl md:text-8xl font-black tracking-tight mb-6 bg-clip-text text-transparent bg-gradient-to-br from-foreground to-foreground/70 animate-fade-in-up delay-100">
          Yield Made <br />
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary via-purple-500 to-secondary">
            Lazy & Liquid
          </span>
        </h1>

        <p className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 animate-fade-in-up delay-200">
          Automated fleet management for your capital. Optimize yields across Morpho Blue with
          transparent risk analytics.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fade-in-up delay-300">
          <Link href="/dashboard">
            <Button
              size="lg"
              className="rounded-full text-lg h-14 px-8 bg-primary hover:bg-primary/90 shadow-xl shadow-primary/20 transition-transform hover:scale-105"
            >
              Enter Dashboard <ArrowRight className="ml-2 w-5 h-5" />
            </Button>
          </Link>
          <Button
            variant="outline"
            size="lg"
            className="rounded-full text-lg h-14 px-8 border-2 hover:bg-secondary/10 transition-colors bg-transparent"
          >
            Read Whitepaper
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 max-w-4xl mx-auto animate-fade-in-up delay-500">
          <div className="p-6 rounded-3xl bg-white/40 backdrop-blur-xl border border-white/20 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-blue-100 flex items-center justify-center mb-4 mx-auto">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">12.5%</div>
            <div className="text-sm text-muted-foreground">Historical APY</div>
          </div>
          <div className="p-6 rounded-3xl bg-white/40 backdrop-blur-xl border border-white/20 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-purple-100 flex items-center justify-center mb-4 mx-auto">
              <ShieldCheck className="w-6 h-6 text-purple-600" />
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">$12.5M</div>
            <div className="text-sm text-muted-foreground">Total Value Locked</div>
          </div>
          <div className="p-6 rounded-3xl bg-white/40 backdrop-blur-xl border border-white/20 shadow-xl">
            <div className="w-12 h-12 rounded-2xl bg-pink-100 flex items-center justify-center mb-4 mx-auto">
              <Sparkles className="w-6 h-6 text-pink-600" />
            </div>
            <div className="text-3xl font-bold text-foreground mb-1">Automated</div>
            <div className="text-sm text-muted-foreground">Risk Management</div>
          </div>
        </div>
      </div>
    </section>
  )
}
