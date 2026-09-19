export function judgeBootAnimation({ name, duration, running, background, arcColor, accent }) {
  const violations = []
  if (!(name === 'spin' || /^_spin_[A-Za-z0-9_]+$/.test(name)) || !running) violations.push('启动动画必须为运行中的 spin')
  if (duration !== '2s') violations.push('启动 spin 时长必须为 2s')
  if (!background?.startsWith('conic-gradient(')) violations.push('启动进度弧必须使用 conic-gradient')
  const angle = Number(background?.match(/^conic-gradient\(rgba?\([^)]+\)\s+([\d.]+)deg,/)?.[1])
  if (!(angle >= 72 && angle <= 288)) violations.push('启动进度弧角度必须可见且位于 72–288deg')
  if (!arcColor || arcColor !== accent) violations.push('启动 conic 弧色必须等于品牌源 accent 解析值')
  return violations
}
