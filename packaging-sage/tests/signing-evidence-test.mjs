import assert from 'node:assert/strict'

import { designatedRequirement } from '../scripts/signing-evidence.mjs'

// First-run correction (2026-10-10): `codesign -d -r-` writes the human-readable requirement to
// STDOUT; stderr carries only the executable header. The receipt path parsed stderr and observed
// zero requirements on every real signature — misread as "no implicit designated requirement".
// These cases pin the stream, the flag shape and the exactly-one rule against that regression.

function fakeRun({ status = 0, stdout = '', stderr = '' } = {}) {
  const calls = []
  const run = (command, args, options) => {
    calls.push({ command, args, options })
    return { status, stdout, stderr }
  }
  return { run, calls }
}

const app = '/tmp/sage-evidence-fixture/Sage.app'
const requirement = 'identifier "com.lute.sage" and certificate leaf = H"f969e12f746f89e6c5e525dd92881842b76e4a9c"'

const realShape = fakeRun({
  stdout: `designated => ${requirement}\n`,
  stderr: `Executable=${app}/Contents/MacOS/Sage\n`,
})
assert.equal(designatedRequirement(app, { run: realShape.run }), requirement)
assert.deepEqual(
  realShape.calls[0].args,
  ['-d', '-r-', app],
  'the dash form is what routes the requirement to stdout',
)

const stderrOnly = fakeRun({
  stdout: '',
  stderr: `Executable=${app}/Contents/MacOS/Sage\ndesignated => ${requirement}\n`,
})
assert.throws(() => designatedRequirement(app, { run: stderrOnly.run }), /observed 0/)

const doubled = fakeRun({ stdout: `designated => ${requirement}\ndesignated => ${requirement}\n` })
assert.throws(() => designatedRequirement(app, { run: doubled.run }), /observed 2/)

const empty = fakeRun({ stdout: 'designated => \n' })
assert.throws(() => designatedRequirement(app, { run: empty.run }), /invalid designated requirement/)

const failed = fakeRun({ status: 1, stderr: 'code object is not signed at all\n' })
assert.throws(() => designatedRequirement(app, { run: failed.run }), /could not read the designated requirement/)

process.stdout.write('[sage-packaging] signing evidence reads the designated requirement from stdout\n')
