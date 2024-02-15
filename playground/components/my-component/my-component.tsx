import { Component, Prop, h } from '@stencil/core'
import { format } from '../../utils/utils.js'

@Component({
  tag: 'my-component',
  // styleUrl: 'my-component.css',
  shadow: true,
})
export class MyComponent {
  /**
   * The first name
   */
  @Prop() first: string

  /**
   * The middle name
   */
  @Prop() middle: string

  /**
   * The last name
   */
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
