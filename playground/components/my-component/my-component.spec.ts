import { expect, it } from 'vitest'
import './my-component'

it('should render', () => {
  const element = document.createElement('my-component')
  element.first = 'Stencil'
  element.last = 'JS'
  document.body.append(element)

  expect(element).toBeDefined()
})
