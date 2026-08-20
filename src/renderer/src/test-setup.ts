import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Explicit, because auto-cleanup only registers when the globals happen to be
// in place — and a leaked container turns every `getBy*` into "found multiple".
afterEach(cleanup)
