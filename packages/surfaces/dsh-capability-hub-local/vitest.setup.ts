// React 18 act() requires the act-environment flag; without it every act call
// in component tests warns into CI output.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

export {}
