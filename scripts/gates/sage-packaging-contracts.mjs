import {
  SAGE_PACKAGING_CONTRACT_TESTS,
  SAGE_PACKAGING_EXPECTED_TEST_COUNT,
  inspectSagePackagingTestManifest,
  validateSagePackagingTestManifest,
} from '../../packaging-sage/tests/test-manifest.mjs'

export {
  SAGE_PACKAGING_CONTRACT_TESTS,
  SAGE_PACKAGING_EXPECTED_TEST_COUNT,
  inspectSagePackagingTestManifest,
  validateSagePackagingTestManifest,
}

export const SAGE_PACKAGING_PURE_TEST_COUNT = SAGE_PACKAGING_CONTRACT_TESTS
  .filter(entry => entry.layer === 'pure').length

export function checkSagePackagingContractManifest(repoRoot, options = {}) {
  const inspection = inspectSagePackagingTestManifest(repoRoot, options)
  const passed = inspection.issues.length === 0
  return {
    status: passed ? 'pass' : 'fail',
    expected: SAGE_PACKAGING_EXPECTED_TEST_COUNT,
    discovered: inspection.discovered.length,
    checked: passed ? SAGE_PACKAGING_EXPECTED_TEST_COUNT : 0,
    skipped: 0,
    failed: passed ? 0 : SAGE_PACKAGING_EXPECTED_TEST_COUNT,
    typedSkips: [],
    reason: passed
      ? `Sage packaging 测试分母 ${SAGE_PACKAGING_EXPECTED_TEST_COUNT}/${SAGE_PACKAGING_EXPECTED_TEST_COUNT} 完整且均已分层`
      : `Sage packaging 测试分母不完整：${inspection.issues.length} 处`,
    violations: inspection.issues,
    note: `layers pure=${inspection.layers.pure}, platform=${inspection.layers.platform}, input=${inspection.layers.input}, live=${inspection.layers.live}`,
  }
}

