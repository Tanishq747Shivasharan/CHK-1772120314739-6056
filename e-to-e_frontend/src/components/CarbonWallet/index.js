// Auto-import shared styles so consumers don't need to import CSS separately
import './carbonWallet.css'

// Named exports — preferred usage
export { default as CarbonWallet } from './CarbonWallet'
export { default as CarbonConversionAnimation } from './CarbonConversionAnimation'

// Default export → CarbonWallet (the primary component)
export { default } from './CarbonWallet'
