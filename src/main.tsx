import { render } from 'preact'
import { App } from './App'
import { applyTheme } from './theme/applyTheme'
import { hydratePreferences, themeId } from './state'
import './styles.css'

async function bootstrap() {
  try {
    await hydratePreferences()
  } catch {
    await applyTheme(themeId.value)
  }
  render(<App />, document.getElementById('app')!)
}

void bootstrap()
