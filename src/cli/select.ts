/**
 * Interactive list selector using arrow keys.
 *
 * Usage:
 *   const choice = await select('Pick one:', ['Option A', 'Option B', 'Option C'])
 *   // Returns the selected index (0-based), or -1 if cancelled
 *
 * Keys:
 *   ↑ / k  — move up
 *   ↓ / j  — move down
 *   Enter  — confirm selection
 *   Ctrl+C — cancel (returns -1)
 */

import { createInterface, emitKeypressEvents } from 'node:readline'
import { stdin, stdout } from 'node:process'

// ─── ANSI ───────────────────────────────────────────────────
const ANSI = {
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  up: (n: number) => `\x1b[${n}A`,
  clearLine: '\x1b[2K\r',
  green: '\x1b[32m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
}

export async function select(
  prompt: string,
  choices: string[],
  descriptions?: string[],
): Promise<number> {
  return new Promise(resolve => {
    const isTTY = stdin.isTTY

    if (!isTTY || choices.length === 0) {
      fallbackSelect(prompt, choices).then(resolve)
      return
    }

    let selected = 0
    const total = choices.length
    const listHeight = total + 1 // prompt line + choice lines
    const rl = createInterface({ input: stdin, escapeCodeTimeout: 50 })
    let firstRender = true

    function render() {
      if (!firstRender) {
        // Move cursor up to the start of the rendered list
        stdout.write(ANSI.up(listHeight))
        // Clear all rendered lines
        for (let i = 0; i < listHeight; i++) {
          stdout.write(ANSI.clearLine)
          stdout.write('\n')
        }
        // Move back up to start position
        stdout.write(ANSI.up(listHeight))
      }
      firstRender = false

      // Render prompt line
      stdout.write(`${ANSI.dim}  ?${ANSI.reset} ${prompt}\n`)

      // Render choice lines
      for (let i = 0; i < total; i++) {
        const isSelected = i === selected
        const prefix = isSelected ? `${ANSI.green}❯${ANSI.reset}` : ' '
        const label = isSelected ? `${ANSI.bold}${choices[i]}${ANSI.reset}` : choices[i]
        const desc = descriptions?.[i] ? ` ${ANSI.dim}${descriptions[i]}${ANSI.reset}` : ''
        stdout.write(`  ${prefix} ${label}${desc}\n`)
      }
    }

    // Initial render
    stdout.write(ANSI.hideCursor)
    stdout.write('\n')
    render()

    function cleanup() {
      // Clear the selection UI
      stdout.write(ANSI.up(listHeight))
      for (let i = 0; i < listHeight; i++) {
        stdout.write(ANSI.clearLine)
        stdout.write('\n')
      }
      stdout.write(ANSI.up(listHeight))
      stdout.write(ANSI.clearLine)
      stdout.write(ANSI.showCursor)

      rl.close()
      stdin.removeAllListeners('keypress')
      if (stdin.isTTY) stdin.setRawMode(false)
    }

    emitKeypressEvents(stdin)
    if (stdin.isTTY) stdin.setRawMode(true)
    stdin.resume()

    stdin.on('keypress', (_str: string, key: { name: string; ctrl: boolean }) => {
      if (key.name === 'up' || key.name === 'k') {
        selected = selected > 0 ? selected - 1 : total - 1
        render()
      } else if (key.name === 'down' || key.name === 'j') {
        selected = selected < total - 1 ? selected + 1 : 0
        render()
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup()
        const desc = descriptions?.[selected] ? ` ${ANSI.dim}\u2014 ${descriptions[selected]}${ANSI.reset}` : ''
        stdout.write(`${ANSI.dim}  ?${ANSI.reset} ${prompt} ${ANSI.green}${choices[selected]}${ANSI.reset}${desc}\n`)
        resolve(selected)
      } else if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        cleanup()
        stdout.write(`${ANSI.dim}  ?${ANSI.reset} ${prompt} ${ANSI.dim}cancelled${ANSI.reset}\n`)
        resolve(-1)
      }
    })
  })
}

/** Fallback for non-TTY environments */
async function fallbackSelect(prompt: string, choices: string[]): Promise<number> {
  const rl = createInterface({ input: stdin, output: stdout })

  console.log(`\n  ${prompt}`)
  choices.forEach((c, i) => console.log(`  ${i + 1}. ${c}`))

  return new Promise(resolve => {
    rl.question(`\n  Enter number (1-${choices.length}): `, answer => {
      rl.close()
      const n = parseInt(answer.trim(), 10)
      if (n >= 1 && n <= choices.length) {
        console.log(`  ${ANSI.green}\u2713${ANSI.reset} ${choices[n - 1]}\n`)
        resolve(n - 1)
      } else {
        resolve(-1)
      }
    })
  })
}
