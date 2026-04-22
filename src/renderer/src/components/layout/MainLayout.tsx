import { Outlet } from 'react-router-dom'
import { AppSidebar } from './AppSidebar'

export function MainLayout(): JSX.Element {
  return (
    <div className="flex h-screen">
      <AppSidebar />
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
