import React, { h } from 'react'
import ReactDOM from 'react-dom/client'

import { MyComponent } from './src/index.js'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MyComponent first="I am a React Component" last="it's true"></MyComponent>
  </React.StrictMode>,
)
