// eslint-disable-next-line unused-imports/no-unused-imports
import { Component, Prop, h } from '@stencil/core'
import { format } from '../../utils/utils.js'

@Component({
  tag: 'my-component',
  styleUrl: 'my-component.css',
  shadow: true,
})
export class MyComponent {
  /**
   * The first name
   */
  // @ts-expect-error ignore 🤷
  @Prop() first: string

  /**
   * The middle name
   */
  // @ts-expect-error ignore 🤷
  @Prop() middle: string

  /**
   * The last name
   */
  // @ts-expect-error ignore 🤷
  @Prop() last: string

  private getText(): string {
    return (
      <span>{format(this.first, this.middle, this.last)}</span>
    )
  }

  render() {
    return (
      <div>
        Hello, World! I'm
        {' '}
        {this.getText()}
      </div>
    )
  }
}
