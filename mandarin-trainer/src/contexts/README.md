# Contexts Directory

React context providers for app-wide state.

## Files

| File | Purpose |
|------|---------|
| `AuthContext.jsx` | `AuthProvider` component — manages auth state, session, and credits |
| `authContextValue.js` | Creates the `AuthContext` React context object (initialized to `null`) |

## AuthContext

Wraps the entire app in `App.jsx`. Provides:

| Value | Type | Description |
|-------|------|-------------|
| `user` | object/null | Current Supabase auth user |
| `session` | object/null | Current Supabase session (contains access token) |
| `loading` | boolean | True while checking initial auth state |
| `credits` | number | User's credit balance in microdollars (1,000,000 = $1) |
| `signUp(email, password)` | function | Create account (triggers confirmation email) |
| `signIn(email, password)` | function | Log in with email + password |
| `signOut()` | function | End session |
| `getAccessToken()` | function | Returns current `session.access_token` for API calls |
| `refreshCredits()` | function | Re-fetches balance from `user_credits` table |

### How It Works
1. On mount: calls `supabase.auth.getSession()` + subscribes to `onAuthStateChange`
2. When user changes: fetches `user_credits` balance via `.maybeSingle()` with error handling
3. Consumed via `useAuth()` hook (see `src/hooks/useAuth.js`)
