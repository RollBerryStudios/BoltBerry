import { useUIStore } from '../stores/uiStore'
import { Toolbar } from './toolbar/Toolbar'
import { LeftSidebar } from './sidebar/LeftSidebar'
import { RightSidebar } from './sidebar/RightSidebar'
import { CanvasArea } from './canvas/CanvasArea'
import { StatusBar } from './StatusBar'
import { ErrorBoundary } from './ErrorBoundary'
import clsx from 'clsx'

export function AppLayout() {
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen)
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)

  return (
    <div
      className="app-layout"
      style={{
        gridTemplateColumns: `${leftSidebarOpen ? 'var(--sidebar-left)' : '0px'} 1fr ${rightSidebarOpen ? 'var(--sidebar-right)' : '0px'}`,
      }}
    >
      <ErrorBoundary label="Toolbar">
        <Toolbar />
      </ErrorBoundary>

      {leftSidebarOpen && (
        <ErrorBoundary label="Linke Sidebar">
          <LeftSidebar />
        </ErrorBoundary>
      )}

      <ErrorBoundary label="Canvas">
        <CanvasArea />
      </ErrorBoundary>

      {rightSidebarOpen && (
        <ErrorBoundary label="Rechte Sidebar">
          <RightSidebar />
        </ErrorBoundary>
      )}

      <ErrorBoundary label="Statusbar">
        <StatusBar />
      </ErrorBoundary>
    </div>
  )
}
