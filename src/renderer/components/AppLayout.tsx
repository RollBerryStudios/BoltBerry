import { useUIStore } from '../stores/uiStore'
import { Toolbar } from './toolbar/Toolbar'
import { LeftSidebar } from './sidebar/LeftSidebar'
import { RightSidebar } from './sidebar/RightSidebar'
import { CanvasArea } from './canvas/CanvasArea'
import { StatusBar } from './StatusBar'
import { ErrorBoundary } from './ErrorBoundary'
import { Resizer } from './shared/Resizer'
import { FloatingUtilityDock } from './FloatingUtilityDock'

export function AppLayout() {
  const leftSidebarOpen = useUIStore((s) => s.leftSidebarOpen)
  const rightSidebarOpen = useUIStore((s) => s.rightSidebarOpen)
  const leftSidebarWidth = useUIStore((s) => s.leftSidebarWidth)
  const rightSidebarWidth = useUIStore((s) => s.rightSidebarWidth)
  const setLeftSidebarWidth = useUIStore((s) => s.setLeftSidebarWidth)
  const setRightSidebarWidth = useUIStore((s) => s.setRightSidebarWidth)

  // Grid columns: [left sidebar] [left resizer] [canvas] [right resizer] [right sidebar]
  // Resizers are 4px when the sidebar is open, 0px when closed.
  const leftCol = leftSidebarOpen ? `${leftSidebarWidth}px` : '0px'
  const rightCol = rightSidebarOpen ? `${rightSidebarWidth}px` : '0px'
  const leftHandleCol = leftSidebarOpen ? '4px' : '0px'
  const rightHandleCol = rightSidebarOpen ? '4px' : '0px'

  return (
    <div
      className="app-layout app-layout-resizable"
      style={{
        gridTemplateColumns: `${leftCol} ${leftHandleCol} 1fr ${rightHandleCol} ${rightCol}`,
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

      {leftSidebarOpen && (
        <Resizer
          side="left"
          width={leftSidebarWidth}
          onResize={setLeftSidebarWidth}
          label="Linke Seitenleiste anpassen"
        />
      )}

      <ErrorBoundary label="Canvas">
        <CanvasArea />
      </ErrorBoundary>

      {rightSidebarOpen && (
        <Resizer
          side="right"
          width={rightSidebarWidth}
          onResize={setRightSidebarWidth}
          label="Rechte Seitenleiste anpassen"
        />
      )}

      {rightSidebarOpen && (
        <ErrorBoundary label="Rechte Sidebar">
          <RightSidebar />
        </ErrorBoundary>
      )}

      <ErrorBoundary label="Statusbar">
        <StatusBar />
      </ErrorBoundary>

      <ErrorBoundary label="Utility Dock">
        <FloatingUtilityDock />
      </ErrorBoundary>
    </div>
  )
}
