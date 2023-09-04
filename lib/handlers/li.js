/**
 * @typedef {import('hast').Element} Element
 *
 * @typedef {import('mdast').ListItem} ListItem
 *
 * @typedef {import('../state.js').State} State
 */

import {phrasing} from 'hast-util-phrasing'

/**
 * @param {State} state
 *   State.
 * @param {Readonly<Element>} node
 *   hast element to transform.
 * @returns {ListItem}
 *   mdast node.
 */
export function li(state, node) {
  const {checked, clone} = extractLeadingCheckbox(node)

  const spread = spreadout(clone)
  const children = state.toFlow(state.all(clone))

  /** @type {ListItem} */
  const result = {type: 'listItem', spread, checked, children}
  state.patch(clone, result)
  return result
}

/**
 * Check if an element should spread out.
 *
 * The reason to spread out a markdown list item is primarily whether writing
 * the equivalent in markdown, would yield a spread out item.
 *
 * A spread out item results in `<p>` and `</p>` tags.
 * Otherwise, the phrasing would be output directly.
 * We can check for that: if there’s a `<p>` element, spread it out.
 *
 * But what if there are no paragraphs?
 * In that case, we can also assume that if two “block” things were written in
 * an item, that it is spread out, because blocks are typically joined by blank
 * lines, which also means a spread item.
 *
 * Lastly, because in HTML things can be wrapped in a `<div>` or similar, we
 * delve into non-phrasing elements here to figure out if they themselves
 * contain paragraphs or 2 or more flow non-phrasing elements.
 *
 * @param {Readonly<Element>} node
 * @returns {boolean}
 */
function spreadout(node) {
  let index = -1
  let seenFlow = false

  while (++index < node.children.length) {
    const child = node.children[index]

    if (child.type === 'element') {
      if (phrasing(child)) continue

      if (child.tagName === 'p' || seenFlow || spreadout(child)) {
        return true
      }

      seenFlow = true
    }
  }

  return false
}

/**
 * If the node's content begins with a checkbox (which could be nested at the
 * start of some other structural nodes like `<p>` or `<strong>`), make a clone
 * with the checkbox removed. Returns an object with the checkbox's state and
 * the cloned tree.
 * @param {Readonly<Element>} node
 * @returns {{checked: Boolean?, clone: Element}}
 */
function extractLeadingCheckbox(node) {
  /** @type {Element} */
  let clone = node
  /** @type {Boolean?} */
  let checked = null
  /** @type {Element[]} */
  const parents = [node]

  while (parents[0].children) {
    const candidate = parents[0].children[0]
    if (
      candidate &&
      candidate.type === 'element' &&
      candidate.tagName === 'input' &&
      candidate.properties &&
      (candidate.properties.type === 'checkbox' ||
        candidate.properties.type === 'radio')
    ) {
      checked = Boolean(candidate.properties.checked)

      // Create a new tree from the checkbox's parent up to the node we started
      // from, but that does not include the checkbox.
      for (const parent of parents) {
        const children = parent.children.slice(1)
        if (clone !== node) {
          children.unshift(clone)
        } else if (children[0].type === 'text') {
          // Clean up any leading whitespace in text that follows the checkbox.
          const newValue = children[0].value.trimStart()
          if (newValue) {
            children[0] = {...children[0], value: newValue}
          } else {
            children.shift()
          }
        }

        clone = {
          ...parent,
          children
        }
      }

      break
    } else if (
      candidate &&
      candidate.type === 'element' &&
      // Technically, this allows some weird trees where a specialized phrasing
      // element like `<video>` or `<iframe>` contains a checkbox. We don't
      // check for these cases since it's not particularly harmful and also
      // means the tree we're working with isn't valid in the first place.
      (candidate.tagName === 'p' || phrasing(candidate))
    ) {
      parents.unshift(candidate)
      continue
    } else {
      break
    }
  }

  return {checked, clone}
}
