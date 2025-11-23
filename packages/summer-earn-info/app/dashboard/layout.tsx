import type React from 'react'
import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Sidebar />
      <div className="md:ml-64 min-h-screen flex flex-col">
        <Header />
        <main className="flex-1 p-6 md:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}
