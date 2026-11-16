import { render } from 'preact'
import { App } from './ui/App'
import { applyLocale, initialLocale } from './ui/util'
import './styles.css'

applyLocale(initialLocale())
render(<App />, document.getElementById('app')!)
