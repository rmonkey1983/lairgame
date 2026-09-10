import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const requiredInputs = ['STAFF_EMAIL', 'STAFF_PASSWORD', 'STAFF_DISPLAY_NAME']

function fail(message) {
  process.stderr.write(`create-local-staff: ${message}\n`)
  process.exitCode = 1
}

const missing = requiredInputs.filter((name) => !process.env[name]?.trim())
if (missing.length > 0) {
  fail(`missing environment input: ${missing.join(', ')}`)
} else if (process.env.STAFF_PASSWORD.length < 6) {
  fail('STAFF_PASSWORD must contain at least 6 characters')
} else {
  await provisionStaff()
}

async function provisionStaff() {
  let runtime
  try {
    runtime = JSON.parse(execFileSync('npx', ['supabase', 'status', '-o', 'json'], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }))
  } catch {
    fail('cannot read local Supabase runtime configuration')
    return
  }

  const apiUrl = runtime.API_URL
  const secretKey = runtime.SECRET_KEY
  let host
  try { host = new URL(apiUrl).hostname } catch { host = '' }
  if (!secretKey || !apiUrl || !['127.0.0.1', 'localhost'].includes(host)) {
    fail('refusing non-local Supabase target')
    return
  }

  const admin = createClient(apiUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const email = process.env.STAFF_EMAIL.trim().toLowerCase()
  const displayName = process.env.STAFF_DISPLAY_NAME.trim()
  const existing = await findUser(admin, email)
  let user = existing

  if (user) {
    const result = await admin.auth.admin.updateUserById(user.id, { password: process.env.STAFF_PASSWORD, email_confirm: true })
    if (result.error) return fail('cannot update local Staff user')
    user = result.data.user
  } else {
    const result = await admin.auth.admin.createUser({ email, password: process.env.STAFF_PASSWORD, email_confirm: true })
    if (result.error) {
      user = await findUser(admin, email)
      if (!user) return fail('cannot create local Staff user')
    } else {
      user = result.data.user
    }
  }

  const membership = await admin.from('staff_members').upsert({
    auth_user_id: user.id,
    display_name: displayName,
    active: true,
  }, { onConflict: 'auth_user_id' }).select('id').single()
  if (membership.error) return fail('cannot ensure local Staff membership')
  process.stdout.write(`Local Staff ready: ${email}\n`)
}

async function findUser(admin, email) {
  for (let page = 1; page <= 100; page += 1) {
    const result = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (result.error) return null
    const user = result.data.users.find((candidate) => candidate.email?.toLowerCase() === email)
    if (user) return user
    if (result.data.users.length < 1000) return null
  }
  return null
}
