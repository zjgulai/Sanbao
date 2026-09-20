import { clientBundle } from './build/tsdown.client.ts'

export default clientBundle('dsh-qoder-sidebar-local', ['src/index.ts'], {
  libExternal: [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-runtime',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-host-webserver',
  ],
})
