import { MotionConfig } from 'motion/react'
import { AskButton, IslandScreen } from './island/IslandScreen'
import { MockPage } from './island/MockPage'
import { mock } from './island/api'

// One renderer, three windows: #island (the pill / card / full-screen animation), #ask (the Ask
// button next to the cursor). In a plain browser (`npm run ui`) a mock page hosts both.
export function App() {
  const hash = window.location.hash
  if (hash === '#ask') {
    return (
      <div className="flex h-full items-start p-1.5">
        <AskButton />
      </div>
    )
  }
  return <MotionConfig reducedMotion="user">{mock ? <MockPage mock={mock} /> : <IslandScreen />}</MotionConfig>
}
