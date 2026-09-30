'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const READ_CHANNEL = 'sage-single-frame:read-projection'
const BEGIN_CHANNEL = 'sage-single-frame:begin-operation'
const CASE_ID = /^[a-z][a-z0-9-]{0,95}$/u

function requireCaseId(value) {
  if (typeof value !== 'string' || !CASE_ID.test(value)) {
    throw new TypeError('invalid single-frame probe case id')
  }
  return value
}

// The bridge stays deliberately narrow and exists only in the top preload realm.
// The main process independently validates the sender and its document generation;
// this guard is surface reduction, not caller authority.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('sageSingleFrameProbe', Object.freeze({
    readProjection: (caseId) => ipcRenderer.invoke(READ_CHANNEL, {
      caseId: requireCaseId(caseId),
    }),
    beginOperation: (caseId) => ipcRenderer.invoke(BEGIN_CHANNEL, {
      caseId: requireCaseId(caseId),
    }),
  }))
}
