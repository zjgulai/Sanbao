'use strict'

const { contextBridge, ipcRenderer } = require('electron')

const READ_CHANNEL = 'sage-ipc-caller-binding:read-projection'
const BEGIN_CHANNEL = 'sage-ipc-caller-binding:begin-operation'
const CANCEL_CHANNEL = 'sage-ipc-caller-binding:cancel-operation'
const CASE_ID = /^[a-z][a-z0-9-]{0,95}$/u
const OPERATION_REF = /^probe-operation-[1-9][0-9]*$/u

function requireCaseId(value) {
  if (typeof value !== 'string' || !CASE_ID.test(value)) {
    throw new TypeError('invalid IPC caller-binding probe case id')
  }
  return value
}

function requireOperationRef(value) {
  if (typeof value !== 'string' || !OPERATION_REF.test(value)) {
    throw new TypeError('invalid IPC caller-binding probe operation reference')
  }
  return value
}

// The bridge is deliberately absent from subframes. The main process still validates
// senderFrame on every message; this preload guard only narrows the exposed surface.
if (process.isMainFrame) {
  contextBridge.exposeInMainWorld('sageIpcProbe', Object.freeze({
    readProjection: (caseId) => ipcRenderer.invoke(READ_CHANNEL, {
      caseId: requireCaseId(caseId),
    }),
    beginOperation: (caseId) => ipcRenderer.invoke(BEGIN_CHANNEL, {
      caseId: requireCaseId(caseId),
      // This probe-only negative control proves the main handler rejects an
      // otherwise-valid request carrying an unrecognised field.
      ...(caseId === 'forged-extra-field' ? { forged: true } : {}),
    }),
    cancelOperation: (operationRef) => ipcRenderer.invoke(CANCEL_CHANNEL, {
      operationRef: requireOperationRef(operationRef),
    }),
  }))
} else {
  // A dedicated probe-only BrowserWindow enables preload execution in subframes so
  // the main-process senderFrame guard is exercised with a real IPC message. Nothing
  // is exposed into the subframe's main world.
  void ipcRenderer.invoke(BEGIN_CHANNEL, { caseId: 'subframe-internal-attempt' }).catch(() => {})
}
