'use strict'

const Tape = require('tape')
const Qwen = require('../../lib/qwen')

Tape('Blank unit test', (test) => {
  test.plan(1)

  Qwen()
  test.ok(true)
})
