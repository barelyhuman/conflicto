import { render } from 'preact'
import { App } from './App'
import { applyTheme } from './theme/applyTheme'
import { themeId } from './state'
import './styles.css'

void applyTheme(themeId.value)

render(<App />, document.getElementById('app')!)
